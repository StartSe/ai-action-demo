-- O custo da chamada, separado por componente e aceitando preço que chega tarde
-- (seção 3.5, T-20, L-05).
-- Referência: docs/PRD-implementacao.md seções 3.5, 3.9 e 6,
-- docs/revisao-tecnica.md T-20, T-06 e L-05, docs/PRD.md RNF-12 e RF-703.
--
-- Um número só em `calls.cost_cents` não sustenta nem o teto de gasto do dia
-- nem o custo por reunião: quando a conta pergunta por que a ligação custou o
-- que custou, a resposta é a telefonia, a voz, o modelo e a infraestrutura em
-- linhas separadas. Quatro decisões que a tabela carrega:
--
-- 1. **Único em (call_id, component, source).** É ele que torna
--    `cron-cost-sync` idempotente. O provedor publica o preço da telefonia
--    minutos depois do fim da ligação, e a rotina roda a cada quinze minutos:
--    sem o único, cada passagem acrescentaria uma segunda linha do mesmo
--    componente e a chamada iria ficando mais cara sozinha. Com ele, a rotina
--    escreve `on conflict (call_id, component, source) do update` e o preço que
--    chegou tarde ATUALIZA a linha que já existia. `source` entra na chave
--    porque dois informantes do mesmo componente (o webhook do provedor e a
--    fatura conciliada, por exemplo) são duas medidas, e sobrescrever uma com a
--    outra apagaria a divergência que alguém vai querer explicar.
-- 2. **`amount_cents` é inteiro e não nulo** (L-05). Preço ausente é ausência
--    de linha, nunca linha com valor nulo: com nulo, a soma teria de decidir se
--    o componente custou zero ou se ninguém sabe ainda, e as duas respostas
--    levam a contas diferentes no teto de gasto. E é `>= 0` porque a correção
--    de preço atualiza a linha do componente em vez de lançar uma contrapartida
--    negativa — negativo aqui derrubaria o check de `calls.cost_cents` na
--    materialização, com erro que não aponta para a linha que o causou.
-- 3. **A soma é materializada por recálculo, nunca por delta.** O gatilho não
--    soma a diferença: ele refaz `sum(amount_cents)` da chamada inteira a cada
--    insert, update e delete. Delta errado acumula em silêncio e só aparece
--    meses depois, num número que ninguém consegue reconciliar; soma
--    recalculada se autocorrige na escrita seguinte.
-- 4. **Classe Servidor da seção 3.9.** Membro lê; ninguém escreve pelo
--    cliente. Quem grava é `call-finalize` e `cron-cost-sync`. Uma política de
--    insert de cliente daria à conta o poder de escrever o próprio custo — e,
--    como o teto de gasto do dia (passo 7 da guarda) é a soma desta tabela,
--    escrever o próprio custo é desligar o teto por dentro, ou apagar a linha
--    para voltar a discar.

-- O par que o custo aponta de volta ------------------------------------------------
-- A chamada pertence a uma conta, e o custo pertence às duas. Chave composta em
-- vez de duas simples pelo motivo declarado em `playbook_versions`: com duas
-- simples, uma linha de custo da conta B se penduraria numa chamada da conta A
-- e ficaria invisível para quem paga a ligação — e a soma do teto de gasto de A
-- contaria dinheiro de B.
alter table public.calls
  add constraint calls_id_conta unique (id, account_id);

comment on constraint calls_id_conta on public.calls is
  'O par que call_costs aponta de volta, para que nenhuma parcela de custo fique sob a conta errada. Ver a chave composta em call_costs.';

-- O custo, por componente -----------------------------------------------------------
create table public.call_costs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- De qual chamada. `not null` porque custo sem chamada não se atribui a nada:
  -- nem ao teto de gasto do dia, nem ao custo da reunião. Cascata porque a
  -- parcela é um detalhe da ligação, e porque `calls` já cascateia do lead —
  -- RF-808 apaga tudo do lead, e uma restrição aqui travaria o apagamento.
  call_id uuid not null references public.calls (id) on delete cascade,
  -- Os quatro componentes de T-20. Lista fechada: componente fora dela não é
  -- custo novo, é defeito — nenhuma tela sabe rotulá-lo e a soma por componente
  -- do relatório passaria a ter uma fatia sem nome.
  component text not null
    check (component in ('telephony', 'voice', 'model', 'infra')),
  -- Em centavos, inteiro, nunca nulo e nunca negativo. Ver a decisão 2 no
  -- cabeçalho.
  amount_cents integer not null check (amount_cents >= 0),
  -- A moeda, em ISO 4217. Padrão `BRL` porque é a moeda da conta; a coluna
  -- existe porque o provedor de voz cobra em dólar e a conciliação precisa
  -- saber o que ela está somando.
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  -- Quem informou o preço: `provider_webhook`, `cron-cost-sync`, o nome da
  -- conciliação. Não é lista fechada porque os informantes chegam nas fatias
  -- seguintes, e lista que precisasse de migração a cada informante novo seria
  -- lista que alguém contornaria escrevendo no informante errado.
  source text not null check (length(btrim(source)) > 0),
  recorded_at timestamptz not null default now(),
  -- A idempotência de `cron-cost-sync` (T-20). Ver a decisão 1 no cabeçalho.
  constraint call_costs_parcela_unica unique (call_id, component, source),
  -- A chamada e a conta juntas, pelo motivo da chave composta de
  -- `playbook_versions`.
  constraint call_costs_da_chamada_da_conta
    foreign key (call_id, account_id)
    references public.calls (id, account_id) on delete cascade
);

