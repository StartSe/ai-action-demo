-- A varredura de recuperação: a segunda via da finalização, o vigia da duração
-- e o disjuntor (seção 4.6, T-07, T-15, L-12, R-01, RF-417, RF-421).
-- Referência: docs/PRD-implementacao.md seções 4.6 e 12, docs/revisao-tecnica.md
-- T-07, L-12 e R-01.
--
-- `cron-call-recovery` roda a cada 2 minutos e cuida do que o aviso do
-- provedor não fechou. O módulo portável (`cron-call-recovery/recuperacao.ts`)
-- decide o ramo de cada chamada; esta migração dá a ele o que ler e onde
-- escrever. Cinco decisões:
--
-- 1. **Nenhum ramo tenta para sempre (R-01).** É o defeito que a revisão
--    descreve: provedor fora, a varredura consulta, falha, e volta a cada 2 min
--    indefinidamente. Por isso a chamada ganha contadores e uma marca de
--    desistência — `recovery_attempts` e `recovery_gave_up_at` para a
--    finalização e o encerramento, `classify_attempts` e `classify_gave_up_at`
--    para a classificação —, e a reivindicação espaça a próxima volta pelo
--    número de tentativas. A chamada que esgota fica registrada em
--    `recovery_note` em vez de sair da vista.
-- 2. **A reivindicação da varredura é dela, e não a de `call-finalize`.**
--    `recovery_claimed_at` é o que faz duas passagens sobrepostas (P-09) pegarem
--    chamadas diferentes, com `for update skip locked`. A reivindicação da
--    finalização (T-15, `finalize_started_at`) continua sendo quem garante uma
--    finalização só: a varredura aciona `call-finalize` e nunca escreve o
--    desfecho da conversa.
-- 3. **N e M do disjuntor moram em `account_settings`** (`breaker_failures`,
--    `breaker_window_minutes`), com padrão explícito. A contagem sai de
--    `integration_events`, que já registra toda chamada externa com o status
--    nulo para "sem resposta" — a diferença que a migração de observabilidade
--    guardou para o disjuntor.
-- 4. **A reprogramação da chamada perdida (RF-417) é a mínima honesta da F2.**
--    A política por resultado é da F6 (`reprogramar_tentativa`, US-189). Aqui
--    só se enfileira quando a chave da fonte carrega o número da tentativa
--    (`camp:{alvo}:{n}` e `rescue:{reunião}:{n}`): nas outras, a tentativa
--    nova teria a mesma chave de `calls` e `call-place` responderia
--    `ja_existia`, uma reprogramação que não disca. Essa recusa volta com
--    código próprio (`chave_sem_tentativa`) e fica anotada na chamada.
-- 5. **Só `service_role` executa.** Quem chama é a rotina, com a chave de
--    serviço; nenhuma das três funções faz sentido numa sessão de cliente.

-- A chamada na varredura ----------------------------------------------------
alter table public.calls
  add column recovery_claimed_at timestamptz,
  add column recovery_attempts integer not null default 0
    constraint calls_tentativas_de_recuperacao check (recovery_attempts >= 0),
  add column recovery_note text,
  add column recovery_gave_up_at timestamptz,
  add column classify_attempts integer not null default 0
    constraint calls_tentativas_de_classificacao check (classify_attempts >= 0),
  add column classify_gave_up_at timestamptz;

comment on column public.calls.recovery_claimed_at is
  'Quando a varredura de recuperação tomou a chamada pela última vez. É a reivindicação dela, com for update skip locked, e não a da finalização (finalize_started_at).';

comment on column public.calls.recovery_attempts is
  'Quantas vezes a varredura tentou finalizar ou encerrar a chamada sem conseguir. Espaça a próxima volta e alimenta o teto (R-01): nenhum ramo tenta para sempre.';

comment on column public.calls.recovery_note is
  'O último registro da varredura sobre a chamada: o erro da tentativa, a reprogramação recusada, ou a razão da desistência.';

comment on column public.calls.recovery_gave_up_at is
  'Quando a varredura desistiu de finalizar ou encerrar a chamada. Preenchida, a chamada sai da varredura e a razão fica em recovery_note.';

comment on column public.calls.classify_attempts is
  'Quantas vezes a varredura pediu a classificação de retaguarda sem conseguir (US-071).';

comment on column public.calls.classify_gave_up_at is
  'Quando a varredura desistiu de classificar a chamada, por teto de tentativas ou por recusa definitiva. A razão fica em recovery_note.';

-- O disjuntor da conta ------------------------------------------------------
alter table public.account_settings
  add column breaker_failures integer not null default 5
    constraint account_settings_falhas_do_disjuntor check (breaker_failures between 2 and 100),
  add column breaker_window_minutes integer not null default 10
    constraint account_settings_janela_do_disjuntor check (breaker_window_minutes between 1 and 240);

comment on column public.account_settings.breaker_failures is
  'O N do disjuntor (R-01): tantas falhas consecutivas de provedor dentro da janela pausam a discagem da conta. A retomada é manual, pelo caminho do freio de emergência.';

comment on column public.account_settings.breaker_window_minutes is
  'O M do disjuntor (R-01), em minutos: só contam as falhas de provedor desta janela.';

