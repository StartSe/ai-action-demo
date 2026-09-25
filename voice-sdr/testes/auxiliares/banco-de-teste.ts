// Postgres em processo para os testes de banco.
//
// PGlite é o Postgres compilado para WebAssembly: sobe em memória dentro do
// próprio processo do Vitest, sem container, sem daemon e sem porta de rede.
// É o que permite exercitar migração e RLS no laço local, onde `supabase start`
// é proibido (docs/PRD-implementacao.md seção 9.1).
//
// O que o Supabase gerenciado entrega pronto e aqui precisa ser construído:
// os papéis do PostgREST, o schema `extensions` e um `auth` mínimo com
// `auth.uid()` lendo um parâmetro de sessão no lugar do JWT.

import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

import { lerMigracoes } from '../../scripts/migracoes.ts'

/**
 * Parâmetro de sessão que faz o papel do `sub` do JWT no Supabase. O
 * `auth.uid()` do Supabase gerenciado lê este mesmo parâmetro antes de cair no
 * `request.jwt.claims`, então definir só ele basta para os dois bancos.
 */
export const PARAMETRO_DE_USUARIO = 'request.jwt.claim.sub'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Preâmbulo: tudo que a migração pressupõe existir porque o Supabase já
 * providenciou. Sem isto, a primeira migração quebra em `auth.users`.
 */
const PREAMBULO = `
  -- Papéis do PostgREST. As políticas de RLS concedem a estes, não a postgres,
  -- que é superusuário e passa por cima de toda política.
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema if not exists extensions;
  create schema if not exists auth;

  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema extensions to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;

  -- Recorte de auth.users: só as colunas que as migrações leem.
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    -- O GoTrue lê esta coluna para decidir se o e-mail foi confirmado; o
    -- gatilho da fundação (20261005110000) a preenche.
    email_confirmed_at timestamptz,
    created_at timestamptz not null default now()
  );

  -- No Supabase, auth.uid() lê o JWT da requisição. Aqui lê um parâmetro de
  -- sessão, definido por comoUsuario(). Fora de sessão autenticada devolve null,
  -- e é isso que faz a política negar.
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $preambulo$
    select nullif(current_setting('${PARAMETRO_DE_USUARIO}', true), '')::uuid;
  $preambulo$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  as $preambulo$
    select current_user::text;
  $preambulo$;

  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function auth.role() to anon, authenticated, service_role;

  -- Vault. No Supabase vem da extensão supabase_vault e guarda o valor cifrado
  -- com uma chave que o banco não tem; aqui guarda em claro, porque o que estes
  -- testes provam é quem alcança o segredo, não como ele é cifrado. A forma é a
  -- mesma: tabela vault.secrets, view vault.decrypted_secrets e as funções
  -- create_secret/update_secret com as assinaturas do Supabase.
  --
  -- Sem grant de usage para anon, authenticated nem service_role, e de
  -- propósito: no Supabase o schema vault não é exposto pelo PostgREST e
  -- nenhum papel do cliente o enxerga. Quem alcança é função security definer,
  -- que roda como o dono.
  create schema if not exists vault;

  create table vault.secrets (
    id uuid primary key default gen_random_uuid(),
    name text unique,
    description text not null default '',
    secret text not null,
    key_id uuid,
    nonce bytea,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create view vault.decrypted_secrets as
    select s.id,
           s.name,
           s.description,
           s.secret,
           s.key_id,
           s.nonce,
           s.created_at,
           s.updated_at,
           s.secret as decrypted_secret
      from vault.secrets as s;

  create function vault.create_secret(
    new_secret text,
    new_name text default null,
    new_description text default '',
    new_key_id uuid default null
  )
  returns uuid
  language sql
  as $preambulo$
    insert into vault.secrets (secret, name, description, key_id)
    values (new_secret, new_name, coalesce(new_description, ''), new_key_id)
    returning id;
  $preambulo$;

  create function vault.update_secret(
    secret_id uuid,
    new_secret text default null,
    new_name text default null,
    new_description text default null
  )
  returns void
  language sql
  as $preambulo$
    update vault.secrets
       set secret = coalesce(new_secret, vault.secrets.secret),
           name = coalesce(new_name, vault.secrets.name),
           description = coalesce(new_description, vault.secrets.description),
           updated_at = now()
     where vault.secrets.id = secret_id;
  $preambulo$;

  -- Storage. No Supabase o schema storage vem pronto, com storage.buckets e
  -- storage.objects. Aqui só o recorte de buckets com as colunas que as
  -- migrações escrevem: o balde nasce por insert, e é isso que se confere. Os
  -- objetos (o arquivo de áudio) não entram: quem os grava é a borda, pela
  -- API do Storage, e isso só se exercita no degrau 3.
  create schema if not exists storage;

  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- pg_cron e pg_net. No Supabase são extensões habilitadas no painel, e o
  -- PGlite não tem nenhuma das duas. O recorte aqui é de mentira de propósito:
  -- cron.schedule, cron.unschedule e net.http_post com as assinaturas de lá,
  -- registrando cada chamada em espionagem.chamadas em vez de agendar ou de
  -- abrir conexão. Assim o teste afirma o que foi agendado e o que seria
  -- mandado, sem agendador e sem rede. cron.job imita a tabela do pg_cron, com
  -- o mesmo comportamento de nome repetido: agendar de novo atualiza o job.
  create schema if not exists cron;
  create schema if not exists net;
  create schema if not exists espionagem;

  create table espionagem.chamadas (
    ordem bigserial primary key,
    funcao text not null,
    argumentos jsonb not null
  );

  create table cron.job (
    jobid bigserial primary key,
    jobname text unique,
    schedule text not null,
    command text not null
  );

  create function cron.schedule(job_name text, schedule text, command text)
  returns bigint
  language sql
  as $preambulo$
    insert into espionagem.chamadas (funcao, argumentos)
    values ('cron.schedule', jsonb_build_object(
      'job_name', job_name, 'schedule', schedule, 'command', command));
    insert into cron.job (jobname, schedule, command)
    values (job_name, schedule, command)
    on conflict (jobname) do update
      set schedule = excluded.schedule, command = excluded.command
    returning jobid;
  $preambulo$;

  create function cron.unschedule(job_name text)
  returns boolean
  language sql
  as $preambulo$
    insert into espionagem.chamadas (funcao, argumentos)
    values ('cron.unschedule', jsonb_build_object('job_name', job_name));
    with apagado as (delete from cron.job where jobname = job_name returning 1)
    select exists (select 1 from apagado);
  $preambulo$;

  create function net.http_post(
    url text,
    body jsonb default '{}'::jsonb,
    params jsonb default '{}'::jsonb,
    headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds integer default 5000
  )
  returns bigint
  language sql
  as $preambulo$
    insert into espionagem.chamadas (funcao, argumentos)
    values ('net.http_post', jsonb_build_object(
      'url', url, 'body', body, 'params', params, 'headers', headers,
      'timeout_milliseconds', timeout_milliseconds))
    returning ordem;
  $preambulo$;
`

