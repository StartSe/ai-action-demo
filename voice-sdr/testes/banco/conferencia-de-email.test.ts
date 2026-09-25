// A conferência de e-mail é o que separa "não existe conta com esse e-mail" de
// "senha incorreta" na tela de entrada. Ela responde a quem ainda não entrou,
// então o que se prova aqui é: a sessão anônima consegue chamar, a resposta é
// exata, e nada além do sim ou não atravessa.
// Referência: docs/PRD.md RF-001.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.criarUsuario('ana@transportes.com.br', 'Ana')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoAnonimo()
})

async function registrado(email: string | null): Promise<boolean | null> {
  const { rows } = await banco.sql.query<{ registrado: boolean | null }>(
    'select public.email_registrado($1) as registrado',
    [email],
  )
  return rows[0]?.registrado ?? null
}

test('a sessão anônima chama a função e recebe verdadeiro para e-mail cadastrado', async () => {
  await expect(registrado('ana@transportes.com.br')).resolves.toBe(true)
})

test('e-mail sem conta devolve falso', async () => {
  await expect(registrado('ninguem@transportes.com.br')).resolves.toBe(false)
})

test('caixa e espaços em volta não mudam a resposta', async () => {
  await expect(registrado('  Ana@Transportes.COM.BR ')).resolves.toBe(true)
})

test('e-mail nulo devolve falso, e não erro', async () => {
  await expect(registrado(null)).resolves.toBe(false)
})

test('a sessão autenticada também chama, para a tela de entrada seguir viva depois da recuperação', async () => {
  await banco.comoServico()
  const usuarioId = await banco.criarUsuario('bruno@transportes.com.br', 'Bruno')
  await banco.comoUsuario(usuarioId)

  await expect(registrado('bruno@transportes.com.br')).resolves.toBe(true)
})

test('a função é stable e security definer', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    provolatile: string
    prosecdef: boolean
  }>(
    `select p.provolatile, p.prosecdef
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'email_registrado'`,
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]?.provolatile).toBe('s')
  expect(rows[0]?.prosecdef).toBe(true)
})

test('o papel public não executa a função: só anon, authenticated e service_role', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ papel: string }>(
    `select grantee as papel
       from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'email_registrado'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.papel)

  expect(papeis).not.toContain('PUBLIC')
  expect(papeis).toContain('anon')
  expect(papeis).toContain('authenticated')
})
