// As regras de check:sql detectam o que devem e não acusam o que está correto.
// Inclui o conjunto real de supabase/migrations: se ele passar a violar uma
// regra, este teste cai antes do CI.

import { expect, test } from 'vitest'

import {
  analisarLexico,
  verificarMigracoes,
  type Achado,
} from '../../scripts/analise-de-migracoes.ts'
import { lerMigracoes } from '../../scripts/migracoes.ts'

function regras(achados: Achado[]): string[] {
  return achados.map((achado) => achado.regra)
}

function analisar(sql: string): Achado[] {
  return verificarMigracoes([{ nome: 'teste.sql', sql }])
}

const TABELA_CORRETA = `
  create table public.leads (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references public.accounts (id)
  );
  alter table public.leads enable row level security;
  create policy leads_leitura on public.leads
    for select using ((select is_member(account_id)));
`

test('o conjunto real de migrações passa em todas as regras', async () => {
  const migracoes = await lerMigracoes()
  expect(migracoes.length).toBeGreaterThan(0)
  expect(verificarMigracoes(migracoes)).toEqual([])
})

test('tabela correta não gera achado', () => {
  expect(analisar(TABELA_CORRETA)).toEqual([])
})

test('acusa tabela criada sem row level security', () => {
  const sql = TABELA_CORRETA.replace(
    'alter table public.leads enable row level security;',
    '',
  )
  expect(regras(analisar(sql))).toContain('rls')
})

test('acusa tabela de negócio sem account_id', () => {
  const sql = TABELA_CORRETA.replace(
    'account_id uuid not null references public.accounts (id)',
    'nome text not null',
  )
  expect(regras(analisar(sql))).toContain('account_id')
})

test('accounts e profiles são isentas de account_id', () => {
  const sql = `
    create table public.accounts (id uuid primary key, name text not null);
    alter table public.accounts enable row level security;
    create table public.profiles (id uuid primary key, email text);
    alter table public.profiles enable row level security;
  `
  expect(analisar(sql)).toEqual([])
})

test('acusa is_member chamada fora de (select ...)', () => {
  const sql = TABELA_CORRETA.replace(
    '(select is_member(account_id))',
    'is_member(account_id)',
  )
  expect(regras(analisar(sql))).toContain('is_member')
})

test('a definição da própria função is_member não conta como chamada', () => {
  const sql = `
    create or replace function public.is_member(account_id uuid)
    returns boolean language sql stable as $$
      select true;
    $$;
    revoke execute on function public.is_member(uuid) from public;
    grant execute on function public.is_member(uuid) to authenticated;
  `
  expect(analisar(sql)).toEqual([])
})

test('acusa segredo literal', () => {
  const comChave = `
    create table public.integracoes (
      id uuid primary key,
      account_id uuid not null,
      chave text not null default 'sk_live_0123456789abcdefghij'
    );
    alter table public.integracoes enable row level security;
  `
  expect(regras(analisar(comChave))).toContain('segredo')

  const comUrl = `
    create table public.integracoes (
      id uuid primary key,
      account_id uuid not null,
      endereco text not null default 'https://exemplo.supabase.co'
    );
    alter table public.integracoes enable row level security;
  `
  expect(regras(analisar(comUrl))).toContain('segredo')
})

test('URL em comentário não é segredo, porque comentário não vai para o banco', () => {
  const sql = `
    -- Referência: https://supabase.com/docs/guides/database/postgres/row-level-security
    ${TABELA_CORRETA}
  `
  expect(analisar(sql)).toEqual([])
})

test('acusa parêntese sem fechamento e corpo de função aberto', () => {
  expect(regras(analisar('create table public.x (id uuid;'))).toEqual(['sintaxe'])
  expect(
    regras(analisar('create function f() returns void language sql as $$ select 1;')),
  ).toEqual(['sintaxe'])
})

test('o léxico separa estrutura de conteúdo', () => {
  const lexico = analisarLexico(
    `select 'texto'; -- comentário\ncreate function f() as $$ corpo $$;`,
  )
  expect(lexico.erro).toBeUndefined()
  expect(lexico.conteudos).toEqual(['texto', ' corpo '])
  expect(lexico.estrutura).not.toContain('comentário')
  expect(lexico.estrutura).not.toContain('corpo')
})
