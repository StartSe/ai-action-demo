-- O teto do resgate e o lead para perdido com o motivo (RF-605, US-198,
-- segunda metade do terceiro critério de aceite da F6).
-- Referência: docs/PRD.md RF-203, RF-604 e RF-605, docs/revisao-tecnica.md
-- T-17 e R-01.
--
-- `enfileirar_resgates` (20261010170000) já recusa enfileirar acima de
-- `rescue_max_attempts`. Esta migração fecha o ciclo: esgotadas as tentativas,
-- e passado o recuo depois da última sem que a reunião tenha sido remarcada, o
-- lead vai para a etapa `lost` do funil da conta e a reunião ganha o desfecho
-- final da automação. Quatro decisões:
--
-- 1. **Nenhum ramo tenta para sempre (R-01).** A marca é
--    `meetings.rescue_gave_up_at`, gravada no `update ... where
--    rescue_gave_up_at is null returning` que escolhe a reunião: uma vez
--    esgotada, nenhuma execução posterior a enfileira nem a esgota de novo.
-- 2. **A etapa é a chave, nunca o rótulo** (RF-203): `mover_lead_de_etapa`
--    resolve `lost` no funil do lead, e devolve `mesma_etapa` sem segundo
--    evento quando o lead já está lá. O evento `automation` com o motivo
--    `resgate_esgotado` e a contagem nasce uma vez, pela marca da reunião.
--    Tudo na mesma transação da marca.
-- 3. **Quem remarcou sai do caminho.** Reunião que tem uma remarcação
--    apontando para ela, ou lead com reunião ativa, não esgota: a reunião nova
--    nasce `scheduled`, com `rescue_count` zero, e o lead segue vivo.
-- 4. **Teto zero é configuração legítima**: desliga o resgate, e nenhum lead vai
--    para perdido por esse caminho.
--
-- A passagem continua com teto de 25 itens no total (seção 4.6): o
-- esgotamento usa o que o enfileiramento deixou.

alter table public.meetings
  add column rescue_gave_up_at timestamptz;

comment on column public.meetings.rescue_gave_up_at is
  'Quando o resgate desistiu desta falta: tentativas esgotadas e o recuo depois da última passado sem remarcação (RF-605, R-01). Preenchida, a reunião não volta à fila do resgate, e o lead foi para a etapa lost com o motivo resgate_esgotado.';

comment on column public.meetings.detected_no_show_at is
  'Quando o primeiro resgate da falta atestada entrou na fila (US-197). É a base do recuo: o resgate n+1 sai n vezes rescue_backoff_minutes depois dela. Marca de rotina, fora da trilha de auditoria.';

-- Coluna nova em meetings exige recriar a visão das reuniões de operação
-- (20260930180000_reunioes_reais.sql): `m.*` se expande na criação.
create or replace view public.reunioes_reais
  with (security_invoker = on)
as
  select m.*
    from public.meetings as m
   where not exists (
           select 1
             from public.calls as c
            where c.id = m.booked_call_id
              and c.direction = 'rehearsal'
         );

-- As duas marcas do resgate são de rotina: cada passagem viraria uma linha de
-- trilha e esconderia as mudanças de gente, como `rescue_count`.
drop trigger meetings_auditoria on public.meetings;

create trigger meetings_auditoria
  after update or delete on public.meetings
  for each row execute function public.registrar_auditoria(
    'account_id',
    'reminder_sent_at',
    'rescue_count',
    'external_event_id',
    'event_attempts',
    'event_error',
    'event_retry_at',
    'lead_invite_sent_at',
    'lead_invite_attempts',
    'lead_invite_error',
    'lead_invite_retry_at',
    'specialist_invite_sent_at',
    'specialist_invite_attempts',
    'specialist_invite_error',
    'specialist_invite_retry_at',
    'invite_claimed_at',
    'detected_no_show_at',
    'rescue_gave_up_at'
  );

create or replace function public.enfileirar_resgates(
  p_agora timestamptz default now(),
  p_limite integer default 25
)
returns table (meeting_id uuid, account_id uuid, acao text)
language plpgsql
security definer
set search_path = ''
as $resgate$
#variable_conflict use_column
declare
  v_enfileiradas integer;
  v_esgotada record;
