-- O acionamento da retaguarda em via dupla e idempotente (US-140, T-15,
-- RF-410, RNF-05, RNF-06).
-- Referência: docs/PRD-implementacao.md seções 4.6 e 9.2, docs/revisao-tecnica.md
-- T-15.
--
-- A classificação de retaguarda (`call-classify`) tem duas vias: a
-- finalização, que a aciona na mesma passagem quando faltou a qualificação, e
-- `cron-call-recovery`, que a aciona quando o aviso do provedor falhou. As
-- duas podem chegar no mesmo segundo. Três decisões:
--
-- 1. **A reivindicação é a técnica de T-15, e é um comando só.**
--    `reivindicar_classificacao` é um `update ... returning` condicionado:
--    quem recebe a linha classifica, quem não recebe responde 409. Consultar
--    e depois escrever deixaria as duas vias lerem "livre" antes de qualquer
--    uma gravar, e a chamada seria classificada duas vezes — com dois
--    `lead_event` e dois custos de modelo. A função é `language sql` de
--    propósito: não há onde caber a consulta separada.
-- 2. **`classify_started_at` marca o começo e `classified_at` o fim.** A
--    reivindicação vale 5 minutos, como a da finalização; a passagem que caiu
--    no meio deixa a trava de pé e ela expira sozinha. `classified_at`
--    preenchido tira a chamada das duas vias para sempre.
-- 3. **A correção humana não é reivindicada.** O `where` exclui
--    `classification_source = 'human'`, e a trava da US-129
--    (`proteger_classificacao_corrigida`) continua embaixo, para o caso de a
--    correção chegar depois da reivindicação.
--
-- A varredura (`reivindicar_recuperacao`) passa a olhar a finalizada sem
-- classificação depois de **um** minuto, e não dois: é o que sustenta "em até
-- 2 min" com a rotina rodando a cada 2 (RF-410). E deixa de pegar a chamada
-- já classificada ou com a reivindicação da retaguarda de pé.

alter table public.calls
  add column classify_started_at timestamptz,
  add column classified_at timestamptz;

comment on column public.calls.classify_started_at is
  'Quando uma passagem de call-classify reivindicou a chamada (T-15). Vale 5 minutos: a passagem que caiu no meio deixa a trava, e ela expira sozinha. Quem escreve é reivindicar_classificacao, nunca a borda direto.';

comment on column public.calls.classified_at is
  'Quando a classificação de retaguarda terminou: gravou, ou leu uma conversa sem fala do lead. Preenchida, nenhuma das duas vias reivindica a chamada de novo.';

create or replace function public.reivindicar_classificacao(p_call_id uuid)
returns uuid
language sql
volatile
set search_path = ''
as $reivindicacao$
  update public.calls as c
     set classify_started_at = now()
   where c.id = p_call_id
     and c.classified_at is null
     and c.classification_source is distinct from 'human'
     and (c.classify_started_at is null
          or c.classify_started_at < now() - interval '5 minutes')
  returning c.id
$reivindicacao$;

comment on function public.reivindicar_classificacao(uuid) is
  'A reivindicação da classificação de retaguarda (T-15, RNF-06): um update condicionado, e só quem recebe o id classifica. Não devolve a chamada já classificada, a corrigida por gente, nem a reivindicada há menos de 5 minutos. Só service_role.';

revoke execute on function public.reivindicar_classificacao(uuid) from public, anon, authenticated;
grant execute on function public.reivindicar_classificacao(uuid) to service_role;

-- A varredura, com a folga de um minuto ------------------------------------
create or replace function public.reivindicar_recuperacao(
  p_limite integer,
  p_instante timestamptz
)
returns table (
  id uuid,
  account_id uuid,
  status text,
  provider_call_sid text,
  provider_conversation_id text,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  finalized_at timestamptz,
  answered_by text,
  classification_source text,
  recovery_attempts integer,
  classify_attempts integer,
  max_duration_seconds integer
)
language plpgsql
set search_path = ''
as $recuperacao$
#variable_conflict use_column
begin
  -- 25 é o teto do envelope (_shared/rotinas/execucao.ts, R-02), repetido
  -- aqui como rede.
  return query
    with alvo as (
      select c.id
        from public.calls as c
       where (
               -- Finalização, órfã, duração e idade: chamada sem finalização.
               c.finalized_at is null
               and c.recovery_gave_up_at is null
               and (c.recovery_claimed_at is null
                    or c.recovery_claimed_at <= p_instante
                       - make_interval(secs => least(1800, 60 * power(2, c.recovery_attempts)::integer)))
               and (
                 -- A linha órfã (T-07): nunca chegou ao provedor.
                 (c.status in ('queued', 'ringing')
                   and c.provider_call_sid is null
                   and c.started_at <= p_instante - interval '3 minutes')
                 -- A que tem conversa: em curso, perdida ou à espera de finalização.
                 or c.provider_conversation_id is not null
               )
             )
          or (
               -- A segunda via da retaguarda (US-140): finalizada com conversa
               -- de gente, sem classificação há mais de um minuto. O minuto é
               -- a folga para a própria finalização acionar a dela; com a
               -- rotina a cada 2, a classificação chega em até 2 min (RF-410).
               c.finalized_at is not null
               and c.finalized_at < p_instante - interval '1 minute'
               and c.answered_by = 'human'
               and c.classification_source is null
               and c.classified_at is null
               and c.classify_gave_up_at is null
               and (c.classify_started_at is null
                    or c.classify_started_at < p_instante - interval '5 minutes')
               and (c.recovery_claimed_at is null
                    or c.recovery_claimed_at <= p_instante
                       - make_interval(secs => least(1800, 60 * power(2, c.classify_attempts)::integer)))
             )
       order by c.started_at, c.id
       for update skip locked
       limit least(coalesce(p_limite, 0), 25)
    ),
    tomadas as (
      update public.calls as c
         set recovery_claimed_at = p_instante
        from alvo
       where c.id = alvo.id
      returning c.*
    )
    select t.id, t.account_id, t.status, t.provider_call_sid, t.provider_conversation_id,
           t.started_at, t.answered_at, t.ended_at, t.end_reason, t.finalized_at,
           t.answered_by, t.classification_source, t.recovery_attempts, t.classify_attempts,
           coalesce(s.max_duration_seconds, 600)::integer
      from tomadas as t
      left join public.account_settings as s on s.account_id = t.account_id
     order by t.started_at, t.id;
end;
$recuperacao$;

comment on function public.reivindicar_recuperacao(integer, timestamptz) is
  'Toma até p_limite chamadas que a varredura de recuperação precisa olhar (seção 4.6) com for update skip locked, grava recovery_claimed_at e devolve cada uma com o max_duration_seconds da conta. A finalizada sem classificação entra depois de um minuto (US-140). A volta seguinte da mesma chamada espera 2^tentativas minutos, até 30. Só service_role.';

revoke execute on function public.reivindicar_recuperacao(integer, timestamptz) from public;
grant execute on function public.reivindicar_recuperacao(integer, timestamptz) to service_role;
