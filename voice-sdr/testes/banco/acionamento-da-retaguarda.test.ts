// A reivindicação da classificação de retaguarda e a segunda via da varredura
// (US-140, T-15, RF-410, RNF-06).
//
// O que este arquivo prova:
//
// 1. **Duas vias no mesmo segundo classificam uma vez.** A finalização e
//    `cron-call-recovery` disparam `reivindicar_classificacao` juntas, e só uma
//    recebe o id.
// 2. **A reivindicação é um comando só.** O corpo da função é um `update ...
//    returning` condicionado em `language sql`, sem consulta antes. É a metade
//    que o PGlite consegue cobrar da concorrência: ele atende uma conexão só, e
//    as duas reivindicações do item 1 chegam em fila. Trocar por "consulta e
//    depois escreve" passaria o item 1 aqui e falharia com duas conexões; é
//    esta prova que cai no laço. A prova com as duas transações abertas ao
//    mesmo tempo está no fim do arquivo, sob `runIf`, e roda no degrau 3
//    (`npm run test:retaguarda:postgres`).
// 3. Chamada já classificada (`classified_at`) não é reivindicada de novo.
// 4. **Chamada corrigida por gente não é reivindicada**, pelo `where`, e a
//    trava da US-129 continua embaixo: a reivindicação que chegou antes da
//    correção não consegue sobrescrevê-la.
// 5. Reivindicação de pé há mais de 5 minutos volta a ser reivindicável; há
//    menos, não.
// 6. A varredura pega a finalizada sem classificação depois de um minuto, e
//    não pega a já classificada nem a que tem a reivindicação de pé.
// 7. Só `service_role` executa.
//
// Referência: migração 20260929170000_reivindicacao_da_retaguarda.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import { abrirBancoParaRls, VARIAVEL_DE_CONEXAO } from '../auxiliares/banco-para-rls.ts'

const EFEMERO = process.env[VARIAVEL_DE_CONEXAO] === undefined

let banco: BancoDeTeste
let contaId: string
let leadId: string
let sequencia = 0

async function chamada(colunas: Record<string, unknown> = {}): Promise<string> {
  sequencia += 1
  const linha: Record<string, unknown> = {
    account_id: contaId,
    lead_id: leadId,
    purpose: 'discovery',
    direction: 'outbound',
    status: 'ended',
    idempotency_key: `retaguarda:${sequencia}`,
    provider_call_sid: `CA${sequencia}`,
    provider_conversation_id: `conv_${sequencia}`,
    answered_by: 'human',
    finalized_at: new Date(Date.now() - 90_000).toISOString(),
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

async function reivindicar(id: string): Promise<string | null> {
  const { rows } = await banco.sql.query<{ id: string | null }>(
    'select public.reivindicar_classificacao($1) as id',
    [id],
  )
  return rows[0]!.id
}

async function varrer(): Promise<string[]> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.reivindicar_recuperacao(25, now())',
  )
  return rows.map((linha) => linha.id)
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Retaguarda Ltda') returning id`,
  )
  contaId = rows[0]!.id
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead da retaguarda', '+5511990000140', 'cenario') returning id`,
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

