-- Remarcar ou cancelar a reunião na mesma ligação (RF-603, US-196, segundo
-- critério de aceite da F6).
-- Referência: docs/PRD-implementacao.md seções 3.3 e 5, docs/revisao-tecnica.md
-- T-08, T-09, T-16 e T-23.
--
-- `tool-reschedule` chama uma destas duas funções quando o lead, no lembrete ou
-- no resgate, pede outro horário ou desiste da conversa. Cinco decisões:
--
-- 1. **Remarcar exige horário oferecido nesta chamada** (T-09). A posição se
--    resolve contra `call_slot_offers` da chamada do cabeçalho, não vencida.
--    Posição sem oferta, oferta de outra chamada e oferta vencida voltam com
--    código próprio, e nada muda.
-- 2. **Fechar a antiga e abrir a nova é uma transação só**, num bloco com
--    ponto de salvamento: a antiga vira `rescheduled` com o motivo, e a nova
--    nasce por `agendar_reuniao` (o lock por especialista e dia, o teto, a
--    antecedência e a exclusão da F5, T-08). Se `agendar_reuniao` recusa
--    (23P01 é `horario_ocupado`, resultado esperado), o bloco levanta e volta
--    atrás, e o lead continua com a reunião que tinha: nunca fica sem
--    nenhuma. `meetings_one_active_per_lead` continua valendo porque a antiga
--    sai do ativo antes de a nova entrar.
-- 3. **`rescheduled_from_id` encadeia**, e `booked_call_id` da nova é a
--    chamada que remarcou (T-23). A reunião do resgate (`no_show`) não muda de
--    status: a falta atestada é história, e só a nova aponta para ela.
-- 4. **Idempotente.** A segunda chamada com a mesma posição, na mesma ligação,
--    acha a reunião que esta ligação já criou a partir da antiga e devolve a
--    mesma (`ja_remarcada`). As ofertas se consomem na remarcação: a posição
--    dita de novo não resolve horário nenhum.
-- 5. **Cancelar é `update ... where status in ('scheduled', 'confirmed')`**
--    com o motivo; a segunda vez é `ja_cancelada`.
--
-- O evento no calendário e os convites da reunião nova não nascem aqui: as
-- rotinas da F5 (`cron-calendar-sync` e `cron-meeting-invite`) pegam a reunião
-- sem evento e com convite por sair na primeira passagem. O evento no lead é
-- `automation` (`reuniao_remarcada`, `reuniao_cancelada`).

create or replace function public.remarcar_reuniao(
  p_account_id uuid,
  p_call_id uuid,
  p_slot_position integer,
  p_reason text,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $remarcar$
declare
  v_conta_da_chamada uuid;
  v_reuniao record;
  v_oferta public.call_slot_offers;
  v_ja uuid;
  v_ja_inicio timestamptz;
  v_codigo text;
  v_nova uuid;
  v_notas text;
begin
  select c.account_id into v_conta_da_chamada from public.calls as c where c.id = p_call_id;
  if v_conta_da_chamada is null or v_conta_da_chamada <> p_account_id then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  select r.* into v_reuniao from public.reuniao_em_jogo(p_call_id) as r;
  if v_reuniao.meeting_id is null then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  -- A mesma ligação já remarcou esta reunião: devolve a mesma. Pela fila, a
  -- reunião em jogo continua sendo a antiga, e a nova aponta para ela; sem
  -- fila, a reunião ativa do lead já é a nova, nascida desta ligação.
  select m.id, m.starts_at into v_ja, v_ja_inicio
    from public.meetings as m
   where m.account_id = p_account_id
     and m.booked_call_id = p_call_id
     and m.rescheduled_from_id is not null
     and (m.rescheduled_from_id = v_reuniao.meeting_id or m.id = v_reuniao.meeting_id)
   limit 1;
  if v_ja is not null then
    return jsonb_build_object('resultado', 'ja_remarcada', 'meeting_id', v_ja, 'starts_at', v_ja_inicio);
  end if;

  if v_reuniao.status not in ('scheduled', 'confirmed', 'no_show') then
    return jsonb_build_object('resultado', 'status_nao_elegivel', 'status', v_reuniao.status);
  end if;

  select o.* into v_oferta
    from public.call_slot_offers as o
   where o.call_id = p_call_id
     and o.account_id = p_account_id
     and o.position = p_slot_position;
  if not found then
    return jsonb_build_object('resultado', 'posicao_nao_oferecida');
  end if;
  if v_oferta.expires_at <= p_agora then
    return jsonb_build_object('resultado', 'oferta_expirada');
  end if;

  select m.notes into v_notas from public.meetings as m where m.id = v_reuniao.meeting_id;

  begin
    if v_reuniao.status in ('scheduled', 'confirmed') then
      update public.meetings as m
         set status = 'rescheduled',
             cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'remarcada na ligação')
       where m.id = v_reuniao.meeting_id;
    end if;

    select a.resultado, a.reuniao_id into v_codigo, v_nova
      from public.agendar_reuniao(
        p_account_id,
        v_reuniao.lead_id,
        v_oferta.specialist_id,
        v_oferta.starts_at,
        v_oferta.ends_at,
        v_reuniao.modality,
        v_notas,
        p_call_id
      ) as a;

    if v_codigo is distinct from 'agendada' then
      -- Desfaz o fechamento da antiga: o lead não fica sem reunião nenhuma.
      raise exception 'remarcacao_desfeita' using errcode = 'P0001', detail = coalesce(v_codigo, 'sem_codigo');
    end if;

    update public.meetings as m set rescheduled_from_id = v_reuniao.meeting_id where m.id = v_nova;
    delete from public.call_slot_offers as o where o.call_id = p_call_id;
  exception
    when raise_exception then
      if sqlerrm = 'remarcacao_desfeita' then
        return jsonb_build_object('resultado', v_codigo);
      end if;
      raise;
  end;

  if v_reuniao.lead_id is not null then
    perform public.registrar_evento_de_lead(
      v_reuniao.lead_id,
      'automation',
      'agent',
      null,
      null,
      jsonb_build_object(
        'acao', 'reuniao_remarcada',
        'de', v_reuniao.meeting_id,
        'para', v_nova,
        'call_id', p_call_id,
        'motivo', nullif(btrim(p_reason), '')
      )
    );
  end if;

  return jsonb_build_object('resultado', 'remarcada', 'meeting_id', v_nova, 'starts_at', v_oferta.starts_at);
