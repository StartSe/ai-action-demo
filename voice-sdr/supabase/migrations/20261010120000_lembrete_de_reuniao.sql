-- O enfileiramento do lembrete de reunião (RF-601, US-192, primeiro critério de
-- aceite da F6).
-- Referência: docs/PRD-implementacao.md seções 3.3, 3.7 e 4.6, docs/PRD.md
-- RF-601, docs/revisao-tecnica.md T-07, T-15, L-14 e R-09.
--
-- A cada minuto, `cron-meeting-reminder` chama esta função, e ela faz numa
-- transação só o que a rotina precisa: escolhe as reuniões na janela, marca
-- `reminder_sent_at` e enfileira a ligação de lembrete. Quatro decisões:
--
-- 1. **A reivindicação é a marca.** `update meetings set reminder_sent_at =
--    p_agora where ... and reminder_sent_at is null returning`: só quem
--    recebe a linha enfileira (T-15 aplicada a rotina). Verificar e depois
--    marcar deixaria duas passagens sobrepostas lerem a mesma reunião como
--    não lembrada, e a segunda ligaria de novo.
-- 2. **O único da fila é a segunda rede.** O item é `source = 'rem'`,
--    `source_ref = meeting_id`, `attempt = 1`, na chave de
--    `dial_queue_unica_por_fonte`: mesmo que a marca falhasse, o banco recusaria
--    a segunda inserção. `rem` e não `meeting_reminder`: os seis nomes de T-07
--    são lista fechada desde a F2, e fonte inventada é discagem que o freio de
--    R-09 não enxerga.
-- 3. **A janela é da conta e a regra é a do módulo.** `reminder_window_*` com
--    padrão que já opera (5 a 20 minutos), as mesmas bordas inclusivas de
--    `_shared/automacao/lembrete-de-reuniao.ts`; `casos-de-lembrete.ts` cobra os
--    dois lados. Passado nunca entra: a rotina que volta de uma queda não
--    lembra reunião que já começou.
-- 4. **No máximo 25 por passagem, com `for update skip locked`** (seção 4.6),
--    e a varredura atravessa contas: cada item leva a conta da reunião, e a
--    conta vizinha nunca recebe o lembrete de outra.
--
-- A janela de discagem não é conferida aqui: quem recusa é `guard_dial`, no
-- momento da discagem, como em toda produtora.

alter table public.account_settings
  add column reminder_window_start_minutes smallint not null default 5,
  add column reminder_window_end_minutes smallint not null default 20,
  add constraint account_settings_janela_do_lembrete check (
    reminder_window_start_minutes >= 0
    and reminder_window_end_minutes <= 1440
    and reminder_window_start_minutes < reminder_window_end_minutes
  );

comment on column public.account_settings.reminder_window_start_minutes is
  'O lembrete sai para a reunião que começa a partir de tantos minutos daqui (RF-601). Abaixo disso é tarde para ligar, e a reunião fica sem lembrete em vez de receber um atrasado.';
comment on column public.account_settings.reminder_window_end_minutes is
  'O lembrete sai para a reunião que começa até tantos minutos daqui (RF-601). Com a rotina a cada minuto, é quanto antes do horário a ligação sai; o padrão é 20.';

create or replace function public.enfileirar_lembretes_de_reuniao(
  p_agora timestamptz default now(),
  p_limite integer default 25
)
returns table (meeting_id uuid, account_id uuid)
language plpgsql
security definer
set search_path = ''
as $lembrete$
#variable_conflict use_column
begin
  if p_limite is null or p_limite < 1 or p_limite > 25 then
    raise exception 'limite de % fora da faixa de 1 a 25 (seção 4.6)', p_limite using errcode = '22023';
  end if;

  return query
  with candidatas as (
    select m.id
      from public.meetings as m
      join public.account_settings as s on s.account_id = m.account_id
     where m.status = 'scheduled'
       and m.reminder_sent_at is null
       and m.starts_at >= p_agora + make_interval(mins => s.reminder_window_start_minutes)
       and m.starts_at <= p_agora + make_interval(mins => s.reminder_window_end_minutes)
     order by m.starts_at, m.id
     limit p_limite
       for update of m skip locked
  ),
  marcadas as (
    update public.meetings as m
       set reminder_sent_at = p_agora
      from candidatas as c
     where m.id = c.id
       and m.reminder_sent_at is null
    returning m.id, m.account_id, m.lead_id
  ),
  enfileiradas as (
    insert into public.dial_queue (account_id, lead_id, purpose, run_at, source, source_ref, attempt)
    select mc.account_id, mc.lead_id, 'reminder', p_agora, 'rem', mc.id::text, 1
      from marcadas as mc
    on conflict on constraint dial_queue_unica_por_fonte do nothing
    returning source_ref
  )
  select mc.id, mc.account_id
    from marcadas as mc
    join enfileiradas as e on e.source_ref = mc.id::text;
end;
$lembrete$;

comment on function public.enfileirar_lembretes_de_reuniao(timestamptz, integer) is
  'RF-601: marca reminder_sent_at e enfileira a ligação de lembrete (purpose reminder, source rem, source_ref = meeting_id, attempt 1) das reuniões scheduled que começam dentro da janela da conta, até 25 por passagem, com for update skip locked. A marca é a reivindicação: duas passagens seguidas deixam um item só. Devolve o que entrou na fila. Só service_role.';

revoke execute on function public.enfileirar_lembretes_de_reuniao(timestamptz, integer) from public;
grant execute on function public.enfileirar_lembretes_de_reuniao(timestamptz, integer) to service_role;
