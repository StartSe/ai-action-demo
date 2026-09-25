-- O vigia de crédito e de cota: o que cron-credit-watch lê e onde ele registra
-- o aviso (seção 4.6, RF-612, L-24).
-- Referência: docs/PRD-implementacao.md seção 4.6, docs/revisao-tecnica.md
-- L-24, migração 20260921230000_politica_da_conta.sql (credit_alert_cents).
--
-- A cada 15 minutos a rotina pergunta a cada provedor da conta quanto crédito
-- e quanta cota sobram, pelo mesmo caminho da tela de integrações, e avisa
-- quem administra antes de acabar. O módulo portável
-- (`cron-credit-watch/credito.ts`) decide; esta migração dá a ele onde girar a
-- fila de contas e onde guardar o aviso. Três decisões:
--
-- 1. **Um aviso por queda, e o rearme é do servidor.** `provider_alerts` tem
--    uma linha por aviso, e o único parcial em (conta, provedor, tipo) onde
--    `rearmed_at` é nulo diz que só existe um aviso aberto por vez. Quatro
--    passagens com o crédito baixo encontram o aviso aberto e não escrevem
--    nada; o crédito que volta acima do limiar ganha `rearmed_at`, e só então
--    a próxima queda abre outro. Rearmar é `update`, nunca `delete`: a linha
--    responde depois quando o crédito caiu e quando voltou.
-- 2. **A fila de contas gira pela reivindicação.** `provider_watch` guarda
--    quando cada conta foi tomada pela última vez; com o teto de 25 por
--    passagem e ordem por "a olhada há mais tempo primeiro", nenhuma conta
--    fica para trás. A trava é na linha de `accounts` (`for no key update skip
--    locked`), porque conta nova ainda não tem linha em `provider_watch`, e
--    `no key` não disputa com a trava que toda chave estrangeira para
--    `accounts` toma ao inserir.
-- 3. **O item na fila de exceções não entra aqui.** `exception_items` é F4
--    (L-24). Em F2 o registro do aviso é `provider_alerts`, e é dele que a F4
--    vai partir; o ponto de extensão está declarado no módulo.
--
-- As duas tabelas são da classe Servidor: leitura por membro, nenhuma
-- política de escrita, e quem escreve é a rotina com a chave de serviço.

-- A fila de contas -----------------------------------------------------------
create table public.provider_watch (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  claimed_at timestamptz not null
);

comment on table public.provider_watch is
  'Quando cron-credit-watch tomou cada conta pela última vez (RF-612). Só retrato reescrito pela rotina: sem updated_at e fora da trilha. Conta sem linha nunca foi olhada, e vai primeiro.';

alter table public.provider_watch enable row level security;

create policy provider_watch_leitura_de_membro
  on public.provider_watch for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy provider_watch_leitura_de_membro on public.provider_watch is
  'Classe Servidor: membro lê, ninguém escreve pelo cliente. Quem grava é reivindicar_vigia_de_credito, pela chave de serviço.';

-- O aviso ----------------------------------------------------------------------
create table public.provider_alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null
    constraint provider_alerts_provedor
      check (provider in ('voz', 'telefonia', 'calendario', 'email')),
  kind text not null
    constraint provider_alerts_tipo
      check (kind in ('credito', 'cota')),
  message text not null
    constraint provider_alerts_frase
      check (btrim(message) <> ''),
  observed jsonb not null default '{}'::jsonb
    constraint provider_alerts_observado
      check (jsonb_typeof(observed) = 'object'),
  alerted_at timestamptz not null default now(),
  rearmed_at timestamptz,
  constraint provider_alerts_rearme_depois
    check (rearmed_at is null or rearmed_at >= alerted_at)
);

comment on table public.provider_alerts is
  'Aviso de crédito ou de cota de provedor (RF-612), um por queda abaixo do limiar. Aberto enquanto rearmed_at é nulo; o crédito que volta acima do limiar rearma o aviso, e só então a próxima queda abre outro. O item na fila de exceções é F4 (exception_items, L-24) e parte daqui.';

comment on column public.provider_alerts.provider is
  'O id do provedor no catálogo de integrations-status (provedores.ts), a mesma lista fechada.';

comment on column public.provider_alerts.message is
  'A frase em português que quem administra lê: qual provedor, quanto sobra e o que para de funcionar.';

comment on column public.provider_alerts.observed is
  'O que a rotina leu no provedor quando abriu o aviso: restante e unidade no crédito, em uso e limite na cota, e o limiar comparado. Nunca credencial.';

comment on column public.provider_alerts.rearmed_at is
  'Quando o provedor voltou acima do limiar. Nulo é aviso aberto. Provedor indisponível ou sem chave não rearma: não responder não é ter saldo de volta.';

create unique index provider_alerts_um_aberto
  on public.provider_alerts (account_id, provider, kind)
  where rearmed_at is null;

