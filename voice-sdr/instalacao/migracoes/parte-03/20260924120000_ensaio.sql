-- O ensaio (US-247, T-16, RF-312): conversar com a Sarah sem telefone.
--
-- **ENSAIA-SE CONTRA O QUE VAI AO AR.** A sessão abre contra o
-- `provider_agent_id` da publicação daquele propósito — o mesmo agente que
-- atende as ligações, com o mesmo prompt e as mesmas ferramentas. Um segundo
-- tempo de execução só para ensaio testaria outra coisa, e a divergência
-- apareceria justamente no dia em que alguém confiasse no ensaio.
--
-- **O ENSAIO É UMA CHAMADA.** Grava em `calls` com `direction = 'rehearsal'`,
-- que a coluna já aceita desde a F2. Isso é o que faz transcrição, custo,
-- classificação e o ciclo de evolução (US-245) funcionarem sobre ele sem uma
-- linha a mais: o botão de revisar a ligação revisa o ensaio igual.
--
-- **MÉTRICA NÃO CONTA ENSAIO.** As listagens já excluem `rehearsal` pelo
-- recorte de `_shared/recorte-de-leads.ts` e de `chamadas/consulta.ts`. Ensaio
-- que entrasse na taxa de conexão inflaria o número com conversa que ninguém
-- atendeu.
--
-- **A PERSONA É DADO DE ENTRADA, NÃO LEAD.** `calls.lead_id` fica nulo: o
-- ensaio fala com um perfil simulado, e pendurá-lo num lead real sujaria o
-- histórico dele com uma conversa que não aconteceu.

-- rehearsals --------------------------------------------------------------------
create table public.rehearsals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Cascata: ensaio de uma chamada apagada não é ensaio de nada.
  call_id uuid not null references public.calls (id) on delete cascade,
  -- Contra qual publicação se ensaiou, e com qual roteiro. `set null` pela
  -- razão de `calls.agent_publication_id`: republicar não apaga o ensaio.
  agent_publication_id uuid references public.agent_publications (id) on delete set null,
  playbook_version_id uuid references public.playbook_versions (id) on delete set null,
  -- Quem a Sarah pensou estar atendendo: nome, empresa, temperamento. Objeto
  -- para a forma não variar entre quem escreve em momentos diferentes.
  persona_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(persona_profile) = 'object'),
  -- Por onde se conversou. `voice` usa o microfone do navegador; `text` é o
  -- mesmo agente, digitando. Lista fechada: modo novo muda o que a tela monta.
  mode text not null check (mode in ('voice', 'text')),
  -- Quem ensaiou. Sem cascata: o ensaio sobrevive a quem o fez.
  created_by uuid references public.profiles (id) on delete set null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  -- Um ensaio por chamada: a chamada nasce com o ensaio e morre com ele.
  constraint rehearsals_um_por_chamada unique (call_id)
);

comment on table public.rehearsals is
  'Uma conversa de ensaio com a Sarah, sem telefone (T-16, RF-312). A transcrição não mora aqui: mora em calls, porque o ensaio é uma chamada com direction rehearsal, e é isso que faz o ciclo de evolução funcionar sobre ele.';

comment on column public.rehearsals.mode is
  'voice usa o microfone do navegador; text é o mesmo agente publicado, digitando. Os dois falam com provider_agent_id da publicação — ensaiar contra um segundo tempo de execução testaria outra coisa.';

comment on column public.rehearsals.persona_profile is
  'O perfil simulado que a Sarah pensou estar atendendo. Não é lead: calls.lead_id fica nulo no ensaio, para não sujar o histórico de ninguém com uma conversa que não aconteceu.';

create index rehearsals_conta_recente_idx
  on public.rehearsals (account_id, created_at desc);

