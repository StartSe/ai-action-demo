-- Conta, perfil e vínculo de membro: as três tabelas de que toda a aplicação
-- depende, mais as funções de papel usadas pelas políticas de isolamento.
-- Referência: docs/PRD-implementacao.md seções 3.1 e 3.9.

-- Extensões -----------------------------------------------------------------
-- btree_gist: restrições de exclusão que misturam igualdade e intervalo
-- (agenda de especialista). pg_trgm: busca por semelhança de nome de lead.
-- pgcrypto: geração de uuid e hash de token de convite.
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Gatilho comum de updated_at ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Mantém updated_at no instante da última escrita. Use em after/before update.';

-- accounts -------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.accounts is
  'Empresa cliente. Raiz do isolamento: nenhuma linha de negócio existe sem conta.';

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- profiles -------------------------------------------------------------------
-- Espelha auth.users. Sem account_id: o mesmo usuário pode servir várias contas.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Espelho de auth.users no schema público. Preenchido pelo gatilho em auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Cria o profile assim que o usuário nasce em auth.users, na mesma transação.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- account_members ------------------------------------------------------------
create table public.account_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id)
);

comment on table public.account_members is
  'Vínculo entre usuário e conta, com o papel. Uma linha por par (conta, usuário).';

-- A consulta mais frequente parte do usuário autenticado: "de quais contas
-- este usuário é membro". O índice cobre is_member e has_role.
create index account_members_user_account_idx
  on public.account_members (user_id, account_id);

create trigger account_members_set_updated_at
  before update on public.account_members
  for each row execute function public.set_updated_at();

-- Funções de papel -----------------------------------------------------------
-- Hierarquia: owner contém admin, que contém operator, que contém viewer.
create or replace function public.role_rank(role text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case role
    when 'owner' then 4
    when 'admin' then 3
    when 'operator' then 2
    when 'viewer' then 1
  end::smallint;
$$;

comment on function public.role_rank(text) is
  'Ordena os papéis. Papel desconhecido devolve null, e a comparação nega o acesso.';

create or replace function public.is_member(account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members as m
    where m.account_id = is_member.account_id
      and m.user_id = (select auth.uid())
  );
$$;

comment on function public.is_member(uuid) is
  'Verdadeiro quando o usuário da sessão pertence à conta. Invoque como (select is_member(account_id)).';

create or replace function public.has_role(account_id uuid, required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members as m
    where m.account_id = has_role.account_id
      and m.user_id = (select auth.uid())
      and public.role_rank(m.role) >= public.role_rank(has_role.required_role)
  );
$$;

comment on function public.has_role(uuid, text) is
  'Verdadeiro quando o papel do usuário na conta alcança o papel exigido, pela hierarquia.';

revoke execute on function public.role_rank(text) from public;
revoke execute on function public.is_member(uuid) from public;
revoke execute on function public.has_role(uuid, text) from public;

-- anon também executa: sem auth.uid() as duas devolvem falso, e é isso que
-- se quer. Sem o grant, a política de uma sessão anônima estouraria
-- "permission denied for function" em vez de simplesmente não devolver linha.
grant execute on function public.is_member(uuid) to anon, authenticated, service_role;
grant execute on function public.has_role(uuid, text) to anon, authenticated, service_role;

-- Isolamento --------------------------------------------------------------
-- RLS habilitada já na criação: sem política, o padrão é negar tudo, e negar
-- é o estado seguro para quem esquecer de escrever a política. A matriz de
-- políticas destas três tabelas vem na migração seguinte.
alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.account_members enable row level security;