-- A reivindicação da varredura ---------------------------------------------
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
               -- Classificação pendente (US-071): finalizada com conversa de
               -- gente, sem classificação. Dois minutos de folga para a
               -- própria finalização terminar de acionar a dela.
               c.finalized_at is not null
               and c.finalized_at <= p_instante - interval '2 minutes'
               and c.answered_by = 'human'
               and c.classification_source is null
               and c.classify_gave_up_at is null
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
  'Toma até p_limite chamadas que a varredura de recuperação precisa olhar (seção 4.6) com for update skip locked, grava recovery_claimed_at e devolve cada uma com o max_duration_seconds da conta. A volta seguinte da mesma chamada espera 2^tentativas minutos, até 30. Só service_role.';

revoke execute on function public.reivindicar_recuperacao(integer, timestamptz) from public;
grant execute on function public.reivindicar_recuperacao(integer, timestamptz) to service_role;

-- A reprogramação da chamada perdida ---------------------------------------
create or replace function public.reprogramar_chamada_perdida(
  p_call_id uuid,
  p_instante timestamptz
)
returns text
language plpgsql
set search_path = ''
as $reprogramacao$
declare
  v_item public.dial_queue;
  v_base text;
  v_ordinal integer;
  v_inseridas integer;
begin
  select q.* into v_item
    from public.dial_queue as q
   where q.call_id = p_call_id
   order by q.attempt desc
   limit 1;
  if not found then
    return 'sem_item_na_fila';
  end if;

  -- Ver a decisão 4 do cabeçalho: sem o número da tentativa na chave, a
  -- tentativa nova seria `ja_existia` em call-place.
  if v_item.source not in ('camp', 'rescue') then
    return 'chave_sem_tentativa';
  end if;

  if v_item.attempt >= 3 then
    return 'teto_de_tentativas';
  end if;

  v_base := split_part(v_item.source_ref, ':', 1);
  v_ordinal := nullif(split_part(v_item.source_ref, ':', 2), '')::integer;
  if v_ordinal is null then
    return 'chave_sem_tentativa';
  end if;

  insert into public.dial_queue (account_id, lead_id, purpose, run_at, source, source_ref, attempt)
  values (
    v_item.account_id,
    v_item.lead_id,
    v_item.purpose,
    p_instante + interval '30 minutes',
    v_item.source,
    v_base || ':' || (v_ordinal + 1),
    v_item.attempt + 1
  )
  on conflict (account_id, source, source_ref, attempt) do nothing;

  get diagnostics v_inseridas = row_count;
  return case when v_inseridas > 0 then 'reprogramada' else 'ja_reprogramada' end;
end;
$reprogramacao$;

comment on function public.reprogramar_chamada_perdida(uuid, timestamptz) is
  'Enfileira a próxima tentativa da discagem que virou dial_lost ou provider_lost (RF-417), 30 minutos à frente e até a terceira. Só para fonte cuja chave carrega o número da tentativa (camp, rescue); nas outras devolve chave_sem_tentativa. A política por resultado é da F6. Só service_role.';

revoke execute on function public.reprogramar_chamada_perdida(uuid, timestamptz) from public;
grant execute on function public.reprogramar_chamada_perdida(uuid, timestamptz) to service_role;

-- A leitura do disjuntor ----------------------------------------------------
create or replace function public.contas_para_o_disjuntor(p_instante timestamptz)
returns table (
  account_id uuid,
  falhas integer,
  janela_em_minutos integer,
  eventos jsonb
)
language sql
stable
set search_path = ''
as $disjuntor$
  select a.id,
         s.breaker_failures,
         s.breaker_window_minutes,
         (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'status_code', e.status_code)
                                    order by e.at desc), '[]'::jsonb)
            from (select i.at, i.status_code
                    from public.integration_events as i
                   where i.account_id = a.id
                     and i.direction = 'outbound'
                     and i.provider in ('voz', 'telefonia')
                     and i.at > p_instante - make_interval(mins => s.breaker_window_minutes)
                     and i.at <= p_instante
                   order by i.at desc
                   limit s.breaker_failures) as e)
    from public.accounts as a
    join public.account_settings as s on s.account_id = a.id
   where a.dialing_paused_at is null
     and exists (
       select 1
         from public.integration_events as i
        where i.account_id = a.id
          and i.direction = 'outbound'
          and i.provider in ('voz', 'telefonia')
          and i.at > p_instante - make_interval(mins => s.breaker_window_minutes)
          and i.at <= p_instante
          and (i.status_code is null or i.status_code >= 500)
     )
   order by a.id
$disjuntor$;

comment on function public.contas_para_o_disjuntor(timestamptz) is
  'As contas operando com ao menos uma falha de provedor (sem resposta ou 5xx) dentro da janela do disjuntor, com N, M e os N eventos de provedor mais recentes da janela. Quem decide se dispara é cron-call-recovery/recuperacao.ts. Só service_role.';

revoke execute on function public.contas_para_o_disjuntor(timestamptz) from public;
grant execute on function public.contas_para_o_disjuntor(timestamptz) to service_role;
