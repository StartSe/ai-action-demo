// O que cron-cost-sync lê e escreve: `reivindicar_precos_tardios` e
// `gravar_preco_tardio` (seção 4.6, T-20, P-07, R-01).
//
// O que este arquivo prova:
//
// 1. **A reivindicação pega a chamada encerrada, que chegou à telefonia, sem
//    parcela de telefonia**, e só ela: não pega a viva, a que nunca teve
//    `provider_call_sid`, a que já tem a parcela (de qualquer informante) nem a
//    que desistiu. Parcela de voz ou de modelo não fecha o pendente.
// 2. **A chamada tomada sai com `cost_sync_claimed_at`**: a reivindicação
//    seguinte dez minutos depois não a devolve, a de quinze sim, e a fila gira
//    — a olhada há mais tempo volta primeiro. O teto de 25 vale no SQL também.
// 3. **Gravar duas vezes não soma duas vezes em `calls.cost_cents`**, e a
//    correção atualiza a parcela sem mudar `recorded_at`. A prova é pela soma,
//    que é o número que o teto de gasto lê.
// 4. **Zero é linha; desconhecido é ausência.** A chamada com preço zero sai
//    da reivindicação; a sem preço continua nela e com `cost_cents` zero, que é
//    o que a ficha lê ao lado das parcelas para dizer "parcial".
// 5. As duas funções são só de `service_role`.
//
// O `for update skip locked` com duas passagens sobrepostas precisa de duas
// conexões, e o PGlite tem uma: fica para o degrau 3, como na fila.
//
// Referência: migração 20260923170000_preco_tardio.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let leadId: string

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const MINUTO = 60_000

function antes(ms: number): string {
  return new Date(AGORA - ms).toISOString()
}

function depois(ms: number): string {
  return new Date(AGORA + ms).toISOString()
}

const INSTANTE = new Date(AGORA).toISOString()

let sequencia = 0

/** Chamada encerrada há 20 minutos, que chegou à telefonia. */
async function chamada(colunas: Record<string, unknown> = {}): Promise<string> {
  sequencia += 1
  const linha: Record<string, unknown> = {
    account_id: contaId,
    lead_id: leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `manual:preco:${sequencia}`,
    status: 'ended',
    end_reason: 'completed',
    provider_call_sid: `CA${String(sequencia).padStart(32, '0')}`,
    started_at: antes(25 * MINUTO),
    ended_at: antes(20 * MINUTO),
    ...colunas,
  }
  const nomes = Object.keys(linha)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (${nomes.join(', ')})
     values (${nomes.map((_, i) => `$${i + 1}`).join(', ')})
     returning id`,
    nomes.map((nome) => linha[nome]),
  )
  return rows[0]!.id
}

async function parcela(chamadaId: string, component: string, amount: number, source: string) {
  await banco.sql.query(
    `insert into public.call_costs (account_id, call_id, component, amount_cents, currency, source)
     values ($1, $2, $3, $4, 'USD', $5)`,
    [contaId, chamadaId, component, amount, source],
  )
}

async function reivindicar(limite = 25, instante = INSTANTE): Promise<string[]> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select * from public.reivindicar_precos_tardios($1, $2)',
    [limite, instante],
  )
  return rows.map((linha) => linha.id)
}

async function gravar(chamadaId: string, centavos: number, moeda = 'USD') {
  await banco.sql.query(`select public.gravar_preco_tardio($1, 'telephony', $2, $3, 'cron-cost-sync')`, [
    chamadaId,
    centavos,
    moeda,
  ])
}

async function custoDa(chamadaId: string): Promise<number> {
  const { rows } = await banco.sql.query<{ cost_cents: number }>('select cost_cents from public.calls where id = $1', [
    chamadaId,
  ])
  return rows[0]!.cost_cents
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Preço Tardio Ltda') returning id`,
  )
  contaId = rows[0]!.id
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead do preço', '+5511990000077', 'cenario') returning id`,
    [contaId],
  )
  leadId = leads[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.calls')
})

