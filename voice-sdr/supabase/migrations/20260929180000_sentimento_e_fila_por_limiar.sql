-- O sentimento da chamada com a fonte, e a sequência de falhas que alimenta a
-- fila pelos limiares da conta (US-141, RF-909, RF-915, T-16).
--
-- Três decisões:
--
-- 1. **O sentimento viaja com a fonte.** `calls.sentiment` já existe desde a
--    F2, com o check de -1 a 1; entra `sentiment_source`: `tool` quando veio
--    de `tool-qualify` durante a conversa, `backfill` quando veio do modelo da
--    retaguarda, `human` quando a correção humana o trouxe. Quem grava as duas
--    colunas é `call-finalize`, na mesma passagem que grava
--    `leads.last_sentiment`. A trava da correção humana passa a guardar a
--    fonte junto com o valor, senão a finalização seguinte reescreveria a
--    fonte de um sentimento que ela não pode tocar.
-- 2. **A sequência de falhas é consulta, não contador.** `falhas_consecutivas`
--    conta em `call_attempts`, que é da F2 e é a mesma tabela da guarda (T-05),
--    as tentativas que saíram ao número desta chamada, da desta para trás, até
--    a primeira atendida por gente. Um contador próprio divergiria dela na
--    primeira tentativa que a guarda recusasse. Quem compara com o limiar é o
--    módulo puro da fila (`_shared/fila/gatilhos.ts`), com o limiar lido de
--    `account_settings`: esta função não recebe limiar nenhum.
-- 3. **Resolvido o item, só contam as tentativas posteriores**, como em
--    `abrir_item_de_falha_repetida`: quem resolveu já viu as anteriores, e sem
--    esse corte a chamada seguinte reabriria o item com duas falhas velhas e
--    uma nova. Valem os dois nomes do gênero, o da F3 e o da F4.

alter table public.calls
  add column if not exists sentiment_source text
    constraint calls_fonte_do_sentimento
      check (sentiment_source is null or sentiment_source in ('tool', 'backfill', 'human'));

comment on column public.calls.sentiment_source is
  'De onde veio calls.sentiment: tool (tool-qualify, durante a conversa), backfill (o modelo da retaguarda, depois) ou human (a correção). Nulo quando não há sentimento. Gravada por call-finalize junto com o valor e com leads.last_sentiment.';

comment on constraint calls_fonte_do_sentimento on public.calls is
  'As três fontes do sentimento. Fonte nova entra aqui e em call-finalize/sentimento-e-fila.ts.';

-- A trava da correção humana, agora com a fonte do sentimento -----------------
create or replace function public.proteger_classificacao_corrigida()
returns trigger
language plpgsql
set search_path = ''
as $trava$
begin
  if old.classification_source = 'human'
     and coalesce(current_setting('app.corrigindo_classificacao', true), '') <> 'on' then
    new.classification := old.classification;
    new.classification_source := old.classification_source;
    new.classification_confidence := old.classification_confidence;
    new.classification_corrected_by := old.classification_corrected_by;
    new.classification_corrected_at := old.classification_corrected_at;
    new.evaluation := old.evaluation;
    new.evaluation_score := old.evaluation_score;
    new.sentiment := old.sentiment;
    new.sentiment_source := old.sentiment_source;
  end if;
  return new;
end;
$trava$;

comment on function public.proteger_classificacao_corrigida() is
  'Sexto critério de aceite da F4: depois da correção humana, nenhum processamento posterior sobrescreve a classificação, a avaliação nem o sentimento (valor e fonte). Devolve os valores antigos em vez de recusar, porque o update da finalização ou da retaguarda carrega outras colunas que precisam entrar. Só corrigir_classificacao passa, pelo parâmetro de sessão app.corrigindo_classificacao.';

-- A sequência de falhas ao mesmo número ----------------------------------------
create or replace function public.falhas_consecutivas(
  p_account_id uuid,
  p_call_id uuid
)
returns table (phone_e164 text, falhas integer)
language plpgsql
security definer
set search_path = ''
as $falhas$
declare
  v_telefone text;
  v_ancora timestamptz;
  v_desde timestamptz;
begin
  -- A tentativa que discou esta chamada. Sem ela (ensaio, ligação recebida),
  -- não há sequência: nenhuma linha volta.
  select a.phone_e164, a.attempted_at
    into v_telefone, v_ancora
    from public.call_attempts a
   where a.account_id = p_account_id
     and a.call_id = p_call_id
     and a.outcome = 'placed'
   order by a.attempted_at desc
   limit 1;

  if v_telefone is null then
    return;
  end if;

  select max(e.resolved_at) into v_desde
    from public.exception_items e
   where e.account_id = p_account_id
     and e.kind in ('falha_repetida', 'repeated_failure')
     and e.status = 'resolvido'
     and e.context->>'phone_e164' = v_telefone;

  -- Da tentativa desta chamada para trás, até a primeira atendida por gente.
  -- `chamadas_reais`, e não `calls`: a tentativa nunca aponta para ensaio, e a
  -- visão diz isso sem filtro. Tentativa sem chamada é falha.
  return query
  select v_telefone, count(*)::integer
    from (
      select bool_or(coalesce(c.answered_by = 'human', false))
               over (order by a.attempted_at desc, a.id desc rows unbounded preceding) as ja_atendeu
        from public.call_attempts a
        left join public.chamadas_reais c on c.id = a.call_id
       where a.account_id = p_account_id
         and a.phone_e164 = v_telefone
         and a.outcome = 'placed'
         and a.attempted_at <= v_ancora
         and (v_desde is null or a.attempted_at > v_desde)
    ) as sequencia
   where not sequencia.ja_atendeu;
end;
$falhas$;

comment on function public.falhas_consecutivas(uuid, uuid) is
  'Quantas tentativas seguidas ao número desta chamada saíram sem ninguém atender, a desta inclusive, contadas em call_attempts (só outcome placed) depois da última resolução de item de falha repetida do número. Nenhuma linha quando a chamada não nasceu de tentativa. Não conhece limiar: quem compara é _shared/fila/gatilhos.ts com account_settings.consecutive_failures_cap. Só service_role: quem chama é call-finalize.';

revoke execute on function public.falhas_consecutivas(uuid, uuid) from public, anon, authenticated;
grant execute on function public.falhas_consecutivas(uuid, uuid) to service_role;
