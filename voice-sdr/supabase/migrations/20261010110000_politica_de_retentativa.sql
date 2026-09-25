-- A política de retentativa por resultado da ligação, aplicada na fila de
-- discagem (RF-417, US-188 e US-189, quinto critério de aceite da F6).
-- Referência: docs/PRD.md RF-417, docs/PRD-implementacao.md seções 3.7, 4.6 e
-- 6, docs/revisao-tecnica.md L-14, O-04 e R-09.
--
-- A ligação que terminou sem conversa (sem atendimento, ocupado, caixa postal)
-- vira a próxima tentativa na `dial_queue`, dentro de uma transação só. Cinco
-- decisões:
--
-- 1. **A política é coluna da conta, com padrão que já opera** (T-22). Teto de
--    tentativas, tabela de recuo por tentativa, recuo de ocupado e os turnos do
--    dia. Conta que nunca abriu a configuração reprograma do mesmo jeito que a
--    que abriu: configuração que só existe depois de alguém preenchê-la é
--    automação morta no primeiro dia. Os padrões espelham
--    `_shared/automacao/padroes.ts`, e o teste de banco compara os dois.
-- 2. **A regra existe em dois lugares, e a ponte é teste.** `decidir_retentativa`
--    é a mesma decisão de `_shared/automacao/politica-de-retentativa.ts`, e
--    `casos-de-retentativa.ts` é a tabela que os dois cumprem. Ela mora aqui
--    também porque `reprogramar_tentativa` decide e enfileira na mesma
--    transação: a borda que calculasse o instante e o passasse pronto abriria
--    uma segunda porta de escrita na fila com horário vindo de fora.
-- 3. **A janela de discagem não é conferida aqui.** O instante devolvido é
--    candidato; quem recusa é `guard_dial`, no momento da discagem. Os dias
--    úteis são os dias que `dialing_window` tem: dia em que a conta não disca
--    não é dia de retentativa.
-- 4. **A tentativa nova é linha nova com `attempt + 1`, a mesma fonte e o mesmo
--    `source_ref`**, e o único `dial_queue_unica_por_fonte` é a idempotência:
--    a segunda chamada para a mesma ligação recebe 23505, tratado como
--    `ja_reprogramada`. A chave de `calls` ganha o sufixo da tentativa em
--    call-place (`chaveDaTentativa`), senão a segunda tentativa de `stl`
--    colidiria com a primeira em `calls_idempotencia_unica`.
-- 5. **Fonte que tem prazo ou dono próprio não entra.** `manual` é gente que
--    discou e decide; `rem` é o lembrete, cujo prazo é a reunião (a rotina do
--    lembrete cuida dele); `camp` tem a política da campanha (F7). Entram
--    `stl`, `cad` e `rescue`.
--
-- O-04: a detecção de caixa postal é da F2 (`voicemail_detection`); aqui só se
-- reprograma a partir do `end_reason` que ela gravou.

-- A política, em colunas tipadas ----------------------------------------------------
create or replace function public.turnos_de_retentativa_validos(p_turnos jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $turnos$
declare
  v_turno jsonb;
  v_nomes text[] := array[]::text[];
  v_nome text;
  v_inicio text;
  v_fim text;
  v_fim_anterior text := null;
begin
  if p_turnos is null or jsonb_typeof(p_turnos) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_turnos) not between 1 and 6 then
    return false;
  end if;

  for v_turno in
    select e.valor from jsonb_array_elements(p_turnos) with ordinality as e(valor, ordem) order by e.ordem
  loop
    if jsonb_typeof(v_turno) <> 'object'
       or (select coalesce(array_agg(k order by k), array[]::text[]) from jsonb_object_keys(v_turno) as k)
          is distinct from array['end', 'name', 'start']
    then
      return false;
    end if;
    if jsonb_typeof(v_turno -> 'name') is distinct from 'string'
       or jsonb_typeof(v_turno -> 'start') is distinct from 'string'
       or jsonb_typeof(v_turno -> 'end') is distinct from 'string'
    then
      return false;
    end if;
    v_nome := btrim(v_turno ->> 'name');
    v_inicio := v_turno ->> 'start';
    v_fim := v_turno ->> 'end';
    if v_nome = '' or v_nome = any (v_nomes) then
      return false;
    end if;
    if v_inicio !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_fim !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    -- Largura fixa: comparar texto é comparar relógio.
    if v_fim <= v_inicio or (v_fim_anterior is not null and v_inicio < v_fim_anterior) then
      return false;
    end if;
    v_nomes := v_nomes || v_nome;
    v_fim_anterior := v_fim;
  end loop;
  return true;