begin
  if p_limite is null or p_limite < 1 or p_limite > 25 then
    raise exception 'limite de % fora da faixa de 1 a 25 (seção 4.6)', p_limite using errcode = '22023';
  end if;

  -- O enfileiramento, como em 20261010170000: só falta atestada (T-17), abaixo
  -- do teto, depois do recuo.
  return query
  with candidatas as (
    select m.id, m.rescue_count
      from public.meetings as m
      join public.account_settings as s on s.account_id = m.account_id
     where m.status = 'no_show'
       and m.attestation_status = 'attested'
       and m.attested_at is not null
       and m.attested_source is not null
       and m.rescue_gave_up_at is null
       and m.rescue_count < s.rescue_max_attempts
       and (
         m.detected_no_show_at is null
         or m.detected_no_show_at + make_interval(mins => s.rescue_backoff_minutes * m.rescue_count) <= p_agora
       )
       and not exists (select 1 from public.meetings as n where n.rescheduled_from_id = m.id)
       and not exists (
         select 1 from public.meetings as a
          where a.lead_id = m.lead_id and a.status in ('scheduled', 'confirmed')
       )
       and not exists (
         select 1 from public.dial_queue as q
          where q.account_id = m.account_id
            and q.source = 'rescue'
            and split_part(q.source_ref, ':', 1) = m.id::text
            and q.status in ('queued', 'claimed')
       )
     order by coalesce(m.detected_no_show_at, m.attested_at), m.id
     limit p_limite
       for update of m skip locked
  ),
  marcadas as (
    update public.meetings as m
       set rescue_count = m.rescue_count + 1,
           detected_no_show_at = coalesce(m.detected_no_show_at, p_agora)
      from candidatas as c
     where m.id = c.id
       and m.rescue_count = c.rescue_count
    returning m.id, m.account_id, m.lead_id, m.rescue_count
  ),
  enfileiradas as (
    insert into public.dial_queue (account_id, lead_id, purpose, run_at, source, source_ref, attempt)
    select mc.account_id, mc.lead_id, 'rescue', p_agora, 'rescue', mc.id::text || ':' || mc.rescue_count, 1
      from marcadas as mc
    on conflict on constraint dial_queue_unica_por_fonte do nothing
    returning source_ref
  )
  select mc.id, mc.account_id, 'enfileirado'::text
    from marcadas as mc
    join enfileiradas as e on e.source_ref = mc.id::text || ':' || mc.rescue_count;

  get diagnostics v_enfileiradas = row_count;
  if v_enfileiradas >= p_limite then
    return;
  end if;

  -- O esgotamento: tentativas no teto, recuo depois da última passado, nada
  -- remarcado e nada na fila. A marca é a reivindicação.
  for v_esgotada in
    with esgotaveis as (
      select m.id
        from public.meetings as m
        join public.account_settings as s on s.account_id = m.account_id
       where m.status = 'no_show'
         and m.attestation_status = 'attested'
         and m.attested_at is not null
         and m.attested_source is not null
         and m.rescue_gave_up_at is null
         and s.rescue_max_attempts > 0
         and m.rescue_count >= s.rescue_max_attempts
         and m.detected_no_show_at + make_interval(mins => s.rescue_backoff_minutes * m.rescue_count) <= p_agora
         and not exists (select 1 from public.meetings as n where n.rescheduled_from_id = m.id)
         and not exists (
           select 1 from public.meetings as a
            where a.lead_id = m.lead_id and a.status in ('scheduled', 'confirmed')
         )
         and not exists (
           select 1 from public.dial_queue as q
            where q.account_id = m.account_id
              and q.source = 'rescue'
              and split_part(q.source_ref, ':', 1) = m.id::text
              and q.status in ('queued', 'claimed')
         )
       order by m.detected_no_show_at, m.id
       limit p_limite - v_enfileiradas
         for update of m skip locked
    )
    update public.meetings as m
       set rescue_gave_up_at = p_agora
      from esgotaveis as e
     where m.id = e.id
       and m.rescue_gave_up_at is null
    returning m.id, m.account_id, m.lead_id, m.rescue_count
  loop
    if v_esgotada.lead_id is not null then
      perform public.mover_lead_de_etapa(v_esgotada.lead_id, 'lost', 'system', null, 'resgate_esgotado');
      perform public.registrar_evento_de_lead(
        v_esgotada.lead_id,
        'automation',
        'system',
        null,
        null,
        jsonb_build_object(
          'acao', 'resgates_esgotados',
          'motivo', 'resgate_esgotado',
          'tentativas', v_esgotada.rescue_count,
          'meeting_id', v_esgotada.id
        )
      );
    end if;
    meeting_id := v_esgotada.id;
    account_id := v_esgotada.account_id;
    acao := 'esgotado';
    return next;
  end loop;
end;
$resgate$;

comment on function public.enfileirar_resgates(timestamptz, integer) is
  'RF-604 e RF-605: enfileira o resgate SOMENTE da falta atestada (T-17), abaixo do teto e depois do recuo, e esgota a falta que chegou ao teto com o recuo depois da última passado e sem remarcação: marca rescue_gave_up_at, move o lead para lost (pela chave) e grava o evento automation resgates_esgotados com o motivo resgate_esgotado e a contagem. Devolve (meeting_id, account_id, acao) com acao enfileirado ou esgotado, até 25 no total. Só service_role.';
