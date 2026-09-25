-- Matriz de isolamento das três tabelas da fundação. A regra de quem lê e de
-- quem escreve vive aqui, no banco, e não na aplicação: a migração anterior
-- habilitou RLS sem política nenhuma, que nega tudo; esta abre exatamente o
-- que a matriz de docs/PRD-implementacao.md seção 3.9 prevê.
--
-- accounts é da classe Configuração: leitura por membro, escrita por admin.
-- Exclusão é da classe Dono: só owner. account_members segue accounts, com
-- uma trava a mais: mexer em linha de owner é privilégio de owner.
-- profiles não tem account_id — o mesmo usuário serve várias contas — e por
-- isso sua visibilidade se deriva do vínculo, não de uma coluna.
--
-- Toda política é `to authenticated`. Sessão anônima não casa com nenhuma e
-- recebe zero linha, que é o estado seguro.

-- Reafirma o estado da migração anterior. RLS é o alicerce destas políticas:
-- se alguém desabilitar lá, o comando aqui recoloca.
alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.account_members enable row level security;

-- accounts -------------------------------------------------------------------
-- A conta é a raiz do isolamento: o account_id dela é a própria coluna id.

create policy accounts_leitura_membro
  on public.accounts
  for select
  to authenticated
  using ((select public.is_member(id)));

comment on policy accounts_leitura_membro on public.accounts is
  'Classe Configuração: membro lê a conta de que participa, e só ela.';

create policy accounts_atualizacao_admin
  on public.accounts
  for update
  to authenticated
  using ((select public.has_role(id, 'admin')))
  with check ((select public.has_role(id, 'admin')));

comment on policy accounts_atualizacao_admin on public.accounts is
  'Classe Configuração: escrita exige admin. Operator e viewer leem e não mudam.';

create policy accounts_exclusao_owner
  on public.accounts
  for delete
  to authenticated
  using ((select public.has_role(id, 'owner')));

comment on policy accounts_exclusao_owner on public.accounts is
  'Classe Dono: apagar a conta leva todo o dado junto, e isso é decisão de owner.';

-- Não há política de insert em accounts, e é deliberado: ninguém é admin de
-- uma conta que ainda não existe, então qualquer with_check seria falso. Criar
-- conta é trabalho de RPC security definer, que grava a conta e o vínculo de
-- owner na mesma transação.

-- profiles -------------------------------------------------------------------

create policy profiles_leitura_colega
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.account_members as m
      where m.user_id = profiles.id
        and (select public.is_member(m.account_id))
    )
  );

comment on policy profiles_leitura_colega on public.profiles is
  'O próprio perfil, mais o de quem divide alguma conta comigo. Estranho não aparece.';

create policy profiles_atualizacao_propria
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

comment on policy profiles_atualizacao_propria on public.profiles is
  'Cada um edita o próprio perfil. Nem admin escreve no perfil alheio.';

-- Sem insert e sem delete: o profile nasce pelo gatilho em auth.users e morre
-- junto com o usuário, ambos fora do alcance do cliente.

-- account_members ------------------------------------------------------------

create policy account_members_leitura_membro
  on public.account_members
  for select
  to authenticated
  using ((select public.is_member(account_id)));

comment on policy account_members_leitura_membro on public.account_members is
  'Membro enxerga a equipe da própria conta, com os papéis. Fora dela, nada.';

create policy account_members_insercao_admin
  on public.account_members
  for insert
  to authenticated
  with check (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
  );

comment on policy account_members_insercao_admin on public.account_members is
  'Admin convida e vincula. Criar owner é privilégio de owner. Viewer não insere.';

create policy account_members_atualizacao_admin
  on public.account_members
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

comment on policy account_members_atualizacao_admin on public.account_members is
  'Admin muda papel de membro. Mexer em linha de owner, ou promover a owner, só owner.';

create policy account_members_exclusao_admin
  on public.account_members
  for delete
  to authenticated
  using (
    (select public.has_role(account_id, 'admin'))
    and (role <> 'owner' or (select public.has_role(account_id, 'owner')))
  );

comment on policy account_members_exclusao_admin on public.account_members is
  'Admin remove membro. Desligar um owner é decisão de owner.';
