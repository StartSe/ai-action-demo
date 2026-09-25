// O que cron-retention lê e onde marca: `reivindicar_expurgo` e as colunas de
// expurgo de `calls` (seção 4.6, RF-611, RF-807, P-10).
//
// O que este arquivo prova:
//
// 1. **A régua do prazo**: com o padrão de 90 dias, a chamada de 89 fica e a
//    de 91 sai; o prazo é o de `account_settings.retention_days` da conta; sem
//    `ended_at`, conta o início. É a mesma régua de `chamadas_fora_do_prazo`, e
//    um teste compara as duas.
// 2. **Chamada em curso nunca entra** (`queued`, `ringing`, `in_progress`),
//    por mais antiga que seja, nem a já expurgada, a que desistiu ou a que não
//    tem nada a apagar em lado nenhum. A que só tem a conversa no provedor
//    entra: é lá que P-10 mora.
// 3. **A reivindicação grava `purge_claimed_at`**: a seguinte dentro de uma
//    hora não a devolve, a de depois sim, e a olhada há mais tempo volta
//    primeiro. O teto de 25 vale no SQL também.
// 4. **O update da conclusão zera o conteúdo e deixa o fato**: a busca por
//    palavra deixa de achar a chamada, e duração e custo ficam.
// 5. A reivindicação é só de `service_role`.
//
// O `for update skip locked` com duas passagens sobrepostas precisa de duas
// conexões, e o PGlite tem uma: fica para o degrau 3, como na fila.
//
// Referência: migração 20260923190000_expurgo_de_conteudo.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let outraContaId: string

const AGORA = Date.parse('2026-09-23T06:00:00.000Z')
const DIA = 24 * 60 * 60_000
const MINUTO = 60_000

function antes(ms: number): string {
  return new Date(AGORA - ms).toISOString()
}

const INSTANTE = new Date(AGORA).toISOString()

const TRANSCRICAO = JSON.stringify({ turns: [{ role: 'agent', text: 'Posso falar do orçamento de frete?', at: antes(91 * DIA) }] })

let sequencia = 0

/** Chamada terminada há 91 dias, com gravação, transcrição e conversa no provedor. */
async function chamada(colunas: Record<string, unknown> = {}): Promise<string> {
  sequencia += 1
  const linha: Record<string, unknown> = {
    account_id: contaId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `manual:expurgo:${sequencia}`,
    status: 'ended',
    end_reason: 'completed',
    started_at: antes(91 * DIA + 5 * MINUTO),
    ended_at: antes(91 * DIA),
    duration_sec: 184,
    transcript: TRANSCRICAO,
    recording_path: `gravacoes/${sequencia}.mp3`,
    recording_expires_at: antes(DIA),
    provider_conversation_id: `conv_expurgo_${sequencia}`,
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

interface Reivindicada {
  id: string
  account_id: string
  recording_path: string | null
  provider_conversation_id: string | null
  purge_attempts: number
  retention_days: number
}

async function reivindicar(limite = 25, instante = INSTANTE): Promise<Reivindicada[]> {
  const { rows } = await banco.sql.query<Reivindicada>('select * from public.reivindicar_expurgo($1, $2)', [
    limite,
    instante,
  ])
  return rows
}

async function idsReivindicados(limite = 25, instante = INSTANTE): Promise<string[]> {
  return (await reivindicar(limite, instante)).map((linha) => linha.id)
}

async function retencao(conta: string, dias: number) {
  await banco.sql.query('update public.account_settings set retention_days = $2 where account_id = $1', [conta, dias])
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Expurgo Ltda'), ('Vizinha do Expurgo') returning id`,
  )
  contaId = rows[0]!.id
  outraContaId = rows[1]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.calls')
  await retencao(contaId, 90)
  await retencao(outraContaId, 90)
})