describe('a reivindicação da retaguarda', () => {
  test('as duas vias disparadas juntas: uma recebe a linha, a outra não', async () => {
    const id = await chamada()
    const [daFinalizacao, daVarredura] = await Promise.all([reivindicar(id), reivindicar(id)])
    expect([daFinalizacao, daVarredura].filter((recebida) => recebida !== null)).toEqual([id])

    const { rows } = await banco.sql.query<{ classify_started_at: Date | null }>(
      'select classify_started_at from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.classify_started_at).not.toBeNull()
  })

  test('é um comando só: update condicionado com returning, sem consulta antes', async () => {
    const { rows } = await banco.sql.query<{ lang: string; corpo: string }>(
      `select l.lanname as lang, p.prosrc as corpo
         from pg_proc as p
         join pg_language as l on l.oid = p.prolang
        where p.proname = 'reivindicar_classificacao'`,
    )
    expect(rows).toHaveLength(1)
    const { lang, corpo } = rows[0]!
    const comandos = corpo
      .split(';')
      .map((trecho) => trecho.replace(/--[^\n]*/g, '').trim())
      .filter((trecho) => trecho !== '')

    expect(lang, 'plpgsql abre espaço para consultar antes de escrever').toBe('sql')
    expect(comandos).toHaveLength(1)
    expect(comandos[0]).toMatch(/^update\s+public\.calls\b/i)
    expect(comandos[0]).toMatch(/\breturning\b/i)
    expect(comandos[0], 'a condição de reivindicável mora no where do próprio update').toMatch(
      /classify_started_at\s+is\s+null[\s\S]*interval\s+'5 minutes'/i,
    )
    expect(comandos[0]).not.toMatch(/\bselect\b/i)
  })

  test('chamada já classificada não é reivindicada de novo', async () => {
    const id = await chamada({ classified_at: new Date().toISOString() })
    expect(await reivindicar(id)).toBeNull()
  })

  test('chamada corrigida por gente não é reivindicada', async () => {
    const id = await chamada({
      classification_source: 'human',
      classification: { stage_key: 'qualified' },
    })
    expect(await reivindicar(id)).toBeNull()
  })

  test('a correção que chega depois da reivindicação continua protegida pela trava da US-129', async () => {
    const id = await chamada()
    expect(await reivindicar(id)).toBe(id)

    // A pessoa corrige enquanto o modelo pensa.
    await banco.sql.query(
      `update public.calls
          set classification_source = 'human', classification = '{"stage_key": "qualified"}'
        where id = $1`,
      [id],
    )
    // A retaguarda grava pelo caminho dela: a trava devolve os valores antigos.
    await banco.sql.query(
      `update public.calls
          set classification_source = 'backfill', classification_confidence = 0.6,
              classification = '{"stage_key": "lost"}', classified_at = now()
        where id = $1`,
      [id],
    )
    const { rows } = await banco.sql.query<{ classification_source: string; classification: { stage_key: string } }>(
      'select classification_source, classification from public.calls where id = $1',
      [id],
    )
    expect(rows[0]).toEqual({ classification_source: 'human', classification: { stage_key: 'qualified' } })
  })

  test('reivindicação de pé há mais de 5 minutos volta a ser reivindicável; há menos, não', async () => {
    const recente = await chamada({ classify_started_at: new Date(Date.now() - 4 * 60_000).toISOString() })
    const vencida = await chamada({ classify_started_at: new Date(Date.now() - 6 * 60_000).toISOString() })
    expect(await reivindicar(recente)).toBeNull()
    expect(await reivindicar(vencida)).toBe(vencida)
    expect(await reivindicar(vencida)).toBeNull()
  })

  test('só service_role executa', async () => {
    const { rows } = await banco.sql.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'reivindicar_classificacao'
          and privilege_type = 'EXECUTE'
        order by grantee`,
    )
    const papeis = rows.map((linha) => linha.grantee)
    expect(papeis).toContain('service_role')
    expect(papeis).not.toContain('anon')
    expect(papeis).not.toContain('authenticated')
    expect(papeis).not.toContain('PUBLIC')
  })
})

describe('a segunda via: a varredura', () => {
  test('pega a finalizada sem classificação depois de um minuto', async () => {
    const recente = await chamada({ finalized_at: new Date(Date.now() - 30_000).toISOString() })
    const pendente = await chamada()
    expect(await varrer()).toEqual([pendente])
    expect(await varrer()).not.toContain(recente)
  })

  test('não pega a já classificada, a corrigida, nem a que tem a reivindicação da retaguarda de pé', async () => {
    await chamada({ classified_at: new Date().toISOString() })
    await chamada({ classification_source: 'human', classification: { stage_key: 'qualified' } })
    const emCurso = await chamada()
    expect(await reivindicar(emCurso)).toBe(emCurso)
    expect(await varrer()).toEqual([])
  })
})

// Degrau 3 -------------------------------------------------------------------
//
// As duas transações abertas ao mesmo tempo, em duas conexões. A segunda
// reivindicação espera o bloqueio de linha da primeira; quando a primeira
// confirma, o Postgres reavalia o `where` sobre a linha nova e a segunda volta
// vazia. Com "consulta e depois escreve", as duas leriam a linha livre antes
// de qualquer escrita, e as duas classificariam.

let primeira: BancoDeTeste | undefined
let segunda: BancoDeTeste | undefined
let contaReal: string
const MARCA = `r${Date.now().toString(36)}`

describe.runIf(!EFEMERO)('com duas conexões (degrau 3)', () => {
  beforeAll(async () => {
    primeira = await abrirBancoParaRls()
    segunda = await abrirBancoParaRls()
    await primeira.comoServico()
    await segunda.comoServico()
    const { rows } = await primeira.sql.query<{ id: string }>(
      'insert into public.accounts (name) values ($1) returning id',
      [`${MARCA} Retaguarda`],
    )
    contaReal = rows[0]!.id
  }, 60_000)

  afterAll(async () => {
    if (primeira) {
      await primeira.sql.exec('rollback').catch(() => undefined)
      await primeira.sql.query('delete from public.accounts where id = $1', [contaReal])
      await primeira.encerrar()
    }
    if (segunda) {
      await segunda.sql.exec('rollback').catch(() => undefined)
      await segunda.encerrar()
    }
  })

  test('duas transações concorrentes: a linha vai para uma só', async () => {
    const { rows } = await primeira!.sql.query<{ id: string }>(
      `insert into public.calls (account_id, purpose, direction, status, idempotency_key, answered_by, finalized_at)
       values ($1, 'discovery', 'outbound', 'ended', $2, 'human', now() - interval '90 seconds')
       returning id`,
      [contaReal, `${MARCA}:1`],
    )
    const id = rows[0]!.id
    const sql = 'select public.reivindicar_classificacao($1) as id'

    try {
      await primeira!.sql.exec('begin')
      const { rows: daPrimeira } = await primeira!.sql.query<{ id: string | null }>(sql, [id])

      await segunda!.sql.exec('begin')
      const pendente = segunda!.sql.query<{ id: string | null }>(sql, [id])

      await primeira!.sql.exec('commit')
      const { rows: daSegunda } = await pendente
      await segunda!.sql.exec('commit')

      expect(daPrimeira[0]!.id).toBe(id)
      expect(daSegunda[0]!.id).toBeNull()
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
    }
  })
})