comment on index public.provider_alerts_um_aberto is
  'Um aviso aberto por conta, provedor e tipo. É a rede do "não repete a cada 15 minutos": duas passagens sobrepostas que leiam "sem aviso aberto" juntas colidem aqui, e a segunda não escreve.';

alter table public.provider_alerts enable row level security;

create policy provider_alerts_leitura_de_membro
  on public.provider_alerts for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy provider_alerts_leitura_de_membro on public.provider_alerts is
  'Classe Servidor: membro lê o aviso da própria conta, ninguém escreve pelo cliente. Quem abre e rearma é cron-credit-watch, pela chave de serviço.';

-- A reivindicação --------------------------------------------------------------
create or replace function public.reivindicar_vigia_de_credito(
  p_limite integer,
  p_instante timestamptz
)
returns table (
  account_id uuid,
  credit_alert_cents integer
)
language plpgsql
set search_path = ''
as $vigia$
#variable_conflict use_column
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select a.id
        from public.accounts as a
        left join public.provider_watch as w on w.account_id = a.id
       where a.status = 'active'
         -- Dez minutos de folga: menos que a cadência de 15, para a passagem
         -- seguinte retomar, e mais que uma passagem, para a sobreposta não.
         and (w.claimed_at is null or w.claimed_at <= p_instante - interval '10 minutes')
       order by w.claimed_at nulls first, a.id
       for no key update of a skip locked
       limit least(coalesce(p_limite, 0), 25)
    ),
    tomadas as (
      insert into public.provider_watch as w (account_id, claimed_at)
      select alvo.id, p_instante from alvo
      on conflict (account_id) do update set claimed_at = excluded.claimed_at
      returning w.account_id
    )
    select t.account_id, s.credit_alert_cents
      from tomadas as t
      left join public.account_settings as s on s.account_id = t.account_id
     order by t.account_id;
end;
$vigia$;

comment on function public.reivindicar_vigia_de_credito(integer, timestamptz) is
  'Toma até p_limite contas ativas que o vigia de crédito não olhou nos últimos 10 minutos, a olhada há mais tempo primeiro, com for no key update skip locked na linha de accounts, e grava provider_watch.claimed_at. Devolve o limiar de crédito da conta. Só service_role.';

revoke execute on function public.reivindicar_vigia_de_credito(integer, timestamptz) from public;
grant execute on function public.reivindicar_vigia_de_credito(integer, timestamptz) to service_role;

-- A abertura do aviso ----------------------------------------------------------
create or replace function public.abrir_aviso_de_provedor(
  p_account_id uuid,
  p_provider text,
  p_kind text,
  p_message text,
  p_observed jsonb,
  p_instante timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $aviso$
declare
  v_id uuid;
begin
  -- A inferência repete as colunas e o `where` do índice parcial, senão ela
  -- não casa. Voltou id, abriu; não voltou, já havia aviso aberto.
  insert into public.provider_alerts (account_id, provider, kind, message, observed, alerted_at)
  values (p_account_id, p_provider, p_kind, p_message, coalesce(p_observed, '{}'::jsonb), p_instante)
  on conflict (account_id, provider, kind) where rearmed_at is null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$aviso$;

comment on function public.abrir_aviso_de_provedor(uuid, text, text, text, jsonb, timestamptz) is
  'Abre o aviso de crédito ou de cota (RF-612). on conflict do nothing sobre provider_alerts_um_aberto: devolve verdadeiro quando abriu e falso quando já havia aviso aberto para a conta, o provedor e o tipo. Só service_role.';

revoke execute on function public.abrir_aviso_de_provedor(uuid, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.abrir_aviso_de_provedor(uuid, text, text, text, jsonb, timestamptz) to service_role;

-- O rearme ---------------------------------------------------------------------
create or replace function public.rearmar_aviso_de_provedor(
  p_account_id uuid,
  p_provider text,
  p_kind text,
  p_instante timestamptz
)
returns boolean
language plpgsql
set search_path = ''
as $rearme$
declare
  v_n integer;
begin
  update public.provider_alerts
     set rearmed_at = greatest(p_instante, alerted_at)
   where account_id = p_account_id
     and provider = p_provider
     and kind = p_kind
     and rearmed_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$rearme$;

comment on function public.rearmar_aviso_de_provedor(uuid, text, text, timestamptz) is
  'Rearma o aviso aberto quando o provedor volta acima do limiar (RF-612). Update, nunca delete: a linha guarda quando caiu e quando voltou. Devolve falso quando não havia aviso aberto. Só service_role.';

revoke execute on function public.rearmar_aviso_de_provedor(uuid, text, text, timestamptz) from public;
grant execute on function public.rearmar_aviso_de_provedor(uuid, text, text, timestamptz) to service_role;