describe('o prazo', () => {
  test('com o padrão de 90 dias, a de 89 fica e a de 91 sai', async () => {
    const dentro = await chamada({ started_at: antes(89 * DIA + MINUTO), ended_at: antes(89 * DIA) })
    const fora = await chamada()

    expect(await idsReivindicados()).toEqual([fora])
    expect(dentro).not.toBe(fora)
  })

  test('o prazo é o da conta, e a reivindicação o devolve', async () => {
    await retencao(outraContaId, 30)
    const trintaEUm = await chamada({
      account_id: outraContaId,
      started_at: antes(31 * DIA + MINUTO),
      ended_at: antes(31 * DIA),
    })
    await chamada({ started_at: antes(31 * DIA + MINUTO), ended_at: antes(31 * DIA) })

    const tomadas = await reivindicar()
    expect(tomadas.map((linha) => linha.id)).toEqual([trintaEUm])
    expect(tomadas[0]!.retention_days).toBe(30)
  })

  test('sem ended_at conta o início', async () => {
    const semFim = await chamada({ status: 'failed', end_reason: 'dial_lost', ended_at: null })

    expect(await idsReivindicados()).toEqual([semFim])
  })

  test('a régua é a de chamadas_fora_do_prazo, que a tela de privacidade mostra', async () => {
    // `chamadas_fora_do_prazo` usa now(), então o cenário se monta no relógio
    // da máquina, e a reivindicação corre no mesmo instante.
    const agoraMs = Date.now()
    const ha = (dias: number) => new Date(agoraMs - dias * DIA).toISOString()
    await chamada({ started_at: ha(89), ended_at: ha(89) })
    await chamada({ started_at: ha(91), ended_at: ha(91) })
    await chamada({ started_at: ha(95), ended_at: ha(95) })
    await chamada({ status: 'ringing', end_reason: null, started_at: ha(95), ended_at: null })

    const agora = new Date(agoraMs).toISOString()
    const { rows } = await banco.sql.query<{ n: number }>('select public.chamadas_fora_do_prazo($1, 90) as n', [contaId])
    const reivindicadas = await idsReivindicados(25, agora)
    expect(rows[0]!.n).toBe(2)
    expect(reivindicadas).toHaveLength(rows[0]!.n)
  })
})

describe('o que nunca entra', () => {
  test.each([
    ['na fila', { status: 'queued', end_reason: null, ended_at: null }],
    ['tocando', { status: 'ringing', end_reason: null, ended_at: null }],
    ['em conversa', { status: 'in_progress', end_reason: null, ended_at: null }],
  ])('chamada %s, mesmo com 200 dias', async (_nome, colunas) => {
    await chamada({ ...colunas, started_at: antes(200 * DIA) })

    expect(await idsReivindicados()).toEqual([])
  })

  test('a já expurgada, a que desistiu e a que não tem nada a apagar', async () => {
    await chamada({ content_purged_at: antes(DIA), recording_path: null, transcript: '{}' })
    await chamada({ purge_gave_up_at: antes(DIA), purge_attempts: 5, purge_note: 'provedor de voz respondeu 500' })
    await chamada({ recording_path: null, transcript: '{}', provider_conversation_id: null })

    expect(await idsReivindicados()).toEqual([])
  })

  test('a que só tem a conversa no provedor entra', async () => {
    const soNoProvedor = await chamada({ recording_path: null, recording_expires_at: null, transcript: '{}' })

    expect(await idsReivindicados()).toEqual([soNoProvedor])
  })
})

