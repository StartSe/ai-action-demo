// A instalação pelo painel não deixa passo manual no projeto de quem instala.
//
// O que este arquivo prova:
//
// 1. **O segredo das rotinas nasce no Vault**, com o nome que `app_config`
//    aponta, e reaplicar a migração não troca o valor.
// 2. `segredo_interno_da_instalacao()` devolve esse valor a `service_role`, e a
//    nenhum papel de cliente.
// 3. `registrar_url_base_das_rotinas` grava o endereço quando falta, nunca
//    sobrescreve e recusa endereço fora da forma; com ele gravado,
//    `disparar_rotina` sai com o segredo sorteado no cabeçalho.
// 4. `versao_da_instalacao()` lê o registro que o último passo do roteiro grava.
// 5. **O fundador entra sem confirmar e-mail**, e só ele: depois da fundação o
//    gatilho não mexe em ninguém.
//
// Referência: migrações 20261005100000_instalacao_sem_passo_manual.sql e
// 20261005110000_dono_sem_confirmacao_de_email.sql, docs/instalacao.md.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const MIGRACAO = fileURLToPath(
  new URL(
    '../../supabase/migrations/20261005100000_instalacao_sem_passo_manual.sql',
    import.meta.url,
  ),
)

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
})

async function segredoNoVault(): Promise<string | null> {
  const { rows } = await banco.sql.query<{ segredo: string | null }>(
    `select s.decrypted_secret as segredo
       from vault.decrypted_secrets as s
       join public.app_config as c
         on c.key = 'rotinas.nome_do_segredo' and c.value = s.name`,
  )
  return rows[0]?.segredo ?? null
}

async function comoPapel(papel: 'anon' | 'authenticated' | 'service_role') {
  await banco.comoServico()
  await banco.sql.exec(`set role ${papel}`)
}

test('a migração sorteia o segredo das rotinas no Vault, com o nome de app_config', async () => {
  const segredo = await segredoNoVault()
  expect(segredo).toMatch(/^[0-9a-f]{64}$/)
})

test('reaplicar a migração não troca o segredo que já existe', async () => {
  const antes = await segredoNoVault()
  await banco.sql.exec(await readFile(MIGRACAO, 'utf8'))
  expect(await segredoNoVault()).toBe(antes)

  const { rows } = await banco.sql.query<{ quantos: number }>(
    `select count(*)::int as quantos from vault.secrets where name = 'sarah_internal_secret'`,
  )
  expect(rows[0]?.quantos).toBe(1)
})

test('o segredo sai para service_role e para nenhum papel de cliente', async () => {
  const esperado = await segredoNoVault()

  await comoPapel('service_role')
  const { rows } = await banco.sql.query<{ segredo: string | null }>(
    'select public.segredo_interno_da_instalacao() as segredo',
  )
  expect(rows[0]?.segredo).toBe(esperado)

  for (const papel of ['anon', 'authenticated'] as const) {
    await comoPapel(papel)
    await expect(
      banco.sql.query('select public.segredo_interno_da_instalacao()'),
    ).rejects.toThrow(/permission denied/)
  }
})

test('o endereço das funções é gravado quando falta e nunca sobrescrito', async () => {
  await banco.sql.query(`delete from public.app_config where key = 'rotinas.url_base'`)
  await comoPapel('service_role')

  const primeira = await banco.sql.query<{ gravou: boolean }>(
    'select public.registrar_url_base_das_rotinas($1) as gravou',
    ['https://abcdefghijklmnopqrst.supabase.co/functions/v1/'],
  )
  expect(primeira.rows[0]?.gravou).toBe(true)

  const segunda = await banco.sql.query<{ gravou: boolean }>(
    'select public.registrar_url_base_das_rotinas($1) as gravou',
    ['https://outro-projeto.supabase.co/functions/v1'],
  )
  expect(segunda.rows[0]?.gravou).toBe(false)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ value: string }>(
    `select value from public.app_config where key = 'rotinas.url_base'`,
  )
  expect(rows[0]?.value).toBe('https://abcdefghijklmnopqrst.supabase.co/functions/v1')
})

