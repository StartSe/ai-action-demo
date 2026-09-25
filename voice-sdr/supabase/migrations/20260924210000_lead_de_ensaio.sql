-- O lead de ensaio (US-112, T-16, T-25): um lead sintético por conta.
--
-- **O ENSAIO PASSA PELO CAMINHO DA LIGAÇÃO REAL.** Até aqui a chamada de ensaio
-- nascia com `lead_id` nulo, e isso a tirava do caminho de `call-init`, que
-- resolve o contexto pelo lead da chamada, e do das ferramentas, que leem o
-- lead para decidir (tool-dnc lê o telefone, o encerramento de pessoa errada
-- lê o número). Um ensaio sem lead exercita um desvio que a ligação de verdade
-- nunca toma. Agora `abrir_ensaio` pendura a chamada no lead de ensaio da
-- conta, criado na primeira vez.
--
-- **UM POR CONTA, E NUNCA UM LEAD DE VERDADE.** O ensaio não pode sujar o
-- histórico de um lead real com uma conversa que não aconteceu, e ensaio não
-- cria lead novo a cada vez. O índice único parcial segura os dois.
--
-- **FORA DA LISTA E FORA DA MÉTRICA PELA POLÍTICA.** A leitura de membro passa
-- a esconder o lead sintético. Filtro na tela seria o filtro que a próxima
-- consulta esquece, e o painel contaria um lead que ninguém cadastrou. A ficha
-- da chamada de ensaio continua abrindo: ela lê `calls` por id, e o lead vem
-- vazio, como o de uma ligação sem lead.
--
-- **O TELEFONE NÃO DISCA.** `+550000000000` passa pela forma E.164 da coluna,
-- mas DDD 00 não existe: nenhuma importação traz esse número, e se alguém o
-- pusesse na fila a operadora recusaria antes de tocar.

-- leads.is_synthetic ---------------------------------------------------------------
alter table public.leads add column if not exists is_synthetic boolean not null default false;

comment on column public.leads.is_synthetic is
  'Lead de ensaio (US-112): um por conta, criado por abrir_ensaio. Fica fora da lista e das métricas pela política de leitura, e nunca é discado.';

create unique index if not exists leads_um_sintetico_por_conta
  on public.leads (account_id)
  where is_synthetic;

-- A leitura de membro esconde o sintético ------------------------------------------
drop policy if exists leads_leitura_de_membro on public.leads;
create policy leads_leitura_de_membro
  on public.leads for select to authenticated
  using ((select public.is_member(account_id)) and not is_synthetic);

comment on policy leads_leitura_de_membro on public.leads is
  'Classe Operação: todo membro lê os leads da conta, inclusive o viewer. O lead de ensaio fica de fora (US-112): ele não entra na lista, no funil nem nas métricas.';

-- lead_de_ensaio -------------------------------------------------------------------
-- Devolve o lead de ensaio da conta, criando na primeira vez. O `on conflict`
-- sobre o índice parcial resolve a corrida de dois ensaios abertos juntos.
create or replace function public.lead_de_ensaio(p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
begin
  select id into v_lead_id
    from public.leads
   where account_id = p_account_id and is_synthetic;

  if v_lead_id is not null then
    return v_lead_id;
  end if;

  insert into public.leads (account_id, name, company, phone_e164, source, is_synthetic)
  values (p_account_id, 'Paula Siqueira', 'Transportes Itajaí', '+550000000000', 'rehearsal', true)
  on conflict (account_id) where is_synthetic do nothing
  returning id into v_lead_id;

  if v_lead_id is null then
    select id into v_lead_id
      from public.leads
     where account_id = p_account_id and is_synthetic;
  end if;

  return v_lead_id;
end;
$$;

comment on function public.lead_de_ensaio(uuid) is
  'O lead de ensaio da conta, criado na primeira vez (US-112). É por ele que a chamada de ensaio passa pelo mesmo caminho de contexto da ligação real.';

revoke all on function public.lead_de_ensaio(uuid) from public;
revoke all on function public.lead_de_ensaio(uuid) from anon;
revoke all on function public.lead_de_ensaio(uuid) from authenticated;
grant execute on function public.lead_de_ensaio(uuid) to service_role;

-- abrir_ensaio ---------------------------------------------------------------------
-- Reescrita de 20260924120000_ensaio.sql, igual exceto por `lead_id`, que passa
-- a ser o lead de ensaio da conta.
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
    (account_id, lead_id, purpose, direction, status, agent_publication_id,
     playbook_version_id, idempotency_key, answered_at)
  values
    (p_account_id, public.lead_de_ensaio(p_account_id), p_purpose, 'rehearsal', 'in_progress',
     p_agent_publication_id, p_playbook_version_id, 'rehearsal:' || v_rehearsal_id::text, now())
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
  'Cria a chamada do ensaio, pendurada no lead de ensaio da conta, e a linha do ensaio numa transação. A chamada nasce in_progress e answered_at preenchido: no ensaio não há toque nem atendimento.';

comment on column public.rehearsals.persona_profile is
  'O perfil simulado do ensaio: {"perfil": id}, com o id do catálogo de _shared/ensaio/perfis-de-lead.ts. call-init acha o perfil por aqui e devolve o contexto dele; o navegador só manda call_id (T-25).';
