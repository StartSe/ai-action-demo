-- O evento da reunião no calendário do especialista, com nova tentativa.
-- Referência: docs/PRD.md RF-508, docs/PRD-implementacao.md seção 3.3,
-- docs/revisao-tecnica.md T-10.
--
-- O evento nasce DEPOIS do insert e não o desfaz: perder a reunião porque o
-- Google demorou é pior do que um evento que aparece atrasado. Por isso a
-- falha fica na própria linha da reunião, com a contagem de tentativas e a
-- hora da próxima, e `cron-calendar-sync` tenta de novo a cada passagem pelo
-- calendário do especialista (`_shared/agenda/evento-da-reuniao.ts`).
--
-- Reunião ativa sem `external_event_id` e com `event_attempts` no teto do
-- módulo é a que desistiu: a tela de reuniões a mostra marcada, não em
-- silêncio. O teto mora no código, e não aqui, porque é ele que decide o
-- recuo entre as tentativas.

alter table public.meetings
  add column event_attempts smallint not null default 0 check (event_attempts >= 0),
  add column event_error text check (event_error is null or length(btrim(event_error)) > 0),
  add column event_retry_at timestamptz;

comment on column public.meetings.external_event_id is
  'Id do evento no calendário do especialista. Nulo com event_attempts no teto é evento que desistiu, e a tela de reuniões o mostra.';

comment on column public.meetings.event_attempts is
  'Quantas vezes a criação do evento no calendário falhou. Marca de rotina, fora da trilha de auditoria.';

comment on column public.meetings.event_error is
  'A frase da última falha ao criar o evento, já traduzida: nunca o código do provedor.';

comment on column public.meetings.event_retry_at is
  'Quando cron-calendar-sync tenta de novo. Nulo com evento gravado, e nulo quando as tentativas chegaram ao teto.';

-- O que a rotina procura a cada passagem por um calendário: as reuniões do
-- especialista ainda sem evento.
create index meetings_sem_evento
  on public.meetings (specialist_id, starts_at)
  where external_event_id is null and status in ('scheduled', 'confirmed');

-- Auditoria --------------------------------------------------------------------
-- O evento e suas tentativas são marcas do servidor, como o lembrete enviado:
-- cada nova tentativa viraria uma linha de trilha e esconderia as mudanças de
-- gente.
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
    'event_retry_at'
  );
