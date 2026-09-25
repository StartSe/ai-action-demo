-- O enfileiramento do resgate: só em falta atestada (RF-604, US-197, terceiro
-- critério de aceite da F6).
-- Referência: docs/PRD-implementacao.md seções 3.3, 3.7 e 4.6, docs/PRD.md
-- RF-604, RF-605 e RF-516, docs/revisao-tecnica.md T-07, T-17 e R-09.
--
-- **A PORTA DE ENTRADA É UMA SÓ: FALTA ATESTADA (T-17).** A reunião entra no
-- resgate quando alguém disse que a pessoa faltou: `status = 'no_show'` com
-- `attestation_status = 'attested'`, `attested_at` e `attested_source`
-- preenchidos (painel, e-mail de apuração, ligação de acompanhamento). Reunião
-- com apuração pendente NUNCA entra, mesmo que o horário tenha passado há
-- horas. A ligação que diz "você não compareceu" para quem compareceu — o
-- especialista atrasou, o link quebrou, a conversa aconteceu por outro canal —
-- é a mais destrutiva do produto, e o defeito que T-17 descreve é exatamente
-- inferir a falta pelo relógio. Não há `ends_at < p_agora` nesta função, de
-- propósito.
--
-- Quatro decisões mais:
--
-- 1. **A reivindicação é a marca.** `rescue_count + 1` e `detected_no_show_at`
--    (o primeiro resgate) se gravam no `update ... returning` que escolhe a
--    reunião, com a contagem lida como guarda: a segunda passagem no mesmo
--    instante não a vê, e o item entra uma vez só. O item é `source =
--    'rescue'`, `source_ref = '{reunião}:{n}'`, `attempt = 1`, no formato de
--    T-07 que a F2 fechou (`rescue:{reunião}:{n}`), e o único da fila é a
--    segunda rede.
-- 2. **Recuo entre resgates e teto são da conta** (`rescue_backoff_minutes`,
--    `rescue_max_attempts`), com padrão que já opera: o resgate n+1 só sai
--    `n × recuo` depois do primeiro. Teto zero desliga o resgate, e é
--    configuração legítima.
-- 3. **O resgate para quando deixa de fazer sentido**: a reunião já foi
--    remarcada (há uma que aponta para ela), o lead tem outra reunião ativa, ou
--    o resgate anterior ainda está na fila esperando a vez.
-- 4. **No máximo 25 por passagem, com `for update skip locked`** (seção 4.6),
--    atravessando contas; cada item leva a conta da reunião.

alter table public.account_settings
  add column rescue_max_attempts smallint not null default 2
    constraint account_settings_teto_de_resgate check (rescue_max_attempts between 0 and 10),
  add column rescue_backoff_minutes integer not null default 1440
    constraint account_settings_recuo_de_resgate check (rescue_backoff_minutes between 1 and 20160);

comment on column public.account_settings.rescue_max_attempts is
  'Quantas ligações de resgate uma falta atestada recebe (RF-605). Zero desliga o resgate: nenhuma reunião é enfileirada e nenhum lead vai para perdido por esse caminho.';
comment on column public.account_settings.rescue_backoff_minutes is
  'A espera entre um resgate e o seguinte, em minutos (RF-605). O resgate n+1 sai n vezes este recuo depois do primeiro.';

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
begin
  if p_limite is null or p_limite < 1 or p_limite > 25 then
    raise exception 'limite de % fora da faixa de 1 a 25 (seção 4.6)', p_limite using errcode = '22023';
  end if;

  return query
  with candidatas as (
    select m.id, m.rescue_count
      from public.meetings as m
      join public.account_settings as s on s.account_id = m.account_id
     where m.status = 'no_show'
       and m.attestation_status = 'attested'
       and m.attested_at is not null
       and m.attested_source is not null
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
end;
$resgate$;

comment on function public.enfileirar_resgates(timestamptz, integer) is
  'RF-604: enfileira a ligação de resgate (purpose rescue, source rescue, source_ref {reunião}:{n}, attempt 1) SOMENTE da reunião no_show com a falta atestada (attestation_status attested, attested_at e attested_source preenchidos), nunca da pendente (T-17). Incrementa rescue_count e marca detected_no_show_at no mesmo update que reivindica; respeita teto e recuo de account_settings; para quando a reunião foi remarcada, o lead tem reunião ativa ou o resgate anterior está na fila. Até 25 por passagem. Só service_role.';

revoke execute on function public.enfileirar_resgates(timestamptz, integer) from public;
grant execute on function public.enfileirar_resgates(timestamptz, integer) to service_role;
