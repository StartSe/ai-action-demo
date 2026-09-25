-- Reuniões: o que a Sarah marcou, com quem, quando e em que ligação.
-- Referência: docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-511 e
-- RF-706, docs/revisao-tecnica.md T-08 e T-23.
--
-- O que torna duas reuniões no mesmo horário do mesmo especialista impossíveis
-- é a restrição de exclusão, e não uma leitura prévia de quem insere: entre a
-- leitura e a escrita cabe outra ligação marcando o mesmo horário. O teto
-- diário e a antecedência não têm forma declarativa e ficam para o RPC de
-- inserção (US-161), que trava por especialista e dia.

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Especialista é desligado, não apagado (specialists.active). Se um dia for
  -- apagado, as reuniões dele vão junto: `restrict` entre duas filhas da mesma
  -- conta derrubaria a exclusão da conta inteira (supabase/CLAUDE.md).
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  modality text not null,
  status text not null default 'scheduled',
  attestation_status text not null default 'pending',
  attested_by uuid references auth.users (id) on delete set null,
  attested_at timestamptz,
  attested_source text check (attested_source is null or length(btrim(attested_source)) > 0),
  handoff_summary jsonb,
  external_event_id text check (external_event_id is null or length(btrim(external_event_id)) > 0),
  -- "Marcada na ligação X, confirmada na ligação Y" (RF-511) e custo por
  -- reunião (RF-706). Chamada apagada pelo expurgo não apaga a reunião.
  booked_call_id uuid references public.calls (id) on delete set null,
  confirmed_call_id uuid references public.calls (id) on delete set null,
  reminder_sent_at timestamptz,
  confirmed_at timestamptz,
  detected_no_show_at timestamptz,
  rescue_count smallint not null default 0 check (rescue_count >= 0),
  rescheduled_from_id uuid references public.meetings (id) on delete set null,
  cancel_reason text check (cancel_reason is null or length(btrim(cancel_reason)) > 0),
  notes text check (notes is null or length(btrim(notes)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_intervalo_util check (ends_at > starts_at),
  constraint meetings_status_conhecido check (
    status in ('scheduled', 'confirmed', 'rescheduled', 'canceled', 'attended', 'no_show')
  ),
  constraint meetings_atestado_conhecido check (
    attestation_status in ('pending', 'attested', 'unattested')
  ),
  -- As mesmas modalidades de specialists (specialists_modalidades_conhecidas).
  constraint meetings_modalidade_conhecida check (
    modality in ('video', 'telefone', 'presencial')
  ),
  -- T-08 itens 1 e 2, com limites e predicado escritos. O '[)' faz 14h00–14h30
  -- e 14h30–15h00 conviverem; o predicado tira do conflito a reunião
  -- remarcada, cancelada ou já acontecida, e o horário volta a ficar livre.
  constraint meetings_sem_sobreposicao exclude using gist (
    specialist_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'))
);

-- T-08 item 5: um lead tem no máximo uma reunião ativa.
create unique index meetings_one_active_per_lead
  on public.meetings (lead_id)
  where status in ('scheduled', 'confirmed');

create index meetings_agenda_da_conta on public.meetings (account_id, starts_at);
create index meetings_por_especialista on public.meetings (specialist_id, starts_at);

comment on table public.meetings is
  'Reuniões marcadas pela Sarah ou pela equipe. Duas reuniões ativas (scheduled ou confirmed) do mesmo especialista não se sobrepõem por restrição de exclusão com intervalo fechado no início e aberto no fim; teto diário e antecedência são conferidos pelo RPC de inserção, na mesma transação.';

comment on column public.meetings.booked_call_id is
  'Ligação em que a reunião foi marcada. Nula quando a marcação foi manual.';

comment on column public.meetings.confirmed_call_id is
  'Ligação de confirmação, quando houve. Junto com booked_call_id dá o custo por reunião.';

comment on column public.meetings.rescue_count is
  'Quantas vezes a rotina tentou resgatar a reunião. Marca de rotina, fora da trilha de auditoria.';

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- Isolamento (classe Operação da seção 3.9) ------------------------------------
alter table public.meetings enable row level security;

create policy meetings_leitura_de_membro
  on public.meetings for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy meetings_leitura_de_membro on public.meetings is
  'Classe Operação: todo membro lê a agenda da conta, inclusive quem só observa.';

create policy meetings_insercao_de_operador
  on public.meetings for insert to authenticated
  with check ((select public.has_role(account_id, 'operator')));

comment on policy meetings_insercao_de_operador on public.meetings is
  'Classe Operação: marcar reunião à mão é trabalho de operador para cima. A Sarah marca pelo RPC de serviço.';

create policy meetings_alteracao_de_operador
  on public.meetings for update to authenticated
  using ((select public.has_role(account_id, 'operator')))
  with check ((select public.has_role(account_id, 'operator')));

comment on policy meetings_alteracao_de_operador on public.meetings is
  'Classe Operação: remarcar, cancelar e marcar o desfecho é de operador para cima.';

create policy meetings_exclusao_de_operador
  on public.meetings for delete to authenticated
  using ((select public.has_role(account_id, 'operator')));

comment on policy meetings_exclusao_de_operador on public.meetings is
  'Classe Operação: apagar reunião lançada por engano é de operador para cima; o caminho normal é cancelar.';

-- Auditoria --------------------------------------------------------------------
-- Lembrete enviado e tentativa de resgate são marcas de rotina: virariam uma
-- linha de trilha por execução e esconderiam as mudanças de gente.
create trigger meetings_auditoria
  after update or delete on public.meetings
  for each row execute function public.registrar_auditoria('account_id', 'reminder_sent_at', 'rescue_count');

-- A chave que a fila de exceções deixou para cá ----------------------------------
-- exception_items.meeting_id nasceu uuid cru na F3, porque meetings é desta
-- fatia; a chave entra junto com a tabela referida (supabase/CLAUDE.md).
alter table public.exception_items
  add constraint exception_items_reuniao
  foreign key (meeting_id) references public.meetings (id) on delete set null;

comment on constraint exception_items_reuniao on public.exception_items is
  'Entrou com meetings (F5). Reunião apagada deixa o item da fila de pé, sem a reunião.';
