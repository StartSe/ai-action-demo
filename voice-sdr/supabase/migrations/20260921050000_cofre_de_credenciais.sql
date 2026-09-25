-- Cofre de credenciais por conta: onde a chave do provedor fica e por onde ela
-- sai. Referência: docs/PRD.md RF-007, docs/PRD-implementacao.md seções 3.1,
-- 3.9 (classe Dono) e 8.
--
-- A regra do produto é curta: o valor nunca volta para o navegador. Ela se
-- traduz em três decisões, e cada uma delas tem um teste em
-- testes/banco/cofre-de-credenciais.test.ts.
--
-- 1. O valor não mora nesta tabela. Mora no Vault, e `secret_id` é só o
--    ponteiro. Um `select *` que escapasse devolveria um uuid, não a chave.
-- 2. `account_secrets` tem RLS ligada e **nenhuma política**, para papel
--    nenhum — nem para o dono. Sem política, o padrão é negar, e negar é o que
--    se quer aqui. É a única tabela da fundação assim, e é deliberado: o que a
--    interface precisa saber (qual provedor tem chave, quando foi trocada) sai
--    por `list_account_secrets`, que devolve metadado.
-- 3. Ler o valor é `get_account_secret`, concedida **só** a `service_role`.
--    Quem a chama é função de servidor, pelo `_shared/secrets.ts`. Um cliente
--    com a chave anônima ou com JWT de usuário esbarra em permission denied.
--
-- Escrever, listar e apagar exigem `owner`: é a classe Dono da matriz. As três
-- leem `auth.uid()`, então são RPC de cliente, e o grant é a `authenticated`.

-- Contrato com a plataforma ---------------------------------------------------
-- O Vault é do Supabase (extensão supabase_vault, no schema `vault`), como
-- `auth.users` é do Supabase. Não se cria aqui, se confere: uma migração que
-- falha com a razão escrita é melhor do que uma função que só quebra quando o
-- primeiro cliente grava a chave. Nos testes, quem recria o recorte usado por
-- estas funções é o preâmbulo de testes/auxiliares/banco-de-teste.ts.
do $contrato$
begin
  if to_regclass('vault.secrets') is null then
    raise exception 'o cofre de credenciais depende do Vault e o schema vault não existe neste banco'
      using hint = 'habilite a extensão supabase_vault antes de aplicar esta migração';
  end if;
end
$contrato$;

-- account_secrets -------------------------------------------------------------
create table public.account_secrets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- Provedor e chave em minúsculas, normalizados na escrita. Sem isso,
  -- 'ElevenLabs' e 'elevenlabs' seriam duas credenciais e a resolução pegaria
  -- a errada conforme quem gravou.
  provider text not null check (provider = lower(btrim(provider)) and provider <> ''),
  key_name text not null check (key_name = lower(btrim(key_name)) and key_name <> ''),
  -- Ponteiro para vault.secrets. Único porque dois apontadores para o mesmo
  -- segredo fariam o delete de um deixar o outro pendurado no vazio.
  secret_id uuid not null unique,
  -- O que dá para mostrar na tela: últimos dígitos, rótulo do ambiente, id do
  -- recurso no provedor. Nunca o valor.
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider, key_name)
);

comment on table public.account_secrets is
  'Credenciais de provedor por conta. Guarda o ponteiro para o Vault, nunca o valor. Sem política de cliente: leitura só por get_account_secret, com a chave de serviço.';

comment on column public.account_secrets.secret_id is
  'Id em vault.secrets. O valor em claro só sai por vault.decrypted_secrets, dentro de função security definer.';

comment on column public.account_secrets.metadata is
  'Metadado exibível: sufixo da chave, ambiente, id do recurso. Nada que reconstrua a credencial.';

create trigger account_secrets_set_updated_at
  before update on public.account_secrets
  for each row execute function public.set_updated_at();

-- Isolamento ------------------------------------------------------------------
-- Ligada e vazia. Nenhum `create policy` abaixo, e é o ponto: RLS sem política
-- nega tudo, inclusive para o owner. A varredura de
-- testes/banco/travessia-entre-contas.test.ts conhece esta tabela pelo nome e
-- cobra justamente que ela siga fechada nos dois sentidos.
alter table public.account_secrets enable row level security;

