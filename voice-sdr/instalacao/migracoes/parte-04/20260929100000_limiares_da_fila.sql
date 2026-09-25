-- Os limiares da fila de exceções, por conta (US-126, RF-915, F4).
--
-- "Sentimento muito negativo" deixa de ser adjetivo e passa a ser número que o
-- operador ajusta. Quem lê estes valores é a finalização da chamada, pelo
-- módulo puro `_shared/fila/gatilhos.ts`: nenhum limiar aparece como literal em
-- código da interface ou da borda.
--
-- 1. **Só coluna nova.** `account_settings` é classe Configuração da seção 3.9
--    e nasceu na F2 (20260921200000_roteamento_de_especialista.sql) com RLS,
--    leitura de membro, escrita de admin e o gatilho `registrar_auditoria()`.
--    Esta migração não recria política nenhuma: acrescenta coluna por
--    `add column if not exists`, e a trilha de auditoria já alcança o que
--    entra aqui.
-- 2. **O limiar de crédito já existe e não se duplica.** RF-915 chama de
--    `credit_floor_cents` o crédito abaixo do qual a fila recebe item. A F2 já
--    criou `credit_alert_cents` com o mesmo sentido, nulo como "sem aviso" e
--    `check (> 0)`, e é dela que a vigia de crédito lê. Uma segunda coluna
--    faria as duas divergirem na primeira edição: o gatilho da fila lê
--    `credit_alert_cents`, e o comentário da coluna passa a dizer isso.

alter table public.account_settings
  add column if not exists sentiment_floor numeric not null default -0.5
    constraint account_settings_piso_de_sentimento
      check (sentiment_floor between -1 and 1),
  add column if not exists consecutive_failures_cap smallint not null default 3
    constraint account_settings_teto_de_falhas
      check (consecutive_failures_cap > 0),
  add column if not exists failed_criteria_cap smallint not null default 1
    constraint account_settings_teto_de_criterios
      check (failed_criteria_cap > 0);

comment on column public.account_settings.sentiment_floor is
  'Piso de sentimento da fila (RF-915), de -1 a 1. Padrão -0,5: chamada com sentimento agregado menor ou igual a ele vira item sentimento_negativo. O padrão fica abaixo do neutro para a fila não virar ruído com conversa apenas seca. Coluna acrescentada pela US-126 sem recriar política: account_settings já tem RLS, escrita de admin e auditoria desde a F2.';

comment on column public.account_settings.consecutive_failures_cap is
  'Tentativas consecutivas sem sucesso ao mesmo número que viram item falha_repetida (RF-915). Padrão 3, que é o teto diário de tentativas por número: chegar nele sem falar com ninguém é o sinal de número ruim. Maior que zero. Coluna acrescentada pela US-126 sem recriar política.';

comment on column public.account_settings.failed_criteria_cap is
  'Quantos critérios de avaliação reprovados numa chamada viram item avaliacao_reprovada (RF-915). Padrão 1: critério objetivo reprovado já é o que o administrador quer ver. Maior que zero. Coluna acrescentada pela US-126 sem recriar política.';

comment on column public.account_settings.credit_alert_cents is
  'Crédito no provedor abaixo do qual a conta é avisada, em centavos (RF-612), e o credit_floor_cents de RF-915: é também o limiar do item credito_baixo da fila, e por isso não existe segunda coluna. Nulo significa sem gatilho de crédito, e não zero: zero se leria como avisar sempre, e o check exige maior que zero.';
