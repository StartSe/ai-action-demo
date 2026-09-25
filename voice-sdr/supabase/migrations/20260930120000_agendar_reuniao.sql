-- agendar_reuniao: a inserção da reunião com o teto e a antecedência conferidos
-- na mesma transação.
-- Referência: docs/PRD-implementacao.md seções 3.3, 4.5 e 13,
-- docs/revisao-tecnica.md T-08 item 4.
--
-- A restrição de exclusão de meetings impede a sobreposição; o teto diário e a
-- antecedência não têm forma declarativa. Lidos antes de inserir por quem
-- chama, duas ligações simultâneas levariam o especialista de 5 para 7
-- reuniões no dia. Por isso a função trava por (especialista, dia local do
-- especialista) com pg_advisory_xact_lock, conta e insere antes de soltar.
--
-- O dia é o do fuso do especialista: o teto é por dia dele, e um lock em UTC
-- contaria como do dia seguinte a reunião das 21h em Manaus.
--
-- Devolve código, nunca frase nem SQLSTATE. A tradução é da borda.

create function public.agendar_reuniao(
  p_account_id uuid,
  p_lead_id uuid,
  p_specialist_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_modality text,
  p_notes text default null,
  p_booked_call_id uuid default null
)
returns table (resultado text, reuniao_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_especialista public.specialists%rowtype;
  v_inicio_local timestamp;
  v_fim_local timestamp;
  v_hora_fim time;
  v_dia date;
  v_ocupadas integer;
  v_id uuid;
begin
  select * into v_especialista
    from public.specialists
   where id = p_specialist_id and account_id = p_account_id;

  if not found or not v_especialista.active then
    return query select 'especialista_inativo'::text, null::uuid;
    return;
  end if;

  if p_starts_at < now() + make_interval(mins => v_especialista.min_notice_min) then
    return query select 'antecedencia_minima'::text, null::uuid;
    return;
  end if;

  if p_starts_at > now() + make_interval(days => v_especialista.max_notice_days) then
    return query select 'antecedencia_maxima'::text, null::uuid;
    return;
  end if;

  -- A faixa vale no fuso do especialista (T-21). Reunião que termina à
  -- meia-noite em ponto termina às 24:00 do mesmo dia, que é hora válida em time.
  v_inicio_local := p_starts_at at time zone v_especialista.timezone;
  v_fim_local := p_ends_at at time zone v_especialista.timezone;
  v_dia := v_inicio_local::date;
  v_hora_fim := case
    when v_fim_local = (v_dia + 1)::timestamp then '24:00'::time
    else v_fim_local::time
  end;

  if (v_fim_local::date <> v_dia and v_hora_fim <> '24:00'::time)
     or not exists (
       select 1 from public.specialist_availability f
        where f.specialist_id = p_specialist_id
          and f.weekday = extract(dow from v_dia)::smallint
          and f.start_time <= v_inicio_local::time
          and f.end_time >= v_hora_fim
     )
     or exists (
       select 1 from public.specialist_blocks b
        where b.specialist_id = p_specialist_id
          and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
     ) then
    return query select 'fora_da_disponibilidade'::text, null::uuid;
    return;
  end if;

  -- Uma fila por especialista e dia local. Os dois inteiros vêm de hashtext;
  -- colisão só junta duas filas, nunca separa a mesma.
  perform pg_advisory_xact_lock(hashtext(p_specialist_id::text), hashtext(v_dia::text));

  select count(*) into v_ocupadas
    from public.meetings m
   where m.specialist_id = p_specialist_id
     and m.status in ('scheduled', 'confirmed')
     and (m.starts_at at time zone v_especialista.timezone)::date = v_dia;

  if v_ocupadas >= v_especialista.daily_cap then
    return query select 'teto_diario'::text, null::uuid;
    return;
  end if;

  begin
    insert into public.meetings
      (account_id, lead_id, specialist_id, starts_at, ends_at, modality, notes, booked_call_id)
    values
      (p_account_id, p_lead_id, p_specialist_id, p_starts_at, p_ends_at, p_modality,
       nullif(btrim(p_notes), ''), p_booked_call_id)
    returning id into v_id;
  exception
    when exclusion_violation then
      return query select 'horario_ocupado'::text, null::uuid;
      return;
    when unique_violation then
      return query select 'lead_com_reuniao_ativa'::text, null::uuid;
      return;
  end;

  -- A marca que fecha o rodízio (US-165). Fora da trilha pelo gatilho de specialists.
  update public.specialists set last_assigned_at = now() where id = p_specialist_id;

  -- O nascimento da reunião não passa por registrar_auditoria, que lê old.
  insert into public.audit_log
    (account_id, actor, actor_id, source, action, target_type, target_id, reason, payload)
  values (
    p_account_id,
    case when p_booked_call_id is null then 'system' else 'agent' end,
    null,
    'rpc:agendar_reuniao',
    'insert',
    'meetings',
    v_id,
    nullif(current_setting('app.audit_reason', true), ''),
    jsonb_build_object(
      'specialist_id', p_specialist_id,
      'lead_id', p_lead_id,
      'starts_at', p_starts_at,
      'booked_call_id', p_booked_call_id
    )
  );

  return query select 'agendada'::text, v_id;
end;
$$;

comment on function public.agendar_reuniao(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid) is
  'Marca a reunião com teto diário e antecedência conferidos sob lock por especialista e dia local dele. Devolve um código: agendada, teto_diario, antecedencia_minima, antecedencia_maxima, horario_ocupado, lead_com_reuniao_ativa, especialista_inativo, fora_da_disponibilidade. Só a chave de serviço chama: authenticated agendando por aqui pularia a política de insert.';

revoke execute on function public.agendar_reuniao(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.agendar_reuniao(uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid)
  to service_role;
