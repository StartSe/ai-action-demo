// cron-calendar-sync no banco: a reivindicação, a gravação reconciliada e o
// token de renovação. O que se prova aqui:
//
// 1. **A reivindicação gira a fila e respeita o teto.** Toma no máximo 25,
//    marca `sync_claimed_at`, não devolve o tomado há menos de 4 minutos e
//    devolve o de novo depois disso. Especialista desativado fica de fora, e o
//    fuso que volta é o do especialista.
// 2. **A gravação é idempotente e reconcilia.** Gravar duas vezes a mesma
//    ocupação não muda a contagem; evento que some é removido; e a passagem de
//    um calendário não apaga os blocos de outro calendário do mesmo
//    especialista. `synced_at` avança e `sync_error` se limpa na mesma
//    transação; bloco sem duração e repetido não derrubam a gravação.
// 3. **A falha não toca `synced_at` nem a ocupação**, e as passagens da rotina
//    não viram linha de trilha.
// 4. **O token só sai para `service_role`**, e só com a conta certa.
// 5. Desconectar o calendário leva os blocos dele em cascata.
//
// O `for update skip locked` com duas passagens sobrepostas precisa de duas
// conexões, e o PGlite tem uma: fica para o degrau 3, como no preço tardio.
//
// Referência: migração 20260930130000_sincronizacao_do_calendario.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const AGORA = '2026-10-05T12:00:00Z'
const QUATRO_MIN_DEPOIS = '2026-10-05T12:04:00Z'
const TRES_MIN_DEPOIS = '2026-10-05T12:03:00Z'

let banco: BancoDeTeste
let contaId: string
let outraContaId: string
let sequencia = 0

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Agenda Sincronizada'), ('Outra Conta') returning id`,
  )
  contaId = rows[0]!.id
  outraContaId = rows[1]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.specialist_busy_blocks')
  await banco.sql.query('delete from public.specialist_calendars')
  await banco.sql.query('delete from public.specialists')
})

async function especialista(
  opcoes: { conta?: string; ativo?: boolean; fuso?: string } = {},
): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (account_id, name, email, modalities, timezone, active)
     values ($1, $2, $3, array['video']::text[], $4, $5)
     returning id`,
    [
      opcoes.conta ?? contaId,
      `Especialista ${sequencia}`,
      `especialista.${sequencia}@agenda.test`,
      opcoes.fuso ?? 'America/Sao_Paulo',
      opcoes.ativo ?? true,
    ],
  )
  return rows[0]!.id
}

async function conectar(
  especialistaId: string,
  opcoes: { conta?: string; provedor?: string; token?: string } = {},
): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.specialist_calendars
       (account_id, specialist_id, provider, external_id, refresh_secret_id)
     values ($1, $2, $3, $4, vault.create_secret($5, $6, 'calendário de prova'))
     returning id`,
    [
      opcoes.conta ?? contaId,
      especialistaId,
      opcoes.provedor ?? 'google',
      `agenda-${sequencia}`,
      opcoes.token ?? `token-${sequencia}`,
      `sincronizacao:${sequencia}`,
    ],
  )
  return rows[0]!.id
}

async function reivindicar(limite: number, instante = AGORA) {
  const { rows } = await banco.sql.query<{ id: string; timezone: string }>(
    'select * from public.reivindicar_calendarios_para_sincronizar($1, $2)',
    [limite, instante],
  )
  return rows
}

interface Bloco {
  external_id: string
  starts_at: string
  ends_at: string
}

function bloco(id: string, dia: number, horas = 1): Bloco {
  const inicio = new Date(Date.parse(AGORA) + dia * 86_400_000)
  const fim = new Date(inicio.getTime() + horas * 3_600_000)
  return { external_id: id, starts_at: inicio.toISOString(), ends_at: fim.toISOString() }
}

async function gravar(calendarioId: string, blocos: readonly Bloco[], instante = AGORA) {
  const { rows } = await banco.sql.query<{ quantos: number }>(
    'select public.gravar_ocupacao_do_calendario($1, $2::jsonb, $3) as quantos',
    [calendarioId, JSON.stringify(blocos), instante],
  )
  return rows[0]!.quantos
}

async function blocosDo(especialistaId: string) {
  const { rows } = await banco.sql.query<{ external_id: string; calendar_id: string | null; starts_at: Date }>(
    `select external_id, calendar_id, starts_at
       from public.specialist_busy_blocks
      where specialist_id = $1
      order by external_id`,
    [especialistaId],
  )
  return rows
}