describe('a reivindicação', () => {
  test('grava purge_claimed_at, e a seguinte dentro de uma hora não a devolve', async () => {
    const id = await chamada()

    expect(await idsReivindicados()).toEqual([id])
    const { rows } = await banco.sql.query<{ purge_claimed_at: Date }>(
      'select purge_claimed_at from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.purge_claimed_at.toISOString()).toBe(INSTANTE)

    expect(await idsReivindicados(25, new Date(AGORA + 59 * MINUTO).toISOString())).toEqual([])
    expect(await idsReivindicados(25, new Date(AGORA + 60 * MINUTO).toISOString())).toEqual([id])
  })

  test('a olhada há mais tempo volta primeiro, para 30 pendentes não deixarem as mesmas na frente', async () => {
    const primeira = await chamada({ ended_at: antes(120 * DIA), started_at: antes(120 * DIA + MINUTO) })
    const segunda = await chamada({ ended_at: antes(100 * DIA), started_at: antes(100 * DIA + MINUTO) })

    expect(await idsReivindicados(1)).toEqual([primeira])
    expect(await idsReivindicados(1, new Date(AGORA + DIA).toISOString())).toEqual([segunda])
    expect(await idsReivindicados(1, new Date(AGORA + 2 * DIA).toISOString())).toEqual([primeira])
  })

  test('devolve o que o módulo precisa para decidir os dois lados', async () => {
    const id = await chamada({ purge_attempts: 2, purge_storage_at: antes(DIA) })

    const [linha] = await reivindicar()
    expect(linha).toMatchObject({
      id,
      account_id: contaId,
      recording_path: expect.stringMatching(/\.mp3$/),
      provider_conversation_id: expect.stringMatching(/^conv_expurgo_/),
      purge_attempts: 2,
      retention_days: 90,
    })
  })

  test('o teto de 25 vale no SQL também', async () => {
    for (let n = 0; n < 27; n += 1) await chamada()

    expect(await idsReivindicados(100)).toHaveLength(25)
  })
})

describe('a conclusão', () => {
  test('zera o conteúdo e deixa o fato: a busca não acha, duração e classificação ficam', async () => {
    const id = await chamada({ classification: JSON.stringify({ stage: 'qualificado' }) })
    const busca = `select count(*)::integer as n from public.calls
                    where transcript_tsv @@ plainto_tsquery('portuguese', 'orçamento frete')`
    expect((await banco.sql.query<{ n: number }>(busca)).rows[0]!.n).toBe(1)

    await banco.sql.query(
      `update public.calls
          set recording_path = null, transcript = '{}'::jsonb, content_purged_at = $2,
              purge_storage_at = $2, purge_provider_at = $2, purge_note = null
        where id = $1 and content_purged_at is null`,
      [id, INSTANTE],
    )

    expect((await banco.sql.query<{ n: number }>(busca)).rows[0]!.n).toBe(0)
    const { rows } = await banco.sql.query<Record<string, unknown>>(
      'select duration_sec, classification, provider_conversation_id, recording_expires_at from public.calls where id = $1',
      [id],
    )
    expect(rows[0]).toMatchObject({
      duration_sec: 184,
      classification: { stage: 'qualificado' },
      provider_conversation_id: expect.stringMatching(/^conv_expurgo_/),
    })
    expect(rows[0]!.recording_expires_at).not.toBeNull()
    expect(await idsReivindicados()).toEqual([])
  })

  test('purge_attempts nasce zero e não fica negativa', async () => {
    const id = await chamada()
    const { rows } = await banco.sql.query<{ purge_attempts: number }>(
      'select purge_attempts from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.purge_attempts).toBe(0)
    await expect(chamada({ purge_attempts: -1 })).rejects.toThrow(/calls_tentativas_de_expurgo/)
  })

  test('reivindicar_expurgo é só de service_role', async () => {
    const { rows } = await banco.sql.query<{ papel: string; pode: boolean }>(
      `select papel, has_function_privilege(papel, 'public.reivindicar_expurgo(integer, timestamptz)', 'execute') as pode
         from unnest(array['anon', 'authenticated', 'service_role']) as papel
        order by papel`,
    )
    expect(rows).toEqual([
      { papel: 'anon', pode: false },
      { papel: 'authenticated', pode: false },
      { papel: 'service_role', pode: true },
    ])
  })
})
