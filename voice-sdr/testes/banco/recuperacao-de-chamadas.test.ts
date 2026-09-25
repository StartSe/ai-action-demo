// O que cron-call-recovery lê e escreve: `reivindicar_recuperacao`,
// `reprogramar_chamada_perdida` e `contas_para_o_disjuntor` (seção 4.6, T-07,
// L-12, R-01, RF-417).
//
// O que este arquivo prova:
//
// 1. **A reivindicação pega o que a varredura precisa olhar, e só isso**: a
//    órfã depois de 3 minutos (e não antes), a chamada com conversa sem
//    finalização, a finalizada por gente sem classificação depois de 1 minuto
//    de folga (US-140). Não pega a finalizada e classificada, a atendida por máquina, a
//    que desistiu, nem a órfã sem conversa já fechada.
// 2. **A chamada tomada sai com `recovery_claimed_at`**, e a reivindicação
//    seguinte no mesmo instante não a devolve; a volta espera 2^tentativas
//    minutos.
// 3. **O teto de 25** vale no SQL também, e cada linha vem com o
//    `max_duration_seconds` da conta.
// 4. **A reprogramação** enfileira a próxima tentativa só quando a chave da
//    fonte carrega o número da tentativa, uma vez só, e até a terceira.
// 5. **O disjuntor** lista a conta operando com falha de provedor na janela,
//    com N, M e os N eventos mais recentes; conta parada não aparece.
// 6. As três funções são só de `service_role`, e N e M têm padrão e faixa.
//
// O `for update skip locked` com duas passagens sobrepostas precisa de duas
// conexões, e o PGlite tem uma: a prova de concorrência da fila está em
// `fila-concorrencia.test.ts`, no degrau 3.
//
// Referência: migração 20260923150000_recuperacao_de_chamadas.sql.

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

const INSTANTE = new Date(AGORA).toISOString()

let sequencia = 0

