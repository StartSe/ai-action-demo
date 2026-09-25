-- O preço que chega tarde: o que cron-cost-sync lê e onde ele escreve
-- (seção 4.6, T-20, P-07, R-01).
-- Referência: docs/PRD-implementacao.md seção 4.6, docs/revisao-tecnica.md
-- T-20 e P-07, migração 20260922060000_custo_da_chamada.sql.
--
-- A telefonia publica o preço da ligação minutos depois do fim, e a primeira
-- consulta pode voltar sem preço (P-07). `cron-cost-sync` roda a cada 15
-- minutos e busca o que faltou; o módulo portável
-- (`cron-cost-sync/custos.ts`) decide o que fazer com cada resposta, e esta
-- migração dá a ele o que ler e onde escrever. Quatro decisões:
--
-- 1. **O pendente é a ausência de linha, e a reivindicação é da rotina.**
--    Chamada encerrada, que chegou à telefonia (`provider_call_sid`), sem
--    parcela `telephony` em `call_costs` de informante nenhum, é pendente.
--    `cost_sync_claimed_at` é o que faz duas passagens sobrepostas (P-09)
--    pegarem chamadas diferentes, com `for update skip locked`, e o que faz a
--    fila girar: a ordem é "a olhada há mais tempo primeiro", então 30
--    chamadas sem preço não deixam as mesmas 25 na frente para sempre.
-- 2. **Preço nulo não vira linha** (L-05). A rotina só chama
--    `gravar_preco_tardio` quando há valor; quando não há, soma uma tentativa
--    em `cost_sync_attempts` e a chamada volta na passagem seguinte.
-- 3. **Nenhuma chamada é olhada para sempre (R-01).** Depois de 24 h do fim
--    sem preço, a rotina grava `cost_sync_gave_up_at` e a chamada sai da
--    reivindicação. A ficha continua mostrando o componente sem preço como
--    parcial — a desistência não inventa zero.
-- 4. **A escrita é idempotente pelo único de `call_costs`.**
--    `gravar_preco_tardio` é `on conflict (call_id, component, source) do
--    update`: o preço corrigido ATUALIZA a parcela, e o gatilho que refaz
--    `calls.cost_cents` por soma (nunca por delta) mantém o total certo. A
--    conta da parcela sai da chamada, não do argumento, para a parcela não
--    nascer sob a conta errada. `recorded_at` não muda na correção: é por ele
--    que o teto de gasto conta o dia, e mover a parcela de dia devolveria
--    orçamento a um dia já fechado.
--
-- Só `service_role` executa as duas funções: quem chama é a rotina, com a
-- chave de serviço.

-- A chamada na sincronização de preço ----------------------------------------
alter table public.calls
  add column cost_sync_claimed_at timestamptz,
  add column cost_sync_attempts integer not null default 0
    constraint calls_tentativas_de_preco check (cost_sync_attempts >= 0),
  add column cost_sync_gave_up_at timestamptz;

comment on column public.calls.cost_sync_claimed_at is
  'Quando cron-cost-sync tomou a chamada pela última vez, com for update skip locked. Ordena a fila: a olhada há mais tempo volta primeiro.';

comment on column public.calls.cost_sync_attempts is
  'Quantas consultas de preço da telefonia voltaram sem preço (P-07). Preço nulo na primeira consulta é caso normal, não erro.';

comment on column public.calls.cost_sync_gave_up_at is
  'Quando cron-cost-sync desistiu de buscar o preço da telefonia, 24 h depois do fim (R-01). Preenchida, a chamada sai da reivindicação e o componente continua sem parcela: a ficha o mostra como custo parcial, nunca como zero. O registro da desistência fica em job_runs, na linha da conta.';

-- A reivindicação --------------------------------------------------------------
create or replace function public.reivindicar_precos_tardios(
  p_limite integer,
  p_instante timestamptz
)
returns table (
  id uuid,
  account_id uuid,
  provider_call_sid text,
  ended_at timestamptz,
  cost_sync_attempts integer
)
language plpgsql
set search_path = ''
as $preco$
#variable_conflict use_column
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select c.id
        from public.calls as c
       where c.status in ('ended', 'failed')
         and c.ended_at is not null
         and c.provider_call_sid is not null
         and c.cost_sync_gave_up_at is null
         -- Dez minutos de folga: menos que a cadência de 15, para a passagem
         -- seguinte retomar, e mais que uma passagem, para a sobreposta não.
         and (c.cost_sync_claimed_at is null
              or c.cost_sync_claimed_at <= p_instante - interval '10 minutes')
         -- Parcela de telefonia de qualquer informante fecha o pendente: dois
         -- informantes do mesmo componente são duas medidas, mas a rotina só
         -- existe para o componente que ninguém mediu.
         and not exists (
           select 1
             from public.call_costs as k
            where k.call_id = c.id
              and k.component = 'telephony'
         )
       order by c.cost_sync_claimed_at nulls first, c.ended_at, c.id
       for update skip locked
       limit least(coalesce(p_limite, 0), 25)
    ),
    tomadas as (
      update public.calls as c
         set cost_sync_claimed_at = p_instante
        from alvo
       where c.id = alvo.id
      returning c.id, c.account_id, c.provider_call_sid, c.ended_at, c.cost_sync_attempts
    )
    select t.id, t.account_id, t.provider_call_sid, t.ended_at, t.cost_sync_attempts
      from tomadas as t
     order by t.ended_at, t.id;
end;
$preco$;

comment on function public.reivindicar_precos_tardios(integer, timestamptz) is
  'Toma até p_limite chamadas encerradas que chegaram à telefonia e ainda não têm parcela telephony em call_costs (T-20, P-07), com for update skip locked, e grava cost_sync_claimed_at. Não devolve a que desistiu nem a tomada há menos de 10 minutos. Só service_role.';

revoke execute on function public.reivindicar_precos_tardios(integer, timestamptz) from public;
grant execute on function public.reivindicar_precos_tardios(integer, timestamptz) to service_role;

-- A escrita do preço -----------------------------------------------------------
create or replace function public.gravar_preco_tardio(
  p_call_id uuid,
  p_component text,
  p_amount_cents integer,
  p_currency text,
  p_source text
)
returns void
language plpgsql
set search_path = ''
as $gravacao$
begin
  -- Os checks de `call_costs` (componente, valor, moeda, informante) são a
  -- rede; a conta vem da chamada, e chamada inexistente não grava nada.
  insert into public.call_costs (account_id, call_id, component, amount_cents, currency, source)
  select c.account_id, c.id, p_component, p_amount_cents, p_currency, p_source
    from public.calls as c
   where c.id = p_call_id
  on conflict (call_id, component, source) do update
     set amount_cents = excluded.amount_cents,
         currency = excluded.currency;
end;
$gravacao$;

comment on function public.gravar_preco_tardio(uuid, text, integer, text, text) is
  'Grava a parcela de custo que chegou tarde (T-20). on conflict (call_id, component, source) do update: rodar duas vezes não soma duas vezes em calls.cost_cents, e o preço corrigido atualiza a parcela. recorded_at fica o da primeira escrita, porque é por ele que o teto de gasto conta o dia. Só service_role.';

revoke execute on function public.gravar_preco_tardio(uuid, text, integer, text, text) from public;
grant execute on function public.gravar_preco_tardio(uuid, text, integer, text, text) to service_role;