comment on table public.call_costs is
  'O custo da chamada separado por componente (T-20, L-05). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente — quem grava é call-finalize e cron-cost-sync. O único por (call_id, component, source) é o que torna a rotina idempotente: o preço que chega tarde atualiza a linha, não acrescenta uma segunda.';

comment on column public.call_costs.call_id is
  'De qual chamada é a parcela. not null porque custo sem chamada não se atribui nem ao teto de gasto do dia nem ao custo da reunião. Cascata porque calls já cascateia do lead, e uma restrição aqui travaria o apagamento de RF-808.';

comment on column public.call_costs.component is
  'telephony, voice, model ou infra (T-20). Lista fechada: componente fora dela deixaria a soma por componente do relatório com uma fatia sem nome.';

comment on column public.call_costs.amount_cents is
  'O valor da parcela, em centavos. Não nulo porque preço ausente é ausência de linha (L-05): com nulo, a soma teria de decidir entre custou zero e ninguém sabe ainda, e as duas levam a contas diferentes no teto de gasto. Não negativo porque a correção atualiza a linha, em vez de lançar contrapartida.';

comment on column public.call_costs.currency is
  'Moeda em ISO 4217, padrão BRL. A coluna existe porque o provedor de voz cobra em dólar, e a conciliação precisa saber o que está somando.';

comment on column public.call_costs.source is
  'Quem informou o preço: provider_webhook, cron-cost-sync, a conciliação. Não é lista fechada porque os informantes chegam nas fatias seguintes. Entra no único porque dois informantes do mesmo componente são duas medidas, e sobrescrever uma com a outra apagaria a divergência.';

comment on constraint call_costs_parcela_unica on public.call_costs is
  'A idempotência de cron-cost-sync (T-20): o preço que chega tarde atualiza a linha do componente por on conflict, e não acrescenta uma segunda. Sem ele, cada passagem da rotina de quinze minutos deixaria a chamada mais cara sozinha.';

comment on constraint call_costs_da_chamada_da_conta on public.call_costs is
  'A parcela pertence à chamada e à conta dela. Chave composta em vez de duas simples porque duas simples deixariam uma linha da conta B pendurada numa chamada da conta A: invisível para quem paga a ligação, e somada no teto de gasto de A.';

-- A soma materializada ----------------------------------------------------------------
-- Recalcula `calls.cost_cents` a partir da tabela inteira, e nunca soma o delta.
-- O update pode mover a parcela de uma chamada para outra, e por isso as duas
-- chamadas são recalculadas: a de onde ela saiu e a para onde ela foi.
--
-- `new` e `old` se leem por `tg_op`, e não pelos dois de uma vez: em gatilho de
-- delete, ler `new` levanta "record new is not assigned yet".
create or replace function public.somar_custo_da_chamada()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  alvos uuid[] := '{}'::uuid[];
  alvo uuid;
begin
  if tg_op <> 'DELETE' then
    alvos := alvos || new.call_id;
  end if;
  if tg_op <> 'INSERT' then
    alvos := alvos || old.call_id;
  end if;

  select array_agg(distinct valor)
    into alvos
    from unnest(alvos) as parcela(valor)
   where valor is not null;

  foreach alvo in array coalesce(alvos, '{}'::uuid[]) loop
    -- Soma refeita, não delta: delta errado acumula em silêncio e só aparece
    -- num número que ninguém consegue reconciliar meses depois.
    update public.calls
       set cost_cents = (
             select coalesce(sum(parcela.amount_cents), 0)
               from public.call_costs as parcela
              where parcela.call_id = alvo
           )
     where public.calls.id = alvo;
  end loop;

  return null;
end;
$$;

comment on function public.somar_custo_da_chamada() is
  'Materializa a soma de call_costs em calls.cost_cents (T-20), sempre recalculando por sum em vez de somar o delta. Recalcula as duas chamadas quando um update move a parcela de uma para outra.';

create trigger call_costs_soma_na_chamada
  after insert or update or delete on public.call_costs
  for each row execute function public.somar_custo_da_chamada();

-- O índice do teto de gasto -------------------------------------------------------------
-- Passo 7 da guarda: quanto esta conta gastou hoje, contra
-- `account_settings.daily_spend_cap_cents`. É a soma de uma faixa de tempo
-- dentro de uma conta, e a guarda a faz segurando o advisory lock — soma que
-- varre a tabela inteira transforma a trava em fila de espera (T-05, T-06).
create index call_costs_gasto_da_conta
  on public.call_costs (account_id, recorded_at);

comment on index public.call_costs_gasto_da_conta is
  'A soma do passo 7 da guarda: gasto da conta no dia, contra daily_spend_cap_cents (T-06, RNF-12). Sem ele a soma varre a tabela inteira com a trava da guarda na mão.';

-- Isolamento (classe Servidor da seção 3.9) ----------------------------------------------
alter table public.call_costs enable row level security;

create policy call_costs_leitura_de_membro
  on public.call_costs for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy call_costs_leitura_de_membro on public.call_costs is
  'Classe Servidor: membro lê o custo das chamadas da própria conta, inclusive o viewer — é por estas linhas que a ficha explica de que o preço da ligação é feito. Não há política de insert, update nem delete, nem para o owner: como o teto de gasto do dia é a soma desta tabela, escrever nela é desligar o teto por dentro, e apagá-la é devolver orçamento já gasto.';

-- Sem gatilho de auditoria e sem `updated_at`, pela razão declarada em `calls`:
-- é tabela de servidor, cada ligação escreve até quatro parcelas e nenhuma tem
-- autor humano. O que muda por decisão de gente é o teto de gasto, e esse mora
-- em `account_settings`, que a trilha registra.