/**
 * Concedido depois das migrações: o Supabase dá estes privilégios por
 * `alter default privileges`, e sem eles o papel authenticated esbarra em
 * "permission denied" antes mesmo de a política de RLS ser avaliada — o que
 * confundiria a leitura do teste de isolamento.
 */
const PRIVILEGIOS = `
  grant select, insert, update, delete on all tables in schema public
    to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public
    to anon, authenticated, service_role;
`

export interface ResultadoSql<T> {
  readonly rows: T[]
}

/**
 * O mínimo que um cliente precisa expor para os testes de banco. PGlite atende
 * de graça; `testes/auxiliares/postgres-real.ts` atende sobre `pg`, que é como
 * o CI reexecuta os mesmos testes contra um Postgres de verdade.
 */
export interface ClienteSql {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<ResultadoSql<T>>
  exec(sql: string): Promise<unknown>
}

export interface BancoDeTeste {
  /** Cliente SQL, para consultas diretas. */
  readonly sql: ClienteSql
  /**
   * Verdadeiro quando o banco é descartável (PGlite em memória). Prova que
   * mexe no esquema — derrubar política para ver o teste cair — só roda aqui:
   * num Postgres compartilhado, um rollback que falhasse deixaria a tabela
   * aberta.
   */
  readonly efemero: boolean
  /** Nomes das migrações aplicadas, em ordem. */
  readonly migracoesAplicadas: readonly string[]
  /**
   * Aplica as migrações que ficaram de fora por `pararAntesDe` e, no fim, os
   * privilégios. Sem nada pendente, não faz nada. Devolve os nomes aplicados.
   */
  retomarMigracoes(): Promise<readonly string[]>
  /** Passa a sessão para o papel authenticated agindo como este usuário. */
  comoUsuario(usuarioId: string): Promise<void>
  /** Passa a sessão para o papel anon, sem usuário. */
  comoAnonimo(): Promise<void>
  /** Volta a sessão para o superusuário, que passa por cima da RLS. */
  comoServico(): Promise<void>
  /** Cria o usuário em auth.users e devolve o id. O gatilho cria o profile. */
  criarUsuario(email: string, nomeExibido?: string): Promise<string>
  encerrar(): Promise<void>
}