end;
$turnos$;

comment on function public.turnos_de_retentativa_validos(jsonb) is
  'Os turnos de retentativa (account_settings.retry_shifts): de 1 a 6 objetos {name, start, end}, nome único, HH:MM, início antes do fim, em ordem e sem sobreposição. As mesmas regras de lerTurnos em _shared/automacao/politica-de-retentativa.ts.';

alter table public.account_settings
  add column retry_max_attempts smallint not null default 4
    constraint account_settings_teto_de_retentativas
      check (retry_max_attempts between 1 and 10),
  add column retry_backoff_minutes integer[] not null default array[60, 180, 1440]
    constraint account_settings_recuo_de_retentativa
      check (
        cardinality(retry_backoff_minutes) between 1 and 10
        and array_position(retry_backoff_minutes, null) is null
        and 1 <= all (retry_backoff_minutes)
        and 10080 >= all (retry_backoff_minutes)
      ),
  add column retry_busy_minutes integer not null default 15
    constraint account_settings_recuo_de_ocupado
      check (retry_busy_minutes between 1 and 1440),
  add column retry_shifts jsonb not null default
    '[{"name": "manha", "start": "09:00", "end": "12:00"},
      {"name": "tarde", "start": "12:00", "end": "15:00"},
      {"name": "fim_de_tarde", "start": "15:00", "end": "18:00"}]'::jsonb
    constraint account_settings_turnos_de_retentativa
      check (public.turnos_de_retentativa_validos(retry_shifts));

comment on column public.account_settings.retry_max_attempts is
  'Quantas tentativas uma discagem tem ao todo (RF-417). Na tentativa do teto, o resultado sem conversa não reprograma e vira evento no lead.';
comment on column public.account_settings.retry_backoff_minutes is
  'A espera depois de cada tentativa sem atendimento, em minutos: o n-ésimo valor vale depois da tentativa n, e o último se repete.';
comment on column public.account_settings.retry_busy_minutes is
  'A espera depois de ocupado, em minutos: curta, porque quem está no telefone agora estará livre daqui a pouco.';
comment on column public.account_settings.retry_shifts is
  'Os turnos do dia, no fuso do lead. Caixa postal vai para o começo do próximo turno diferente; o recuo que cai fora de turno vai para o começo do próximo. Os dias são os de dialing_window.';

-- O evento de automação na linha do tempo -------------------------------------------
-- A rotina que desiste de um lead (retentativas esgotadas, resgates esgotados)
-- precisa dizer isso na ficha, e nenhum dos tipos existentes narra decisão de
-- rotina: `note` é texto de gente e `call` é único por chamada.
alter table public.lead_events drop constraint lead_events_kind_check;
alter table public.lead_events add constraint lead_events_kind_check check (kind in (
  'lead_created',
  'lead_imported',
  'lead_updated',
  'stage_change',
  'note',
  'blocked',
  'unblocked',
  'merged',
  'call',
  'whatsapp',
  'automation'
));

comment on constraint lead_events_kind_check on public.lead_events is
  'Vocabulário fechado da linha do tempo. whatsapp narra a conversa (payload.acao: iniciada, assumida, devolvida, encerrada, pedido_humano, pre_contato; payload.conversation_id), nunca cada mensagem. automation narra a decisão de uma rotina sobre o lead (payload.acao: retentativas_esgotadas; payload.call_id).';