describe('a reivindicação', () => {
  test('pega a encerrada sem parcela de telefonia, e só ela', async () => {
    const pendente = await chamada()
    const falhou = await chamada({ status: 'failed', end_reason: 'no_answer' })
    const soVoz = await chamada()
    await parcela(soVoz, 'voice', 30, 'call-finalize')
    await parcela(soVoz, 'model', 2, 'call-classify')

    const viva = await chamada({ status: 'in_progress', end_reason: null, ended_at: null })
    const semSid = await chamada({ status: 'failed', end_reason: 'dial_lost', provider_call_sid: null })
    const comPreco = await chamada()
    await parcela(comPreco, 'telephony', 4, 'cron-cost-sync')
    const deOutroInformante = await chamada()
    await parcela(deOutroInformante, 'telephony', 4, 'conciliacao')
    const desistida = await chamada({ cost_sync_gave_up_at: antes(MINUTO) })

    const ids = await reivindicar()
    expect(ids.toSorted()).toEqual([pendente, falhou, soVoz].toSorted())
    expect(ids).not.toContain(viva)
    expect(ids).not.toContain(semSid)
    expect(ids).not.toContain(comPreco)
    expect(ids).not.toContain(deOutroInformante)
    expect(ids).not.toContain(desistida)
  })

  test('a tomada volta depois de 10 minutos, e não antes', async () => {
    const id = await chamada()
    expect(await reivindicar()).toEqual([id])

    const { rows } = await banco.sql.query<{ cost_sync_claimed_at: Date }>(
      'select cost_sync_claimed_at from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.cost_sync_claimed_at.toISOString()).toBe(INSTANTE)

    expect(await reivindicar(25, INSTANTE)).toEqual([])
    expect(await reivindicar(25, depois(10 * MINUTO - 1000))).toEqual([])
    expect(await reivindicar(25, depois(15 * MINUTO))).toEqual([id])
  })

  test('a fila gira: a olhada há mais tempo volta primeiro', async () => {
    const primeira = await chamada({ ended_at: antes(40 * MINUTO) })
    const segunda = await chamada({ ended_at: antes(30 * MINUTO) })
    const terceira = await chamada({ ended_at: antes(20 * MINUTO) })

    expect(await reivindicar(2)).toEqual([primeira, segunda])
    // Na passagem seguinte, a que ainda não foi olhada entra antes das duas, e
    // o desempate entre as já olhadas é o fim mais antigo. Sem o `nulls first`
    // a terceira ficaria de fora enquanto as duas primeiras não tivessem preço.
    const seguinte = await reivindicar(2, depois(15 * MINUTO))
    expect(seguinte.toSorted()).toEqual([primeira, terceira].toSorted())
    expect(seguinte).not.toContain(segunda)
  })

  test('o teto de 25 vale no SQL', async () => {
    for (let i = 0; i < 27; i += 1) await chamada()
    expect(await reivindicar(100)).toHaveLength(25)
    expect(await reivindicar(100, depois(15 * MINUTO))).toHaveLength(25)
  })
})

describe('a escrita do preço', () => {
  test('gravar duas vezes não soma duas vezes, e a correção atualiza a parcela', async () => {
    const id = await chamada()
    await parcela(id, 'voice', 30, 'call-finalize')
    expect(await custoDa(id)).toBe(30)

    await gravar(id, 13)
    await gravar(id, 13)
    expect(await custoDa(id)).toBe(43)

    const { rows: antesDaCorrecao } = await banco.sql.query<{ recorded_at: Date }>(
      `select recorded_at from public.call_costs where call_id = $1 and component = 'telephony'`,
      [id],
    )
    await gravar(id, 21, 'BRL')
    expect(await custoDa(id)).toBe(51)

    const { rows } = await banco.sql.query<{ amount_cents: number; currency: string; recorded_at: Date }>(
      `select amount_cents, currency, recorded_at from public.call_costs
        where call_id = $1 and component = 'telephony'`,
      [id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount_cents: 21, currency: 'BRL' })
    expect(rows[0]!.recorded_at.toISOString()).toBe(antesDaCorrecao[0]!.recorded_at.toISOString())
  })

  test('a conta da parcela é a da chamada', async () => {
    const id = await chamada()
    await gravar(id, 5)
    const { rows } = await banco.sql.query<{ account_id: string }>(
      'select account_id from public.call_costs where call_id = $1',
      [id],
    )
    expect(rows).toEqual([{ account_id: contaId }])
  })

  test('chamada inexistente não grava nada', async () => {
    await gravar('00000000-0000-4000-8000-000000000000', 5)
    const { rows } = await banco.sql.query<{ n: number }>('select count(*)::int as n from public.call_costs')
    expect(rows[0]!.n).toBe(0)
  })

  test('zero é linha e fecha o pendente; desconhecido continua pendente', async () => {
    const gratis = await chamada()
    const semPreco = await chamada()
    await gravar(gratis, 0)

    const { rows } = await banco.sql.query<{ call_id: string; amount_cents: number }>(
      `select call_id, amount_cents from public.call_costs where component = 'telephony'`,
    )
    expect(rows).toEqual([{ call_id: gratis, amount_cents: 0 }])
    expect(await reivindicar()).toEqual([semPreco])
  })
})

describe('as colunas e os privilégios', () => {
  test('as tentativas nascem zero e não ficam negativas', async () => {
    const id = await chamada()
    const { rows } = await banco.sql.query<{ cost_sync_attempts: number }>(
      'select cost_sync_attempts from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.cost_sync_attempts).toBe(0)
    await expect(chamada({ cost_sync_attempts: -1 })).rejects.toThrow(/calls_tentativas_de_preco/)
  })

  test.each([
    ['reivindicar_precos_tardios(integer, timestamptz)'],
    ['gravar_preco_tardio(uuid, text, integer, text, text)'],
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