-- abrir_ensaio ------------------------------------------------------------------
-- Cria a chamada do ensaio e a linha do ensaio na mesma transação. Existe como
-- função porque são duas escritas que não podem existir uma sem a outra: uma
-- chamada `rehearsal` sem linha em `rehearsals` seria um ensaio que a tela não
-- sabe de onde veio, e a linha sem chamada não teria transcrição.
--
-- A chave de idempotência leva o identificador da própria linha para o único
-- de `calls` nunca colidir entre dois ensaios da mesma conta no mesmo segundo.
create or replace function public.abrir_ensaio(
  p_account_id uuid,
  p_purpose text,
  p_mode text,
  p_persona jsonb,
  p_created_by uuid,
  p_agent_publication_id uuid,
  p_playbook_version_id uuid
)
returns table (call_id uuid, rehearsal_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_call_id uuid;
  v_rehearsal_id uuid := gen_random_uuid();
begin
  insert into public.calls
    (account_id, purpose, direction, status, agent_publication_id,
     playbook_version_id, idempotency_key, answered_at)
  values
    (p_account_id, p_purpose, 'rehearsal', 'in_progress', p_agent_publication_id,
     p_playbook_version_id, 'rehearsal:' || v_rehearsal_id::text, now())
  returning id into v_call_id;

  insert into public.rehearsals
    (id, account_id, call_id, agent_publication_id, playbook_version_id,
     persona_profile, mode, created_by)
  values
    (v_rehearsal_id, p_account_id, v_call_id, p_agent_publication_id,
     p_playbook_version_id, coalesce(p_persona, '{}'::jsonb), p_mode, p_created_by);

  return query select v_call_id, v_rehearsal_id;
end;
$$;

comment on function public.abrir_ensaio(uuid, text, text, jsonb, uuid, uuid, uuid) is
  'Cria a chamada do ensaio e a linha do ensaio numa transação. A chamada nasce in_progress e answered_at preenchido: no ensaio não há toque nem atendimento, a conversa começa quando a sessão abre.';

revoke all on function public.abrir_ensaio(uuid, text, text, jsonb, uuid, uuid, uuid) from public;
revoke all on function public.abrir_ensaio(uuid, text, text, jsonb, uuid, uuid, uuid) from anon;
revoke all on function public.abrir_ensaio(uuid, text, text, jsonb, uuid, uuid, uuid) from authenticated;
grant execute on function public.abrir_ensaio(uuid, text, text, jsonb, uuid, uuid, uuid) to service_role;

-- encerrar_ensaio ---------------------------------------------------------------
-- Fecha a chamada do ensaio com a transcrição que o provedor devolveu.
--
-- A escrita é condicionada a `finished_at is null`: encerrar duas vezes — o
-- botão clicado duas vezes, ou a aba fechando junto com o clique — grava uma
-- vez só, e a segunda passagem recebe zero linha em vez de sobrescrever a
-- transcrição com uma leitura mais velha do provedor.
create or replace function public.encerrar_ensaio(
  p_rehearsal_id uuid,
  p_transcript jsonb,
  p_provider_conversation_id text,
  p_duration_sec integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_call_id uuid;
begin
  update public.rehearsals
     set finished_at = now()
   where id = p_rehearsal_id
     and finished_at is null
  returning call_id into v_call_id;

  if v_call_id is null then
    return false;
  end if;

  update public.calls
     set status = 'ended',
         end_reason = 'completed',
         ended_at = now(),
         duration_sec = greatest(coalesce(p_duration_sec, 0), 0),
         transcript = coalesce(p_transcript, '{}'::jsonb),
         provider_conversation_id = nullif(btrim(coalesce(p_provider_conversation_id, '')), ''),
         finalized_at = now()
   where id = v_call_id;

  return true;
end;
$$;

comment on function public.encerrar_ensaio(uuid, jsonb, text, integer) is
  'Fecha o ensaio com a transcrição do provedor, uma vez só. Devolve falso quando o ensaio já estava encerrado, para o segundo clique não sobrescrever a conversa com uma leitura mais velha.';

revoke all on function public.encerrar_ensaio(uuid, jsonb, text, integer) from public;
revoke all on function public.encerrar_ensaio(uuid, jsonb, text, integer) from anon;
revoke all on function public.encerrar_ensaio(uuid, jsonb, text, integer) from authenticated;
grant execute on function public.encerrar_ensaio(uuid, jsonb, text, integer) to service_role;

-- Isolamento --------------------------------------------------------------------
-- Classe Servidor, como `calls`: membro lê, ninguém escreve pelo cliente. Quem
-- escreve é a borda `rehearsal-session`, que é quem fala com o provedor e é a
-- única que sabe contra qual agente a conversa aconteceu.
alter table public.rehearsals enable row level security;

create policy rehearsals_leitura_de_membro
  on public.rehearsals for select to authenticated
  using ((select public.is_member(account_id)));

comment on policy rehearsals_leitura_de_membro on public.rehearsals is
  'Classe Servidor: todo membro lê os ensaios da conta, porque é por eles que se explica o que foi testado antes de uma publicação.';