end;
$remarcar$;

comment on function public.remarcar_reuniao(uuid, uuid, integer, text, timestamptz) is
  'RF-603: remarca a reunião em jogo da chamada no horário da posição oferecida nesta chamada (call_slot_offers, não vencida), fechando a antiga como rescheduled e abrindo a nova por agendar_reuniao na mesma transação; recusa de agendar_reuniao desfaz tudo. A nova aponta rescheduled_from_id para a antiga e booked_call_id para a chamada. A segunda chamada devolve ja_remarcada com a mesma reunião. Só service_role.';

revoke execute on function public.remarcar_reuniao(uuid, uuid, integer, text, timestamptz) from public;
grant execute on function public.remarcar_reuniao(uuid, uuid, integer, text, timestamptz) to service_role;

create or replace function public.cancelar_reuniao_na_ligacao(
  p_account_id uuid,
  p_call_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $cancelar$
declare
  v_conta_da_chamada uuid;
  v_reuniao record;
  v_lead uuid;
begin
  select c.account_id into v_conta_da_chamada from public.calls as c where c.id = p_call_id;
  if v_conta_da_chamada is null or v_conta_da_chamada <> p_account_id then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  select r.* into v_reuniao from public.reuniao_em_jogo(p_call_id) as r;
  if v_reuniao.meeting_id is null then
    return jsonb_build_object('resultado', 'sem_reuniao');
  end if;

  update public.meetings as m
     set status = 'canceled',
         cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'cancelada na ligação')
   where m.id = v_reuniao.meeting_id
     and m.account_id = p_account_id
     and m.status in ('scheduled', 'confirmed')
  returning m.lead_id into v_lead;

  if found then
    if v_lead is not null then
      perform public.registrar_evento_de_lead(
        v_lead,
        'automation',
        'agent',
        null,
        null,
        jsonb_build_object(
          'acao', 'reuniao_cancelada',
          'meeting_id', v_reuniao.meeting_id,
          'call_id', p_call_id,
          'motivo', nullif(btrim(p_reason), '')
        )
      );
    end if;
    return jsonb_build_object('resultado', 'cancelada', 'meeting_id', v_reuniao.meeting_id);
  end if;

  return jsonb_build_object(
    'resultado', case when v_reuniao.status = 'canceled' then 'ja_cancelada' else 'status_nao_elegivel' end,
    'meeting_id', v_reuniao.meeting_id,
    'status', v_reuniao.status
  );
end;
$cancelar$;

comment on function public.cancelar_reuniao_na_ligacao(uuid, uuid, text) is
  'RF-603: cancela a reunião em jogo da chamada (status canceled com cancel_reason) por update where status in (scheduled, confirmed), com evento automation reuniao_cancelada no lead. A segunda vez é ja_cancelada; reunião que não está de pé é status_nao_elegivel. Só service_role.';

revoke execute on function public.cancelar_reuniao_na_ligacao(uuid, uuid, text) from public;
grant execute on function public.cancelar_reuniao_na_ligacao(uuid, uuid, text) to service_role;