-- A decisão ---------------------------------------------------------------------------
create or replace function public.decidir_retentativa(
  p_resultado text,
  p_tentativa integer,
  p_agora timestamptz,
  p_fuso text,
  p_teto integer,
  p_recuos integer[],
  p_recuo_ocupado integer,
  p_dias integer[],
  p_turnos jsonb
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $decisao$
declare
  v_local timestamp;
  v_dia date;
  v_segundos integer;
  v_candidato timestamptz;
  v_turno jsonb;
  v_procura integer;
  v_volta integer;
begin
  if p_resultado is null or p_resultado not in ('sem_atendimento', 'ocupado', 'caixa_postal', 'numero_invalido') then
    raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end if;
  if p_tentativa is null or p_tentativa < 1 then
    raise exception 'tentativa precisa ser inteiro a partir de 1' using errcode = '22023';
  end if;
  if not public.turnos_de_retentativa_validos(p_turnos) then
    raise exception 'turnos de retentativa inválidos' using errcode = '22023';
  end if;

  if p_resultado = 'numero_invalido' then
    return jsonb_build_object('reprogramar', false, 'motivo', 'numero_invalido');
  end if;
  if p_tentativa >= p_teto then
    return jsonb_build_object('reprogramar', false, 'motivo', 'teto_de_tentativas');
  end if;
  if coalesce(cardinality(p_dias), 0) = 0 then
    return jsonb_build_object('reprogramar', false, 'motivo', 'fora_de_turno');
  end if;

  if p_resultado = 'caixa_postal' then
    v_local := p_agora at time zone p_fuso;
    v_dia := v_local::date;
    v_segundos := floor(extract(epoch from v_local::time))::integer;
    v_turno := null;
    if extract(dow from v_dia)::integer = any (p_dias) then
      select t into v_turno
        from jsonb_array_elements(p_turnos) as t
       where extract(epoch from (t ->> 'start')::time) <= v_segundos
         and v_segundos < extract(epoch from (t ->> 'end')::time)
       limit 1;
    end if;
    -- Dentro de um turno, procurar a partir do fim dele garante que o
    -- escolhido é outro, mesmo com turnos colados.
    v_procura := case
      when v_turno is null then v_segundos
      else extract(epoch from (v_turno ->> 'end')::time)::integer - 1
    end;
  else
    v_candidato := p_agora + make_interval(mins => case
      when p_resultado = 'ocupado' then p_recuo_ocupado
      else p_recuos[least(p_tentativa, cardinality(p_recuos))]
    end);
    v_local := v_candidato at time zone p_fuso;
    v_dia := v_local::date;
    v_segundos := floor(extract(epoch from v_local::time))::integer;
    if extract(dow from v_dia)::integer = any (p_dias) then
      select t into v_turno
        from jsonb_array_elements(p_turnos) as t
       where extract(epoch from (t ->> 'start')::time) <= v_segundos
         and v_segundos < extract(epoch from (t ->> 'end')::time)
       limit 1;
      if v_turno is not null then
        return jsonb_build_object(
          'reprogramar', true,
          'quando', date_trunc('second', v_candidato),
          'turno', btrim(v_turno ->> 'name'),
          'motivo', p_resultado
        );
      end if;
    end if;
    v_procura := v_segundos;
  end if;

  -- O próximo começo de turno depois de `v_procura`, hoje ou nos dias seguintes.
  if extract(dow from v_dia)::integer = any (p_dias) then
    select e.t into v_turno
      from jsonb_array_elements(p_turnos) with ordinality as e(t, ordem)
     where extract(epoch from (e.t ->> 'start')::time) > v_procura
     order by e.ordem
     limit 1;
    if v_turno is not null then
      return jsonb_build_object(
        'reprogramar', true,
        'quando', (v_dia + (v_turno ->> 'start')::time) at time zone p_fuso,
        'turno', btrim(v_turno ->> 'name'),
        'motivo', p_resultado
      );
    end if;
  end if;

  v_turno := p_turnos -> 0;
  for v_volta in 1..8 loop
    v_dia := v_dia + 1;
    if extract(dow from v_dia)::integer = any (p_dias) then
      return jsonb_build_object(
        'reprogramar', true,
        'quando', (v_dia + (v_turno ->> 'start')::time) at time zone p_fuso,
        'turno', btrim(v_turno ->> 'name'),
        'motivo', p_resultado
      );
    end if;
  end loop;

  return jsonb_build_object('reprogramar', false, 'motivo', 'fora_de_turno');
end;
$decisao$;

comment on function public.decidir_retentativa(text, integer, timestamptz, text, integer, integer[], integer, integer[], jsonb) is
  'A decisão de decidirRetentativa (_shared/automacao/politica-de-retentativa.ts) em SQL, para reprogramar_tentativa decidir e enfileirar na mesma transação. Devolve {reprogramar, quando, turno, motivo} ou {reprogramar: false, motivo}. A tabela casos-de-retentativa.ts cobra os dois lados.';

revoke execute on function public.decidir_retentativa(text, integer, timestamptz, text, integer, integer[], integer, integer[], jsonb) from public;
grant execute on function public.decidir_retentativa(text, integer, timestamptz, text, integer, integer[], integer, integer[], jsonb) to service_role;

-- A reprogramação ---------------------------------------------------------------------
create or replace function public.reprogramar_tentativa(
  p_call_id uuid,
  p_resultado text,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $reprogramar$
declare
  v_item public.dial_queue;
  v_config public.account_settings;
  v_fuso text;
  v_dias integer[];
  v_decisao jsonb;
begin
  select q.* into v_item
    from public.dial_queue as q
   where q.call_id = p_call_id
   order by q.attempt desc
   limit 1;
  if not found then
    return jsonb_build_object('resultado', 'sem_item_na_fila');
  end if;

  if v_item.source not in ('stl', 'cad', 'rescue') then
    return jsonb_build_object('resultado', 'fonte_sem_retentativa', 'fonte', v_item.source);
  end if;

  select s.* into v_config from public.account_settings as s where s.account_id = v_item.account_id;
  select coalesce(nullif(btrim(l.timezone), ''), a.timezone)
    into v_fuso
    from public.accounts as a
    left join public.leads as l on l.id = v_item.lead_id
   where a.id = v_item.account_id;
  v_dias := array(
    select k::integer from jsonb_object_keys(v_config.dialing_window) as k where k ~ '^[0-6]$' order by 1
  );

  v_decisao := public.decidir_retentativa(
    p_resultado,
    v_item.attempt,
    p_agora,
    v_fuso,
    v_config.retry_max_attempts,
    v_config.retry_backoff_minutes,
    v_config.retry_busy_minutes,
    v_dias,
    v_config.retry_shifts
  );

  if not (v_decisao ->> 'reprogramar')::boolean then
    -- O teto vira evento no lead, uma vez por chamada: a segunda passagem pela
    -- mesma chamada acha o evento e não narra de novo.
    if v_decisao ->> 'motivo' = 'teto_de_tentativas'
       and v_item.lead_id is not null
       and not exists (
         select 1 from public.lead_events as e
          where e.lead_id = v_item.lead_id
            and e.kind = 'automation'
            and e.payload ->> 'call_id' = p_call_id::text
       )
    then
      perform public.registrar_evento_de_lead(
        v_item.lead_id,
        'automation',
        'system',
        null,
        null,
        jsonb_build_object(
          'acao', 'retentativas_esgotadas',
          'call_id', p_call_id,
          'fonte', v_item.source,
          'tentativas', v_item.attempt,
          'resultado', p_resultado
        )
      );
    end if;
    return jsonb_build_object('resultado', v_decisao ->> 'motivo', 'tentativa', v_item.attempt);
  end if;

  begin
    insert into public.dial_queue (account_id, lead_id, purpose, run_at, source, source_ref, attempt)
    values (
      v_item.account_id,
      v_item.lead_id,
      v_item.purpose,
      (v_decisao ->> 'quando')::timestamptz,
      v_item.source,
      v_item.source_ref,
      v_item.attempt + 1
    );
  exception
    when unique_violation then
      -- A segunda passagem pela mesma chamada (a finalização refeita pela
      -- varredura) é o caso esperado, e não erro: a tentativa já está na fila.
      return jsonb_build_object('resultado', 'ja_reprogramada', 'tentativa', v_item.attempt + 1);
  end;

  return jsonb_build_object(
    'resultado', 'reprogramada',
    'tentativa', v_item.attempt + 1,
    'quando', v_decisao -> 'quando',
    'turno', v_decisao -> 'turno',
    'motivo', v_decisao -> 'motivo'
  );
end;
$reprogramar$;

comment on function public.reprogramar_tentativa(uuid, text, timestamptz) is
  'Aplica a política de retentativa da conta ao resultado de uma ligação (RF-417) e enfileira a próxima tentativa em dial_queue com attempt + 1, na mesma fonte e source_ref. 23505 volta como ja_reprogramada. numero_invalido e teto não enfileiram; o teto grava evento automation no lead. Fontes manual, rem e camp não entram. Só service_role.';

revoke execute on function public.reprogramar_tentativa(uuid, text, timestamptz) from public;
grant execute on function public.reprogramar_tentativa(uuid, text, timestamptz) to service_role;
