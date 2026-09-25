// O que cron-credit-watch lê e onde registra o aviso: `reivindicar_vigia_de_credito`,
// `abrir_aviso_de_provedor`, `rearmar_aviso_de_provedor`, `provider_watch` e
// `provider_alerts` (seção 4.6, RF-612, L-24).
//
// O que este arquivo prova:
//
// 1. **Um aviso aberto por conta, provedor e tipo.** Abrir duas vezes devolve
//    verdadeiro e depois falso, e fica uma linha só: é a rede de duas passagens
//    sobrepostas que leram "nenhum aberto" juntas. Crédito e cota do mesmo
//    provedor são avisos diferentes, e o insert direto que fura a função cai no
//    único parcial.
// 2. **Rearmar é update**, a linha continua lá com `rearmed_at`, e só depois
//    dele a queda seguinte abre outra. Rearmar sem aviso aberto devolve falso.
// 3. **A reivindicação gira a fila de contas**: só conta ativa, a olhada há
//    mais tempo primeiro (a nunca olhada antes de todas), não devolve a tomada
//    há menos de dez minutos, e traz o limiar de crédito da conta. O teto de
//    25 vale no SQL também.
// 4. As duas tabelas são da classe Servidor (só `SELECT` em `pg_policies`) e
//    as três funções são só de `service_role`.
//
// O `for no key update skip locked` com duas passagens sobrepostas precisa de
// duas conexões, e o PGlite tem uma: fica para o degrau 3, como na fila. O
// isolamento entre contas das duas tabelas está em
// `travessia-entre-contas.test.ts`, e a decisão (limiar, indisponível, rearme)
// em `supabase/functions/cron-credit-watch/credito.test.ts`.
//
// Referência: migração 20260923180000_vigia_de_credito.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const MINUTO = 60_000

function em(ms: number): string {
  return new Date(AGORA + ms).toISOString()
}

async function abrir(
  provedor = 'telefonia',
  tipo = 'credito',
  instante = em(0),
  conta = contaId,
): Promise<boolean> {
  const { rows } = await banco.sql.query<{ abriu: boolean }>(
    `select public.abrir_aviso_de_provedor($1, $2, $3, $4, $5::jsonb, $6) as abriu`,
    [conta, provedor, tipo, `Crédito baixo em ${provedor}.`, JSON.stringify({ restante_cents: 420 }), instante],
  )
  return rows[0]!.abriu
}

async function rearmar(provedor = 'telefonia', tipo = 'credito', instante = em(15 * MINUTO)): Promise<boolean> {
  const { rows } = await banco.sql.query<{ rearmou: boolean }>(
    `select public.rearmar_aviso_de_provedor($1, $2, $3, $4) as rearmou`,
    [contaId, provedor, tipo, instante],
  )
  return rows[0]!.rearmou
}

async function avisos() {
  const { rows } = await banco.sql.query<{
    provider: string
    kind: string
    alerted_at: Date
    rearmed_at: Date | null
    observed: unknown
  }>(
    `select provider, kind, alerted_at, rearmed_at, observed
       from public.provider_alerts where account_id = $1
      order by alerted_at, provider, kind`,
    [contaId],
  )
  return rows
}

async function reivindicar(limite = 25, instante = em(0)) {
  const { rows } = await banco.sql.query<{ account_id: string; credit_alert_cents: number | null }>(
    'select * from public.reivindicar_vigia_de_credito($1, $2)',
    [limite, instante],
  )
  return rows
}