-- Escrita ---------------------------------------------------------------------
-- Cria ou substitui a credencial da conta. O valor entra por parâmetro, vai
-- direto para o Vault e não volta: o retorno é o id da linha de metadado.
--
-- Substituir reaproveita o mesmo `secret_id`. Assim quem guardou o ponteiro
-- (uma configuração de recurso, um job) continua apontando para o lugar certo
-- depois da troca da chave.
create or replace function public.set_account_secret(
  p_account_id uuid,
  p_provider text,
  p_key_name text,
  p_secret text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_key_name text := lower(btrim(coalesce(p_key_name, '')));
  v_usuario uuid := auth.uid();
  v_existente public.account_secrets%rowtype;
  v_secret_id uuid;
  v_id uuid;
begin
  if not public.has_role(p_account_id, 'owner') then
    raise exception 'o cofre da conta é administrado pelo dono'
      using errcode = '42501';
  end if;

  if v_provider = '' or v_key_name = '' then
    raise exception 'provedor e nome da chave são obrigatórios'
      using errcode = '22023';
  end if;

  -- Credencial em branco é pior do que credencial ausente: a cascata de
  -- resolveSecret pararia nela em vez de cair para o próximo degrau.
  if p_secret is null or btrim(p_secret) = '' then
    raise exception 'o valor da credencial não pode ser vazio'
      using errcode = '22023';
  end if;

  -- for update serializa duas gravações simultâneas da mesma chave: a segunda
  -- espera e enxerga o ponteiro que a primeira criou, em vez de criar outro.
  select * into v_existente
    from public.account_secrets as s
   where s.account_id = p_account_id
     and s.provider = v_provider
     and s.key_name = v_key_name
     for update;

  if found then
    perform vault.update_secret(v_existente.secret_id, p_secret);
    update public.account_secrets
       set metadata = coalesce(p_metadata, '{}'::jsonb),
           updated_by = v_usuario
     where id = v_existente.id;
    return v_existente.id;
  end if;

  -- Nome determinístico no Vault, para quem for olhar o cofre de fora saber de
  -- quem é cada segredo sem abrir nenhum.
  select vault.create_secret(
           p_secret,
           'account:' || p_account_id::text || ':' || v_provider || ':' || v_key_name,
           'Credencial de conta gravada por set_account_secret'
         )
    into v_secret_id;

  insert into public.account_secrets
    (account_id, provider, key_name, secret_id, metadata, created_by, updated_by)
  values
    (p_account_id, v_provider, v_key_name, v_secret_id,
     coalesce(p_metadata, '{}'::jsonb), v_usuario, v_usuario)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.set_account_secret(uuid, text, text, text, jsonb) is
  'Grava a credencial da conta no Vault e guarda só o ponteiro. Exige owner. Devolve o id do metadado, nunca o valor.';

revoke execute on function public.set_account_secret(uuid, text, text, text, jsonb) from public;
grant execute on function public.set_account_secret(uuid, text, text, text, jsonb) to authenticated;

-- Listagem --------------------------------------------------------------------
-- O que a tela de integrações precisa: quais chaves existem, de qual provedor,
-- quando mudaram e por quem. A assinatura de retorno não tem coluna de valor,
-- e é assim que "list devolve apenas metadados" deixa de depender de disciplina
-- de quem escreve a consulta.
create or replace function public.list_account_secrets(p_account_id uuid)
returns table (
  provider text,
  key_name text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by_nome text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_account_id, 'owner') then
    raise exception 'o cofre da conta é administrado pelo dono'
      using errcode = '42501';
  end if;

  return query
    select s.provider,
           s.key_name,
           s.metadata,
           s.created_at,
           s.updated_at,
           coalesce(nullif(btrim(p.display_name), ''), p.email)
      from public.account_secrets as s
      left join public.profiles as p on p.id = s.updated_by
     where s.account_id = p_account_id
     order by s.provider, s.key_name;
end;
$$;

comment on function public.list_account_secrets(uuid) is
  'Metadados das credenciais da conta, para a tela. Exige owner. Nenhuma coluna do retorno carrega o valor.';

revoke execute on function public.list_account_secrets(uuid) from public;
grant execute on function public.list_account_secrets(uuid) to authenticated;

-- Exclusão ---------------------------------------------------------------------
-- Apaga o metadado e o segredo na mesma transação. Apagar só a linha deixaria o
-- valor vivo no Vault sem ninguém para reclamá-lo.
create or replace function public.delete_account_secret(
  p_account_id uuid,
  p_provider text,
  p_key_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if not public.has_role(p_account_id, 'owner') then
    raise exception 'o cofre da conta é administrado pelo dono'
      using errcode = '42501';
  end if;

  delete from public.account_secrets as s
   where s.account_id = p_account_id
     and s.provider = lower(btrim(coalesce(p_provider, '')))
     and s.key_name = lower(btrim(coalesce(p_key_name, '')))
   returning s.secret_id into v_secret_id;

  if v_secret_id is null then
    return false;
  end if;

  delete from vault.secrets where id = v_secret_id;
  return true;
end;
$$;

comment on function public.delete_account_secret(uuid, text, text) is
  'Remove a credencial da conta e o segredo do Vault na mesma transação. Exige owner. Devolve falso quando não havia chave.';

revoke execute on function public.delete_account_secret(uuid, text, text) from public;
grant execute on function public.delete_account_secret(uuid, text, text) to authenticated;

-- Leitura do valor --------------------------------------------------------------
-- A única porta por onde a credencial em claro sai, e ela dá para o servidor.
-- Não confere papel porque não há usuário: quem chama é função de borda com a
-- chave de serviço, onde auth.uid() é nulo. O que a protege é o grant — só
-- service_role — e é isso que testes/banco/cofre-de-credenciais.test.ts prova
-- pelos dois lados: authenticated e anon recebem permission denied.
create or replace function public.get_account_secret(
  p_account_id uuid,
  p_provider text,
  p_key_name text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.decrypted_secret
    from public.account_secrets as s
    join vault.decrypted_secrets as v on v.id = s.secret_id
   where s.account_id = p_account_id
     and s.provider = lower(btrim(coalesce(p_provider, '')))
     and s.key_name = lower(btrim(coalesce(p_key_name, '')));
$$;

comment on function public.get_account_secret(uuid, text, text) is
  'Valor em claro da credencial da conta. Só service_role executa: é a porta das funções de servidor, nunca do navegador.';

revoke execute on function public.get_account_secret(uuid, text, text) from public;
grant execute on function public.get_account_secret(uuid, text, text) to service_role;