export interface OpcoesDoBanco {
  /**
   * Para de aplicar imediatamente ANTES da migração cujo nome comece assim, e
   * deixa o resto para `retomarMigracoes()`. É o que permite provar a parte
   * retroativa de uma migração de expansão — a linha que já existia quando ela
   * chegou — sem a qual o `update ... where` de retroação passa sabotado: as
   * contas do cenário nascem depois dele e recebem o padrão da coluna.
   */
  readonly pararAntesDe?: string
}

/**
 * Sobe um Postgres vazio em memória e aplica todas as migrações em ordem.
 * Cada chamada devolve um banco isolado: os testes não compartilham estado.
 */
export async function criarBancoDeTeste(
  opcoes: OpcoesDoBanco = {},
): Promise<BancoDeTeste> {
  const sql = await PGlite.create({
    extensions: { btree_gist, pg_trgm, pgcrypto },
  })

  await sql.exec(PREAMBULO)

  const todas = await lerMigracoes()
  const corte = opcoes.pararAntesDe
    ? todas.findIndex((m) => m.nome.startsWith(opcoes.pararAntesDe!))
    : -1
  if (opcoes.pararAntesDe && corte < 0) {
    await sql.close()
    throw new Error(`Nenhuma migração começa por ${opcoes.pararAntesDe}`)
  }

  const aplicadas: string[] = []
  const pendentes = corte < 0 ? [] : todas.slice(corte)

  const aplicar = async (lote: typeof todas) => {
    for (const migracao of lote) {
      try {
        await sql.exec(migracao.sql)
      } catch (erro) {
        await sql.close()
        throw new Error(`Migração ${migracao.nome} falhou: ${mensagem(erro)}`, {
          cause: erro,
        })
      }
      aplicadas.push(migracao.nome)
    }
  }

  await aplicar(corte < 0 ? todas : todas.slice(0, corte))
  if (pendentes.length === 0) await sql.exec(PRIVILEGIOS)

  const definirUsuario = async (usuarioId: string | null) => {
    await sql.query('select set_config($1, $2, false)', [
      PARAMETRO_DE_USUARIO,
      usuarioId ?? '',
    ])
  }

  return {
    sql,
    efemero: true,
    get migracoesAplicadas() {
      return aplicadas
    },

    async retomarMigracoes() {
      if (pendentes.length === 0) return []
      const lote = pendentes.splice(0)
      await aplicar(lote)
      await sql.exec(PRIVILEGIOS)
      return lote.map((migracao) => migracao.nome)
    },

    async comoUsuario(usuarioId) {
      if (!UUID.test(usuarioId)) {
        throw new Error(`comoUsuario espera um uuid, recebeu ${usuarioId}`)
      }
      await sql.exec('reset role')
      await definirUsuario(usuarioId)
      await sql.exec('set role authenticated')
    },

    async comoAnonimo() {
      await sql.exec('reset role')
      await definirUsuario(null)
      await sql.exec('set role anon')
    },

    async comoServico() {
      await sql.exec('reset role')
      await definirUsuario(null)
    },

    async criarUsuario(email, nomeExibido) {
      await sql.exec('reset role')
      const resultado = await sql.query<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data)
         values ($1, jsonb_build_object('display_name', $2::text))
         returning id`,
        [email, nomeExibido ?? email],
      )
      const linha = resultado.rows[0]
      if (!linha) throw new Error(`Não foi possível criar o usuário ${email}`)
      return linha.id
    },

    async encerrar() {
      await sql.close()
    },
  }
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}