async function criarConta(nome: string, status = 'active'): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, status) values ($1, $2) returning id`,
    [nome, status],
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaId = await criarConta('Vigia de Crédito Ltda')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.provider_alerts')
  await banco.sql.query('delete from public.provider_watch')
  await banco.sql.query('delete from public.accounts where id <> $1', [contaId])
})

describe('o aviso', () => {
  test('abrir duas vezes devolve verdadeiro e depois falso, e fica uma linha só', async () => {
    expect(await abrir()).toBe(true)
    expect(await abrir('telefonia', 'credito', em(15 * MINUTO))).toBe(false)

    const linhas = await avisos()
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.alerted_at.toISOString()).toBe(em(0))
    expect(linhas[0]!.observed).toEqual({ restante_cents: 420 })
  })

  test('crédito e cota do mesmo provedor são avisos diferentes', async () => {
    expect(await abrir('voz', 'credito')).toBe(true)
    expect(await abrir('voz', 'cota')).toBe(true)
    expect(await abrir('telefonia', 'credito')).toBe(true)
    expect(await avisos()).toHaveLength(3)
  })

  test('insert direto que fura a função cai no único parcial', async () => {
    await abrir()
    await expect(
      banco.sql.query(
        `insert into public.provider_alerts (account_id, provider, kind, message)
         values ($1, 'telefonia', 'credito', 'de novo')`,
        [contaId],
      ),
    ).rejects.toThrow(/provider_alerts_um_aberto/)
  })

  test('rearmar é update: a linha fica, e só depois dela a queda seguinte abre outra', async () => {
    await abrir()
    expect(await rearmar()).toBe(true)
    expect(await rearmar('telefonia', 'credito', em(30 * MINUTO))).toBe(false)

    const [rearmado] = await avisos()
    expect(rearmado!.rearmed_at?.toISOString()).toBe(em(15 * MINUTO))

    expect(await abrir('telefonia', 'credito', em(45 * MINUTO))).toBe(true)
    const linhas = await avisos()
    expect(linhas).toHaveLength(2)
    expect(linhas.map((linha) => linha.rearmed_at === null)).toEqual([false, true])
  })

  test('rearmar sem aviso aberto devolve falso e não escreve nada', async () => {
    expect(await rearmar()).toBe(false)
    expect(await avisos()).toEqual([])
  })

  test('provedor fora do catálogo, tipo desconhecido e frase em branco são recusados', async () => {
    await expect(abrir('sms')).rejects.toThrow(/provider_alerts_provedor/)
    await expect(abrir('voz', 'saldo')).rejects.toThrow(/provider_alerts_tipo/)
    await expect(
      banco.sql.query(
        `insert into public.provider_alerts (account_id, provider, kind, message) values ($1, 'voz', 'cota', '  ')`,
        [contaId],
      ),
    ).rejects.toThrow(/provider_alerts_frase/)
  })

  test('o aviso cai junto com a conta', async () => {
    const outra = await criarConta('Conta que sai')
    await abrir('telefonia', 'credito', em(0), outra)
    await banco.sql.query('delete from public.accounts where id = $1', [outra])
    const { rows } = await banco.sql.query('select 1 from public.provider_alerts where account_id = $1', [outra])
    expect(rows).toEqual([])
  })
})

describe('a reivindicação', () => {
  test('toma a conta ativa, grava provider_watch e traz o limiar de crédito', async () => {
    await banco.sql.query('update public.account_settings set credit_alert_cents = 1500 where account_id = $1', [
      contaId,
    ])
    const suspensa = await criarConta('Suspensa', 'suspended')

    const tomadas = await reivindicar()
    expect(tomadas).toEqual([{ account_id: contaId, credit_alert_cents: 1500 }])
    expect(tomadas.map((linha) => linha.account_id)).not.toContain(suspensa)

    const { rows } = await banco.sql.query<{ claimed_at: Date }>(
      'select claimed_at from public.provider_watch where account_id = $1',
      [contaId],
    )
    expect(rows[0]!.claimed_at.toISOString()).toBe(em(0))
  })

  test('a tomada há menos de dez minutos não volta; a de quinze sim', async () => {
    expect(await reivindicar()).toHaveLength(1)
    expect(await reivindicar(25, em(9 * MINUTO))).toEqual([])
    expect(await reivindicar(25, em(15 * MINUTO))).toHaveLength(1)
  })

  test('a fila gira: a nunca olhada primeiro, depois a olhada há mais tempo', async () => {
    const segunda = await criarConta('Segunda')
    const terceira = await criarConta('Terceira')
    await banco.sql.query(
      `insert into public.provider_watch (account_id, claimed_at) values ($1, $3), ($2, $4)`,
      [contaId, segunda, em(-20 * MINUTO), em(-60 * MINUTO)],
    )

    expect((await reivindicar(1)).map((linha) => linha.account_id)).toEqual([terceira])
    expect((await reivindicar(1)).map((linha) => linha.account_id)).toEqual([segunda])
    expect((await reivindicar(1)).map((linha) => linha.account_id)).toEqual([contaId])
    expect(await reivindicar(1)).toEqual([])
  })

  test('nunca mais de 25, mesmo pedindo mais', async () => {
    for (let n = 0; n < 30; n += 1) await criarConta(`Conta ${n}`)
    expect(await reivindicar(100)).toHaveLength(25)
  })
})

describe('as fronteiras', () => {
  test.each([['provider_watch'], ['provider_alerts']])('%s é da classe Servidor: só SELECT', async (tabela) => {
    const { rows } = await banco.sql.query<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = $1`,
      [tabela],
    )
    expect(rows).toEqual([{ cmd: 'SELECT' }])
  })

  test.each([
    ['reivindicar_vigia_de_credito(integer, timestamptz)'],
    ['abrir_aviso_de_provedor(uuid, text, text, text, jsonb, timestamptz)'],
    ['rearmar_aviso_de_provedor(uuid, text, text, timestamptz)'],
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
