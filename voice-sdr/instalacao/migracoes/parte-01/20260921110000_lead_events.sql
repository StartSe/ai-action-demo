-- `lead_events`: a linha do tempo do lead, escrita por RPC e nunca pelo cliente.
-- Referência: docs/PRD-implementacao.md seções 3.2 e 3.9, docs/PRD.md RF-113,
-- docs/revisao-tecnica.md (a crítica ao "só inserção com política de insert
-- para membros").
--
-- Três decisões estruturam esta migração:
--
-- 1. **Não há política de escrita.** A tabela é classe Servidor: RLS ligada e
--    uma única política, de leitura por membro. Sem política de insert, o
--    padrão nega — inclusive para o owner. É o que fecha a brecha apontada na
--    revisão técnica: com política de insert para membro, o cliente escreveria
--    `actor = 'agent'` e um `actor_id` qualquer, e a linha do tempo passaria a
--    contar o que ninguém fez.
-- 2. **O autor não vem do parâmetro quando há sessão.** `registrar_evento_de_lead`
--    é o único caminho de escrita, e quando quem chama está autenticado o autor
--    é `auth.uid()`, não o que o argumento disser. Só a chave de serviço — que
--    chega sem `auth.uid()`, pela borda — declara `agent` ou `system`.
-- 3. **A conta se resolve pelo lead, não pelo chamador.** O RPC não recebe
--    `account_id`: ele o lê da linha do lead. Assim o evento nunca pertence a
--    uma conta diferente da do lead que ele narra, e a conferência de membro
--    tem contra o que ser feita.

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  -- Vocabulário fechado: ampliar a lista é trabalho de migração, não de código.
  -- Evento que o servidor inventasse em tempo de execução não teria consulta,
  -- não teria ícone na linha do tempo e não teria quem o explicasse.
  kind text not null check (kind in (
    'lead_created',
    'lead_imported',
    'lead_updated',
    'stage_change',
    'note',
    'blocked',
    'unblocked',
    'merged'
  )),
  -- Mesmo vocabulário de `audit_log`: `user` é gente com sessão, `agent` é a
  -- Sarah decidindo sozinha, `system` é rotina do servidor.
  actor text not null check (actor in ('user', 'agent', 'system')),
  -- Sem chave estrangeira para profiles, pelo mesmo motivo de `audit_log`: o
  -- evento precisa sobreviver à saída de quem o gerou.
  actor_id uuid,
  call_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  -- Quando o fato aconteceu. Separado de `created_at`, que é quando ele foi
  -- registrado: importação e webhook chegam depois do que narram.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Ação de gente sem autor identificado não é linha do tempo, é ruído.
  check (actor <> 'user' or actor_id is not null),
  check (actor <> 'system' or actor_id is null)
);

-- A razão de não haver `updated_at` mora aqui, e é também o que mantém a tabela
-- fora da varredura estrutural de auditoria: o que nunca muda não precisa de
-- trilha do que mudou.
comment on table public.lead_events is
  'Linha do tempo do lead (RF-113). Classe Servidor da seção 3.9: membro lê, ninguém escreve pelo cliente. Só inserção, e só por registrar_evento_de_lead; sem updated_at porque a linha nunca é alterada.';

comment on column public.lead_events.call_id is
  'Ligação que originou o evento. Sem chave estrangeira nesta fatia: a tabela calls entra na F2, e a referência com ela.';

comment on column public.lead_events.actor_id is
  'Quem agiu. Sem chave estrangeira: o evento sobrevive a quem o gerou, como em audit_log.';

comment on column public.lead_events.occurred_at is
  'Quando o fato aconteceu, que não é quando ele foi registrado (created_at).';

-- A consulta da linha do tempo é uma só: os eventos de um lead, do mais recente
-- para o mais antigo (RF-113, tela da F4).
create index lead_events_linha_do_tempo_idx
  on public.lead_events (account_id, lead_id, occurred_at desc);

-- Isolamento (classe Servidor da seção 3.9) --------------------------------------
alter table public.lead_events enable row level security;

create policy lead_events_leitura_de_membro
  on public.lead_events
  for select
  to authenticated
  using ((select public.is_member(account_id)));

comment on policy lead_events_leitura_de_membro on public.lead_events is
  'Classe Servidor: membro lê a linha do tempo da própria conta. Não há política de insert, update nem delete, nem para o owner, e é esse o ponto da tabela: quem escreve é registrar_evento_de_lead.';

-- Escrita ------------------------------------------------------------------------
-- O único caminho de entrada. `security definer` porque a tabela não tem
-- política de escrita: a função roda como dona e é o grant dela, não a RLS, que
-- diz quem pode chamar.
--
-- `p_actor` e `p_actor_id` só valem para quem chega sem sessão de usuário, que
-- é a borda com a chave de serviço. Com sessão, o autor é `auth.uid()` e o
-- argumento é descartado — é o que impede o cliente de assinar um evento como
-- se fosse a Sarah.
create or replace function public.registrar_evento_de_lead(
  p_lead_id uuid,
  p_kind text,
  p_actor text default 'user',
  p_actor_id uuid default null,
  p_summary text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $evento$
declare
  v_account_id uuid;
  v_chamador uuid := auth.uid();
  v_actor text;
  v_actor_id uuid;
  v_id uuid;
begin
  select l.account_id
    into v_account_id
    from public.leads as l
   where l.id = p_lead_id;

  if v_account_id is null then
    raise exception 'lead_inexistente'
      using errcode = '23503',
            detail = 'não há lead com este id; o evento narraria coisa nenhuma';
  end if;

  if v_chamador is null then
    -- Sem sessão: só a chave de serviço chega aqui, e é ela que registra o que
    -- a Sarah e as rotinas fazem.
    v_actor := coalesce(p_actor, 'user');
    v_actor_id := p_actor_id;
  else
    if not public.is_member(v_account_id) then
      raise exception 'sem_permissao'
        using errcode = '42501',
              detail = 'o evento é de um lead de conta de que quem chama não participa';
    end if;
    v_actor := 'user';
    v_actor_id := v_chamador;
  end if;

  insert into public.lead_events (
    account_id, lead_id, kind, actor, actor_id, summary, payload
  )
  values (
    v_account_id,
    p_lead_id,
    p_kind,
    v_actor,
    v_actor_id,
    p_summary,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$evento$;

comment on function public.registrar_evento_de_lead(uuid, text, text, uuid, text, jsonb) is
  'Único caminho de escrita em lead_events. Resolve a conta pelo lead, recusa quem não é membro dela e, com sessão, assina o evento com auth.uid() em vez do argumento.';

-- O padrão do Postgres concede execução a `public`, que alcança qualquer papel
-- presente ou futuro. Depois do revoke, o grant nomeia quem chama: a interface
-- (`authenticated`) e a borda (`service_role`). `anon` fica de fora — quem não
-- entrou não tem lead para narrar.
revoke execute on function public.registrar_evento_de_lead(uuid, text, text, uuid, text, jsonb) from public;
grant execute on function public.registrar_evento_de_lead(uuid, text, text, uuid, text, jsonb)
  to authenticated, service_role;