async function chamada(colunas: Record<string, unknown>): Promise<string> {
  sequencia += 1
  const linha: Record<string, unknown> = {
    account_id: contaId,
    lead_id: leadId,
    purpose: 'discovery',
    direction: 'outbound',
    idempotency_key: `manual:${sequencia}`,
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

async function reivindicar(limite = 25, instante = INSTANTE) {
  const { rows } = await banco.sql.query<{ id: string; max_duration_seconds: number }>(
    'select * from public.reivindicar_recuperacao($1, $2)',
    [limite, instante],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Recuperação Ltda') returning id`,
  )
  contaId = rows[0]!.id
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead da recuperação', '+5511990000088', 'cenario') returning id`,
    [contaId],
  )
  leadId = leads[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.calls')
  await banco.sql.query('delete from public.integration_events')
  await banco.sql.query(
    `update public.account_settings
        set max_duration_seconds = 600, breaker_failures = 5, breaker_window_minutes = 10
      where account_id = $1`,
    [contaId],
  )
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1`,
    [contaId],
  )
})

describe('a reivindicação da varredura', () => {
  test('a órfã entra depois de 3 minutos sem provider_call_sid, e não antes', async () => {
    const recente = await chamada({ status: 'queued', started_at: antes(3 * MINUTO - 1000) })
    const velha = await chamada({ status: 'queued', started_at: antes(3 * MINUTO + 1000) })
    const tocando = await chamada({ status: 'ringing', started_at: antes(5 * MINUTO) })

    const ids = (await reivindicar()).map((linha) => linha.id)
    expect(ids).toEqual(expect.arrayContaining([velha, tocando]))
    expect(ids).not.toContain(recente)
  })

  test('chamada com conversa sem finalização entra, viva ou encerrada', async () => {
    const viva = await chamada({
      status: 'ringing',
      provider_call_sid: 'CA01',
      provider_conversation_id: 'conv_01',
      started_at: antes(MINUTO),
    })
    const perdida = await chamada({
      status: 'ended',
      end_reason: 'provider_lost',
      provider_call_sid: 'CA02',
      provider_conversation_id: 'conv_02',
      started_at: antes(30 * MINUTO),
      ended_at: antes(10 * MINUTO),
    })
    const ids = (await reivindicar()).map((linha) => linha.id)
    expect(ids.toSorted()).toEqual([viva, perdida].toSorted())
  })

  test('não entra: finalizada e classificada, atendida por máquina, desistida, dial_lost sem conversa', async () => {
    const base = { provider_call_sid: 'CA03', started_at: antes(60 * MINUTO) }
    await chamada({ ...base, status: 'ended', provider_conversation_id: 'conv_03', finalized_at: antes(30 * MINUTO), answered_by: 'human', classification_source: 'backfill', classification_confidence: 0.6 })
    await chamada({ ...base, status: 'ended', provider_conversation_id: 'conv_04', finalized_at: antes(30 * MINUTO), answered_by: 'machine' })
    await chamada({ ...base, status: 'ringing', provider_conversation_id: 'conv_05', recovery_gave_up_at: antes(MINUTO) })
    await chamada({ status: 'failed', end_reason: 'dial_lost', started_at: antes(60 * MINUTO) })
    await chamada({ ...base, status: 'ended', provider_conversation_id: 'conv_06', finalized_at: antes(30 * MINUTO), answered_by: 'human', classify_gave_up_at: antes(MINUTO) })

    expect(await reivindicar()).toEqual([])
  })

  test('a classificação pendente entra depois de 1 minuto da finalização', async () => {
    const base = { status: 'ended', provider_call_sid: 'CA07', started_at: antes(20 * MINUTO), answered_by: 'human' }
    const recente = await chamada({ ...base, provider_conversation_id: 'conv_07', finalized_at: antes(MINUTO - 1000) })
    const pendente = await chamada({ ...base, provider_conversation_id: 'conv_08', finalized_at: antes(MINUTO + 1000) })

    const ids = (await reivindicar()).map((linha) => linha.id)
    expect(ids).toEqual([pendente])
    expect(ids).not.toContain(recente)
  })

  test('a tomada grava recovery_claimed_at, e a volta espera 2^tentativas minutos', async () => {
    const id = await chamada({
      status: 'ringing',
      provider_call_sid: 'CA09',
      provider_conversation_id: 'conv_09',
      started_at: antes(MINUTO),
    })
    expect((await reivindicar()).map((linha) => linha.id)).toEqual([id])

    const { rows } = await banco.sql.query<{ recovery_claimed_at: Date }>(
      'select recovery_claimed_at from public.calls where id = $1',
      [id],
    )
    expect(rows[0]!.recovery_claimed_at.toISOString()).toBe(INSTANTE)

    // Mesmo instante: já tomada.
    expect(await reivindicar()).toEqual([])
    // Zero tentativas: a volta é depois de um minuto.
    expect(await reivindicar(25, new Date(AGORA + 59_000).toISOString())).toEqual([])
    expect((await reivindicar(25, new Date(AGORA + MINUTO).toISOString())).map((l) => l.id)).toEqual([id])

    // Com três tentativas, espera oito.
    await banco.sql.query('update public.calls set recovery_attempts = 3 where id = $1', [id])
    const depois = AGORA + MINUTO
    expect(await reivindicar(25, new Date(depois + 7 * MINUTO).toISOString())).toEqual([])
    expect(await reivindicar(25, new Date(depois + 8 * MINUTO).toISOString())).toHaveLength(1)
  })

  test('o teto é 25 mesmo com pedido maior, e cada linha traz a duração máxima da conta', async () => {
    await banco.sql.query('update public.account_settings set max_duration_seconds = 900 where account_id = $1', [contaId])
    for (let i = 0; i < 27; i += 1) {
      await chamada({ status: 'queued', started_at: antes((10 + i) * MINUTO) })
    }
    const linhas = await reivindicar(100)
    expect(linhas).toHaveLength(25)
    expect(new Set(linhas.map((linha) => linha.max_duration_seconds))).toEqual(new Set([900]))
  })
})

describe('a reprogramação da chamada perdida', () => {
  async function itemDaChamada(source: string, sourceRef: string, attempt = 1): Promise<string> {
    const id = await chamada({ status: 'failed', end_reason: 'dial_lost', started_at: antes(10 * MINUTO) })
    await banco.sql.query(
      `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, status, call_id)
       values ($1, $2, 'discovery', $3, $4, $5, 'done', $6)`,
      [contaId, leadId, source, sourceRef, attempt, id],
    )
    return id
  }

  async function reprogramar(id: string): Promise<string> {
    const { rows } = await banco.sql.query<{ codigo: string }>(
      'select public.reprogramar_chamada_perdida($1, $2) as codigo',
      [id, INSTANTE],
    )
    return rows[0]!.codigo
  }

  test('camp: a próxima tentativa entra 30 minutos à frente, com o número seguinte na chave', async () => {
    const alvo = 'abcdef00-0000-4000-8000-00000000a1f0'
    const id = await itemDaChamada('camp', `${alvo}:1`)
    expect(await reprogramar(id)).toBe('reprogramada')

    const { rows } = await banco.sql.query<{ source_ref: string; attempt: number; status: string; run_at: Date }>(
      `select source_ref, attempt, status, run_at from public.dial_queue where status = 'queued'`,
    )
    expect(rows).toEqual([
      { source_ref: `${alvo}:2`, attempt: 2, status: 'queued', run_at: new Date(AGORA + 30 * MINUTO) },
    ])
  })

  test('a segunda reprogramação da mesma chamada não enfileira de novo', async () => {
    const id = await itemDaChamada('rescue', 'abcdef00-0000-4000-8000-00000000beef:1')
    expect(await reprogramar(id)).toBe('reprogramada')
    expect(await reprogramar(id)).toBe('ja_reprogramada')
    const { rows } = await banco.sql.query(`select 1 from public.dial_queue where status = 'queued'`)
    expect(rows).toHaveLength(1)
  })

  test('fonte sem o número da tentativa na chave não enfileira nada', async () => {
    const id = await itemDaChamada('stl', leadId)
    expect(await reprogramar(id)).toBe('chave_sem_tentativa')
    const { rows } = await banco.sql.query(`select 1 from public.dial_queue where status = 'queued'`)
    expect(rows).toEqual([])
  })

  test('a terceira tentativa é o teto', async () => {
    const id = await itemDaChamada('camp', 'abcdef00-0000-4000-8000-00000000a1f0:3', 3)
    expect(await reprogramar(id)).toBe('teto_de_tentativas')
  })

  test('chamada sem item na fila devolve o código, sem enfileirar', async () => {
    const id = await chamada({ status: 'failed', end_reason: 'dial_lost', started_at: antes(10 * MINUTO) })
    expect(await reprogramar(id)).toBe('sem_item_na_fila')
  })
})

describe('a leitura do disjuntor', () => {
  async function evento(minutosAtras: number, status: number | null, provider = 'voz') {
    await banco.sql.query(
      `insert into public.integration_events (account_id, direction, provider, endpoint, status_code, at)
       values ($1, 'outbound', $2, 'convai/conversations/x', $3, $4)`,
      [contaId, provider, status, antes(minutosAtras * MINUTO)],
    )
  }

  async function contas() {
    const { rows } = await banco.sql.query<{
      account_id: string
      falhas: number
      janela_em_minutos: number
      eventos: { at: string; status_code: number | null }[]
    }>('select * from public.contas_para_o_disjuntor($1)', [INSTANTE])
    return rows
  }

  test('conta com falha de provedor na janela aparece com N, M e os N eventos mais recentes', async () => {
    for (let i = 1; i <= 7; i += 1) await evento(i, i % 2 === 0 ? 503 : null, i === 7 ? 'telefonia' : 'voz')
    const [linha, ...resto] = await contas()
    expect(resto).toEqual([])
    expect(linha).toMatchObject({ account_id: contaId, falhas: 5, janela_em_minutos: 10 })
    expect(linha!.eventos).toHaveLength(5)
    expect(linha!.eventos.map((e) => e.status_code)).toEqual([null, 503, null, 503, null])
  })

  test('falha só fora da janela, 4xx e outro provedor não trazem a conta', async () => {
    await evento(11, null)
    await evento(2, 404)
    await evento(1, null, 'modelo')
    expect(await contas()).toEqual([])
  })

  test('conta parada não aparece: o disjuntor não pausa de novo nem se rearma', async () => {
    await evento(1, null)
    await banco.sql.query(
      `update public.accounts
          set dialing_paused_at = $2, dialing_paused_by = '00000000-0000-0000-0000-000000000000',
              dialing_paused_reason = 'disjuntor'
        where id = $1`,
      [contaId, INSTANTE],
    )
    expect(await contas()).toEqual([])
  })
})

describe('as colunas e os privilégios', () => {
  test('N e M nascem 5 e 10, e têm faixa', async () => {
    const { rows } = await banco.sql.query<{ column_name: string; column_default: string }>(
      `select column_name, column_default from information_schema.columns
        where table_name = 'account_settings' and column_name in ('breaker_failures', 'breaker_window_minutes')
        order by column_name`,
    )
    expect(rows).toEqual([
      { column_name: 'breaker_failures', column_default: '5' },
      { column_name: 'breaker_window_minutes', column_default: '10' },
    ])
    await expect(
      banco.sql.query('update public.account_settings set breaker_failures = 1 where account_id = $1', [contaId]),
    ).rejects.toThrow(/account_settings_falhas_do_disjuntor/)
    await expect(
      banco.sql.query('update public.account_settings set breaker_window_minutes = 0 where account_id = $1', [contaId]),
    ).rejects.toThrow(/account_settings_janela_do_disjuntor/)
  })

  test('as tentativas não ficam negativas', async () => {
    await expect(chamada({ status: 'queued', recovery_attempts: -1 })).rejects.toThrow(/calls_tentativas_de_recuperacao/)
    await expect(chamada({ status: 'queued', classify_attempts: -1 })).rejects.toThrow(/calls_tentativas_de_classificacao/)
  })

  test.each([
    ['reivindicar_recuperacao(integer, timestamptz)'],
    ['reprogramar_chamada_perdida(uuid, timestamptz)'],
    ['contas_para_o_disjuntor(timestamptz)'],
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
