// calendar-callback no banco: `conectar_calendario_do_especialista`. O que se
// prova aqui:
//
// 1. **A primeira conexão** cria o segredo no Vault e guarda só o ponteiro.
// 2. **Reconectar reaproveita o `secret_id`**: o Vault não ganha linha, o valor
//    muda no mesmo ponteiro, a falha antiga some e a marca da rotina se limpa.
//    Depois de uma desconexão também: o segredo que ficou no Vault volta a ter
//    dono em vez de colidir pelo nome.
// 3. **Especialista de outra conta** é recusado com 42501, sem segredo novo.
// 4. **Token em branco** é recusado.
// 5. **Só `service_role` executa.**
//
// Referência: migração 20260930140000_conexao_do_calendario.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let outraContaId: string
let especialistaId: string
let especialistaAlheioId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Agenda Conectada'), ('Outra Conta') returning id`,
  )
  contaId = rows[0]!.id
  outraContaId = rows[1]!.id

  const especialistas = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, 'Especialista da Conta', 'da.conta@agenda.test', array['video']::text[]),
            ($2, 'Especialista Alheio', 'alheio@agenda.test', array['video']::text[])
     returning id`,
    [contaId, outraContaId],
  )
  especialistaId = especialistas.rows[0]!.id
  especialistaAlheioId = especialistas.rows[1]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.specialist_calendars')
  await banco.sql.query(`delete from vault.secrets where name like 'calendar:%'`)
})

async function conectar(token: string, opcoes: { conta?: string; especialista?: string } = {}) {
  const { rows } = await banco.sql.query<{ calendar_id: string; reaproveitado: boolean }>(
    'select * from public.conectar_calendario_do_especialista($1, $2, $3, $4, $5)',
    [opcoes.conta ?? contaId, opcoes.especialista ?? especialistaId, 'Google', 'primary', token],
  )
  return rows[0]!
}

async function segredosNoVault(): Promise<number> {
  const { rows } = await banco.sql.query<{ n: number }>(
    `select count(*)::int as n from vault.secrets where name like 'calendar:%'`,
  )
  return rows[0]!.n
}

async function tokenLido(calendarioId: string): Promise<string | null> {
  const { rows } = await banco.sql.query<{ token: string | null }>(
    'select public.token_do_calendario($1, $2) as token',
    [contaId, calendarioId],
  )
  return rows[0]!.token
}

describe('conectar_calendario_do_especialista', () => {
  test('a primeira conexão guarda o token no Vault e só o ponteiro na tabela', async () => {
    const antes = await segredosNoVault()

    const { calendar_id, reaproveitado } = await conectar('token-de-renovacao-primeiro')

    expect(reaproveitado).toBe(false)
    expect(await segredosNoVault()).toBe(antes + 1)
    expect(await tokenLido(calendar_id)).toBe('token-de-renovacao-primeiro')

    const { rows } = await banco.sql.query<Record<string, unknown>>(
      'select * from public.specialist_calendars where id = $1',
      [calendar_id],
    )
    expect(rows[0]).toMatchObject({ account_id: contaId, specialist_id: especialistaId, provider: 'google', external_id: 'primary' })
    expect(JSON.stringify(rows)).not.toContain('token-de-renovacao-primeiro')
  })

  test('reconectar reaproveita o secret_id em vez de deixar ponteiro órfão', async () => {
    const primeira = await conectar('token-de-renovacao-velho')
    const { rows: antes } = await banco.sql.query<{ refresh_secret_id: string }>(
      'select refresh_secret_id from public.specialist_calendars where id = $1',
      [primeira.calendar_id],
    )
    await banco.sql.query(
      `update public.specialist_calendars
          set sync_error = 'A conexão com o calendário expirou.', sync_claimed_at = now()
        where id = $1`,
      [primeira.calendar_id],
    )
    const segredos = await segredosNoVault()

    const segunda = await conectar('token-de-renovacao-novo')

    expect(segunda).toEqual({ calendar_id: primeira.calendar_id, reaproveitado: true })
    expect(await segredosNoVault()).toBe(segredos)
    expect(await tokenLido(segunda.calendar_id)).toBe('token-de-renovacao-novo')

    const { rows: depois } = await banco.sql.query<{
      refresh_secret_id: string
      sync_error: string | null
      sync_claimed_at: string | null
    }>('select refresh_secret_id, sync_error, sync_claimed_at from public.specialist_calendars where id = $1', [
      segunda.calendar_id,
    ])
    expect(depois[0]).toEqual({ refresh_secret_id: antes[0]!.refresh_secret_id, sync_error: null, sync_claimed_at: null })
  })

  test('reconectar depois de desconectar reaproveita o segredo que ficou no Vault', async () => {
    const primeira = await conectar('token-de-antes-da-desconexao')
    await banco.sql.query('delete from public.specialist_calendars where id = $1', [primeira.calendar_id])
    const segredos = await segredosNoVault()

    const segunda = await conectar('token-de-depois-da-desconexao')

    expect(segunda.reaproveitado).toBe(false)
    expect(await segredosNoVault()).toBe(segredos)
    expect(await tokenLido(segunda.calendar_id)).toBe('token-de-depois-da-desconexao')
  })

  test('especialista de outra conta é recusado sem criar segredo', async () => {
    const antes = await segredosNoVault()

    await expect(conectar('token-de-outra-conta', { especialista: especialistaAlheioId })).rejects.toMatchObject({
      code: '42501',
    })

    expect(await segredosNoVault()).toBe(antes)
    const { rows } = await banco.sql.query<{ n: number }>('select count(*)::int as n from public.specialist_calendars')
    expect(rows[0]!.n).toBe(0)
  })

  test('token em branco é recusado', async () => {
    await expect(conectar('   ')).rejects.toMatchObject({ code: '22023' })
  })

  test('só service_role executa', async () => {
    const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
      `select papel, has_function_privilege(papel, $1, 'execute') as pode
         from unnest(array['anon', 'authenticated', 'service_role']) as papel
        order by papel`,
      ['public.conectar_calendario_do_especialista(uuid, uuid, text, text, text)'],
    )
    expect(rows).toEqual([
      { papel: 'anon', pode: false },
      { papel: 'authenticated', pode: false },
      { papel: 'service_role', pode: true },
    ])
  })
})
