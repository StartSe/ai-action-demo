-- A ligação entra na linha do tempo do lead por um evento que aponta a chamada
-- (US-147, RF-113, quarto critério de aceite da F4).
--
-- A ficha do lead desenha **uma** lista, e a fonte dela é `lead_events`. Até
-- aqui nenhuma chamada deixava rastro ali: a ligação morava só em `calls`, e a
-- ficha teria de juntar duas consultas em duas listas, que é justamente o que o
-- critério recusa. Três decisões:
--
-- 1. **Um gatilho em `calls`, e não a borda.** A chamada chega ao fim por
--    call-finalize, por cron-call-recovery e por call-cancel; um evento escrito
--    por cada um deles seria três cópias do mesmo insert, e a quarta borda que
--    encerrar chamada esqueceria o seu. O gatilho dispara quando `status`
--    entra em `ended` ou `failed`, venha de onde vier.
-- 2. **Um evento por chamada, garantido pelo índice.** `lead_events_uma_ligacao_idx`
--    é único em `call_id` para `kind = 'call'`: a chamada que volta a `ended`
--    num segundo update (a recuperação que refaz a finalização) não narra a
--    ligação duas vezes.
-- 3. **O evento aponta; quem conta é `calls`.** O `payload` guarda o retrato do
--    fim (direção, propósito, desfecho, duração) para a linha do tempo ter o
--    que dizer mesmo se a chamada não for legível, mas a ficha lê duração e
--    gravação da linha de `calls` pelo `call_id`: a gravação expurgada pela
--    retenção só se sabe lá.
--
-- `occurred_at` é `started_at`: a ligação aconteceu quando começou, e ordenar
-- pelo fim poria a ligação depois da mudança de etapa que ela mesma causou.
--
-- Fora da linha do tempo: ensaio (`direction = 'rehearsal'`, T-16), chamada sem
-- lead e chamada que não terminou.

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
  'call'
));

comment on column public.lead_events.call_id is
  'Ligação que originou o evento. Todo evento de kind call tem um, e um só por chamada (lead_events_uma_ligacao_idx). Sem chave estrangeira: o evento sobrevive ao que a retenção fizer com a chamada.';

create unique index lead_events_uma_ligacao_idx
  on public.lead_events (call_id)
  where kind = 'call';

create or replace function public.narrar_ligacao_na_linha_do_tempo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $ligacao$
begin
  if new.lead_id is null
     or new.direction = 'rehearsal'
     or new.status not in ('ended', 'failed') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('ended', 'failed') then
    return new;
  end if;

  -- `agent`: quem ligou foi a Sarah, inclusive na chamada recebida, que ela
  -- atendeu.
  insert into public.lead_events (
    account_id, lead_id, kind, actor, call_id, occurred_at, payload
  )
  values (
    new.account_id,
    new.lead_id,
    'call',
    'agent',
    new.id,
    new.started_at,
    jsonb_build_object(
      'direction', new.direction,
      'purpose', new.purpose,
      'status', new.status,
      'end_reason', new.end_reason,
      'duration_sec', new.duration_sec
    )
  )
  on conflict (call_id) where kind = 'call' do nothing;

  return new;
end;
$ligacao$;

comment on function public.narrar_ligacao_na_linha_do_tempo() is
  'Grava o evento call em lead_events quando a chamada de um lead termina (ended ou failed), uma vez por chamada. Ensaio e chamada sem lead ficam de fora.';

revoke execute on function public.narrar_ligacao_na_linha_do_tempo() from public;

create trigger calls_na_linha_do_tempo
  after insert or update of status on public.calls
  for each row execute function public.narrar_ligacao_na_linha_do_tempo();

-- As chamadas que já terminaram antes desta migração entram do mesmo jeito.
insert into public.lead_events (account_id, lead_id, kind, actor, call_id, occurred_at, payload)
select c.account_id,
       c.lead_id,
       'call',
       'agent',
       c.id,
       c.started_at,
       jsonb_build_object(
         'direction', c.direction,
         'purpose', c.purpose,
         'status', c.status,
         'end_reason', c.end_reason,
         'duration_sec', c.duration_sec
       )
  from public.calls as c
 where c.lead_id is not null
   and c.direction <> 'rehearsal'
   and c.status in ('ended', 'failed')
on conflict (call_id) where kind = 'call' do nothing;