async function linhaDo(calendarioId: string) {
  const { rows } = await banco.sql.query<{ synced_at: Date | null; sync_error: string | null }>(
    'select synced_at, sync_error from public.specialist_calendars where id = $1',
    [calendarioId],
  )
  return rows[0]!
}

describe('a reivindicação', () => {
  test('toma no máximo 25, mesmo pedindo mais, e marca sync_claimed_at', async () => {
    for (let i = 0; i < 27; i += 1) await conectar(await especialista())

    const tomados = await reivindicar(100)

    expect(tomados).toHaveLength(25)
    const { rows } = await banco.sql.query<{ n: number }>(
      'select count(*)::int as n from public.specialist_calendars where sync_claimed_at = $1',
      [AGORA],
    )
    expect(rows[0]!.n).toBe(25)
  })

  test('com mais de 25 a fila gira: a passagem seguinte toma os que ficaram', async () => {
    for (let i = 0; i < 27; i += 1) await conectar(await especialista())

    const primeira = await reivindicar(25)
    const segunda = await reivindicar(25, QUATRO_MIN_DEPOIS)

    const ids = new Set(primeira.map((c) => c.id))
    const novos = segunda.filter((c) => !ids.has(c.id))
    expect(novos).toHaveLength(2)
  })

  test('não devolve o tomado há menos de 4 minutos, e devolve depois', async () => {
    await conectar(await especialista())
    expect(await reivindicar(25)).toHaveLength(1)
    expect(await reivindicar(25, TRES_MIN_DEPOIS)).toHaveLength(0)
    expect(await reivindicar(25, QUATRO_MIN_DEPOIS)).toHaveLength(1)
  })

  test('especialista desativado fica de fora, e o fuso que volta é o do especialista', async () => {
    await conectar(await especialista({ ativo: false }))
    const ativo = await conectar(await especialista({ fuso: 'America/Manaus' }))

    const tomados = await reivindicar(25)

    expect(tomados.map((c) => [c.id, c.timezone])).toEqual([[ativo, 'America/Manaus']])
  })
})

describe('a gravação reconciliada', () => {
  test('gravar duas vezes a mesma ocupação não duplica nem muda a contagem', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    const ocupacao = [bloco('ev-a', 1), bloco('ev-b', 2), bloco('ev-c', 29)]

    expect(await gravar(cal, ocupacao)).toBe(3)
    const primeira = await blocosDo(pessoa)
    expect(await gravar(cal, ocupacao, QUATRO_MIN_DEPOIS)).toBe(3)

    expect(await blocosDo(pessoa)).toEqual(primeira)
    expect(primeira.every((b) => b.calendar_id === cal)).toBe(true)
  })

  test('evento que sumiu do provedor é removido, e o que mudou de horário é atualizado', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await gravar(cal, [bloco('ev-fica', 1), bloco('ev-cancelado', 2), bloco('ev-muda', 3)])

    await gravar(cal, [bloco('ev-fica', 1), bloco('ev-muda', 4)], QUATRO_MIN_DEPOIS)

    const blocos = await blocosDo(pessoa)
    expect(blocos.map((b) => b.external_id)).toEqual(['ev-fica', 'ev-muda'])
    expect(blocos[1]!.starts_at.toISOString()).toBe(bloco('ev-muda', 4).starts_at)
  })

  test('lista vazia apaga a ocupação do calendário e ainda assim avança synced_at', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await gravar(cal, [bloco('ev-a', 1)])

    expect(await gravar(cal, [], QUATRO_MIN_DEPOIS)).toBe(0)

    expect(await blocosDo(pessoa)).toEqual([])
    expect((await linhaDo(cal)).synced_at!.toISOString()).toBe('2026-10-05T12:04:00.000Z')
  })

  test('a passagem de um calendário não apaga os blocos de outro calendário da mesma pessoa', async () => {
    const pessoa = await especialista()
    const google = await conectar(pessoa)
    const outro = await conectar(pessoa, { provedor: 'microsoft' })
    await gravar(google, [bloco('ev-google', 1)])
    await gravar(outro, [bloco('ev-outro', 2)])

    await gravar(google, [bloco('ev-google', 1)], QUATRO_MIN_DEPOIS)

    expect((await blocosDo(pessoa)).map((b) => b.external_id)).toEqual(['ev-google', 'ev-outro'])
  })

  test('bloco sem calendário do mesmo especialista (anterior à coluna) sai na reconciliação', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await banco.sql.query(
      `insert into public.specialist_busy_blocks (account_id, specialist_id, starts_at, ends_at, external_id)
       values ($1, $2, $3, $4, 'ev-orfao')`,
      [contaId, pessoa, bloco('x', 1).starts_at, bloco('x', 1).ends_at],
    )

    await gravar(cal, [bloco('ev-a', 2)])

    expect((await blocosDo(pessoa)).map((b) => b.external_id)).toEqual(['ev-a'])
  })

  test('bloco sem duração e repetido não derrubam a gravação', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    const torto = { ...bloco('ev-torto', 1), ends_at: bloco('ev-torto', 1).starts_at }

    expect(await gravar(cal, [bloco('ev-a', 1), bloco('ev-a', 2), torto])).toBe(1)

    expect((await blocosDo(pessoa)).map((b) => b.external_id)).toEqual(['ev-a'])
  })

  test('avança synced_at e limpa sync_error', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await banco.sql.query('select public.registrar_falha_de_sincronizacao($1, $2)', [cal, 'falhou antes'])

    await gravar(cal, [bloco('ev-a', 1)])

    const linha = await linhaDo(cal)
    expect(linha.synced_at!.toISOString()).toBe('2026-10-05T12:00:00.000Z')
    expect(linha.sync_error).toBeNull()
  })

  test('calendário que não existe mais não grava nada', async () => {
    expect(await gravar('00000000-0000-4000-8000-000000000000', [bloco('ev', 1)])).toBe(0)
  })
})

