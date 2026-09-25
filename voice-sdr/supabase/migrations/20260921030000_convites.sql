-- Convite de equipe: a única porta de entrada para um novo membro.
-- Referência: docs/PRD.md RF-005 e docs/PRD-implementacao.md seções 3.1 e 4.4.
--
-- O link levado ao convidado carrega o token em claro; o banco guarda só o
-- sha-256 dele. Vazamento da tabela não devolve link utilizável, e a coluna
-- é comparada por igualdade exata, que é o que um hash permite.
--
-- Quem resolve o token é a função de borda invite-accept, sem JWT, porque
-- quem clica pode nem ter sessão ainda. Ela chama o RPC aceitar_convite, que
-- valida e cria o vínculo na mesma transação — a regra de quando um convite
-- vale mora aqui, no banco, e não na borda.

-- invitations ----------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  email text not null check (position('@' in btrim(email)) > 1),
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  -- sha-256 do token em claro, em hexadecimal. Nunca o token.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  -- Aceito tem quem aceitou, e quem aceitou tem quando. Uma coluna sem a
  -- outra seria um convite consumido sem dono, ou um dono sem consumo.
  check ((accepted_at is null) = (accepted_by is null))
);

comment on table public.invitations is
  'Convite de equipe por link. Guarda o hash do token, nunca o token em claro.';

comment on column public.invitations.token_hash is
  'sha-256 hexadecimal do token que viaja no link. A borda calcula o mesmo hash e busca por igualdade.';

comment on column public.invitations.revoked_at is
  'Revogação deixa rastro em vez de apagar a linha, para a tela de equipe mostrar o que foi cancelado.';

-- Um convite pendente por e-mail em cada conta. Reenviar é atualizar este
-- convite — novo token_hash, novo expires_at — e não empilhar um segundo,
-- que deixaria dois links válidos com papéis possivelmente diferentes.
create unique index invitations_pendente_por_email_idx
  on public.invitations (account_id, lower(btrim(email)))
  where accepted_at is null and revoked_at is null;

-- A tela de equipe lista os convites de uma conta por data.
create index invitations_conta_idx
  on public.invitations (account_id, created_at desc);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- Isolamento -----------------------------------------------------------------
alter table public.invitations enable row level security;

create policy invitations_leitura_membro
  on public.invitations
  for select
  to authenticated
  using ((select public.is_member(account_id)));

comment on policy invitations_leitura_membro on public.invitations is
  'Classe Configuração: membro vê os convites da própria conta. O token não está aqui, só o hash.';

create policy invitations_insercao_admin
  on public.invitations
  for insert
  to authenticated
  with check (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
    and invited_by = (select auth.uid())
  );

comment on policy invitations_insercao_admin on public.invitations is
  'Admin convida, em nome próprio. Convidar para owner é privilégio de owner. Viewer não convida.';

create policy invitations_atualizacao_admin
  on public.invitations
  for update
  to authenticated
  using (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
  )
  with check (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
  );

comment on policy invitations_atualizacao_admin on public.invitations is
  'Revogar e reenviar são update, e exigem admin. Convite de owner só owner mexe.';

create policy invitations_exclusao_admin
  on public.invitations
  for delete
  to authenticated
  using (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
  );

comment on policy invitations_exclusao_admin on public.invitations is
  'Faxina de convite antigo. Revogar é o caminho normal; apagar some com o rastro.';

-- Aceite ---------------------------------------------------------------------
-- O convidado não tem papel na conta ainda, então nenhuma política o
-- alcançaria: aceitar é necessariamente security definer. A função recebe o
-- usuário em vez de ler auth.uid() porque quem a chama é a função de borda,
-- com a chave de serviço, onde auth.uid() é nulo.
--
-- Devolve um código, não uma frase: quem traduz para português é a borda, que
-- é onde o texto de interface do produto mora.
--
--   aceito             vínculo criado com o papel do convite
--   ja_membro          já pertencia à conta; o papel anterior fica de pé
--   ja_aceito          o link já foi usado
--   expirado           passou de expires_at
--   revogado           quem convidou cancelou
--   nao_encontrado     nenhum convite com este hash
--   email_divergente   o convite é para outro endereço
--   usuario_desconhecido  o id não corresponde a nenhum usuário
create or replace function public.aceitar_convite(
  p_token_hash text,
  p_usuario_id uuid
)
returns table (
  resultado text,
  conta_id uuid,
  conta_nome text,
  papel text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite public.invitations%rowtype;
  v_email text;
  v_papel_atual text;
begin
  select u.email into v_email
    from auth.users as u
   where u.id = p_usuario_id;

  if v_email is null then
    return query select 'usuario_desconhecido'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- for update serializa dois cliques no mesmo link: o segundo espera e
  -- encontra accepted_at já preenchido.
  select * into v_convite
    from public.invitations as i
   where i.token_hash = lower(btrim(p_token_hash))
     for update;

  if not found then
    return query select 'nao_encontrado'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_convite.revoked_at is not null then
    return query select 'revogado'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_convite.accepted_at is not null then
    return query select 'ja_aceito'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_convite.expires_at <= now() then
    return query select 'expirado'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- O link é para um endereço, não para quem o tiver. Sem esta conferência,
  -- qualquer um a quem o link fosse repassado entraria na conta.
  if lower(btrim(v_convite.email)) <> lower(btrim(v_email)) then
    return query select 'email_divergente'::text, null::uuid, null::text, null::text;
    return;
  end if;

  select m.role into v_papel_atual
    from public.account_members as m
   where m.account_id = v_convite.account_id
     and m.user_id = p_usuario_id;

  -- Já ser membro não rebaixa nem promove ninguém em silêncio: o papel de
  -- quem já está dentro se muda pela tela de equipe, com quem manda olhando.
  if v_papel_atual is null then
    insert into public.account_members (account_id, user_id, role)
    values (v_convite.account_id, p_usuario_id, v_convite.role);
  end if;

  update public.invitations
     set accepted_at = now(),
         accepted_by = p_usuario_id
   where id = v_convite.id;

  return query
    select case when v_papel_atual is null then 'aceito' else 'ja_membro' end,
           a.id,
           a.name,
           coalesce(v_papel_atual, v_convite.role)
      from public.accounts as a
     where a.id = v_convite.account_id;
end;
$$;

comment on function public.aceitar_convite(text, uuid) is
  'Resolve o hash do token e cria o vínculo na mesma transação. Devolve código, não frase. Só service_role executa.';

-- Só a chave de serviço chama: nem anon nem authenticated, porque a função
-- escolhe o usuário por parâmetro. Exposta ao cliente, qualquer um se
-- vincularia como qualquer outro.
revoke execute on function public.aceitar_convite(text, uuid) from public;
grant execute on function public.aceitar_convite(text, uuid) to service_role;