test('endereço fora da forma é recusado, e cliente nenhum grava endereço', async () => {
  await comoPapel('service_role')
  for (const invalido of ['', 'abcdefghijklmnopqrst.supabase.co', 'https://x.supabase.co/rest/v1']) {
    await expect(
      banco.sql.query('select public.registrar_url_base_das_rotinas($1)', [invalido]),
    ).rejects.toThrow(/endereço das funções inválido/)
  }

  for (const papel of ['anon', 'authenticated'] as const) {
    await comoPapel(papel)
    await expect(
      banco.sql.query('select public.registrar_url_base_das_rotinas($1)', [
        'https://atacante.example/functions/v1',
      ]),
    ).rejects.toThrow(/permission denied/)
  }
})

test('com o endereço registrado, a rotina sai com o segredo sorteado no cabeçalho', async () => {
  await banco.sql.query(`delete from public.app_config where key = 'rotinas.url_base'`)
  await banco.sql.query(`delete from espionagem.chamadas where funcao = 'net.http_post'`)
  await banco.sql.query('select public.registrar_url_base_das_rotinas($1)', [
    'https://abcdefghijklmnopqrst.supabase.co/functions/v1',
  ])

  await banco.sql.query(`select public.disparar_rotina('cron-dial')`)

  const { rows } = await banco.sql.query<{ argumentos: { url: string; headers: Record<string, string> } }>(
    `select argumentos from espionagem.chamadas where funcao = 'net.http_post'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.argumentos.url).toBe(
    'https://abcdefghijklmnopqrst.supabase.co/functions/v1/cron-dial',
  )
  expect(rows[0]?.argumentos.headers['x-internal-secret']).toBe(await segredoNoVault())
})

test('a versão da instalação vem do registro em app_config', async () => {
  await banco.sql.query(`delete from public.app_config where key like 'instalacao.%'`)
  await comoPapel('service_role')
  const vazio = await banco.sql.query<{ versao: Record<string, string | null> }>(
    'select public.versao_da_instalacao() as versao',
  )
  expect(vazio.rows[0]?.versao).toEqual({ migracao: null, funcoes: null })

  await banco.comoServico()
  await banco.sql.query(
    `insert into public.app_config (key, value) values
       ('instalacao.migracao', '20261005110000'),
       ('instalacao.funcoes', 'abc123')`,
  )
  await comoPapel('service_role')
  const cheio = await banco.sql.query<{ versao: Record<string, string | null> }>(
    'select public.versao_da_instalacao() as versao',
  )
  expect(cheio.rows[0]?.versao).toEqual({ migracao: '20261005110000', funcoes: 'abc123' })

  await comoPapel('anon')
  await expect(banco.sql.query('select public.versao_da_instalacao()')).rejects.toThrow(
    /permission denied/,
  )
})

test('o fundador nasce com o e-mail confirmado, e depois da fundação ninguém mais', async () => {
  await banco.sql.exec('truncate public.accounts cascade')

  const fundador = await banco.criarUsuario('fundadora@instalacao.test', 'Fundadora')
  const confirmado = async (id: string) => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ confirmado: boolean }>(
      'select email_confirmed_at is not null as confirmado from auth.users where id = $1',
      [id],
    )
    return rows[0]?.confirmado
  }
  expect(await confirmado(fundador)).toBe(true)

  await banco.comoUsuario(fundador)
  await banco.sql.query(`select public.fundar_instalacao('Conta da fundadora')`)

  const depois = await banco.criarUsuario('depois@instalacao.test', 'Depois')
  expect(await confirmado(depois)).toBe(false)

  await banco.comoServico()
  await banco.sql.exec('truncate public.accounts cascade')
})