describe('a falha', () => {
  test('grava a frase e deixa synced_at e a ocupação como estavam', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await gravar(cal, [bloco('ev-a', 1)])

    await banco.sql.query('select public.registrar_falha_de_sincronizacao($1, $2)', [
      cal,
      'A conexão com o calendário expirou.',
    ])

    const linha = await linhaDo(cal)
    expect(linha.sync_error).toBe('A conexão com o calendário expirou.')
    expect(linha.synced_at!.toISOString()).toBe('2026-10-05T12:00:00.000Z')
    expect((await blocosDo(pessoa)).map((b) => b.external_id)).toEqual(['ev-a'])
  })

  test('as passagens da rotina não viram linha de trilha', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await reivindicar(25)
    await gravar(cal, [bloco('ev-a', 1)])
    await banco.sql.query('select public.registrar_falha_de_sincronizacao($1, $2)', [cal, 'falhou'])

    const { rows } = await banco.sql.query<{ n: number }>(
      `select count(*)::int as n from public.audit_log where target_type = 'specialist_calendars' and target_id = $1`,
      [cal],
    )
    expect(rows[0]!.n).toBe(0)
  })
})

describe('o token e a desconexão', () => {
  test('o token sai com a conta certa e não sai com outra', async () => {
    const cal = await conectar(await especialista(), { token: 'token-de-renovacao-secreto' })

    const certo = await banco.sql.query<{ token: string | null }>(
      'select public.token_do_calendario($1, $2) as token',
      [contaId, cal],
    )
    const errado = await banco.sql.query<{ token: string | null }>(
      'select public.token_do_calendario($1, $2) as token',
      [outraContaId, cal],
    )

    expect(certo.rows[0]!.token).toBe('token-de-renovacao-secreto')
    expect(errado.rows[0]!.token).toBeNull()
  })

  test('desconectar o calendário leva os blocos dele', async () => {
    const pessoa = await especialista()
    const cal = await conectar(pessoa)
    await gravar(cal, [bloco('ev-a', 1)])

    await banco.sql.query('delete from public.specialist_calendars where id = $1', [cal])

    expect(await blocosDo(pessoa)).toEqual([])
  })

  test.each([
    ['reivindicar_calendarios_para_sincronizar(integer, timestamptz)'],
    ['gravar_ocupacao_do_calendario(uuid, jsonb, timestamptz)'],
    ['registrar_falha_de_sincronizacao(uuid, text)'],
    ['token_do_calendario(uuid, uuid)'],
  ])('%s é só de service_role', async (assinatura) => {
    const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
      `select papel, has_function_privilege(papel, $1, 'execute') as pode
         from unnest(array['anon', 'authenticated', 'service_role']) as papel
        order by papel`,
      [`public.${assinatura}`],
    )
    expect(rows).toEqual([
      { papel: 'anon', pode: false },
      { papel: 'authenticated', pode: false },
      { papel: 'service_role', pode: true },
    ])
  })
})
