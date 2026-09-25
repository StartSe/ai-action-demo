// A política de retentativa aplicada na fila de discagem (US-189, RF-417).
//
// O que este arquivo prova:
//
// 1. **As duas verdades coincidem.** `public.decidir_retentativa` cumpre a
//    mesma tabela de casos (`casos-de-retentativa.ts`) que o módulo portável
//    cumpre em `test:unit`, e os padrões das colunas são os de `padroes.ts`.
// 2. **`reprogramar_tentativa` enfileira uma vez.** Sem atendimento entra com o
//    recuo, caixa postal no turno seguinte, no fuso do lead; a segunda chamada
//    para a mesma ligação devolve `ja_reprogramada` e deixa uma linha só.
// 3. **O que não enfileira**: número inválido, teto (que grava um evento no
//    lead, uma vez só) e as fontes com dono próprio (manual, rem, camp).
// 4. **Só `service_role` executa**, e os checks recusam política torta.
//
// Referência: migração 20261010110000_politica_de_retentativa.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { CASOS_DE_RETENTATIVA } from '../../supabase/functions/_shared/automacao/casos-de-retentativa.ts'
import { POLITICA_PADRAO, TURNOS_PADRAO } from '../../supabase/functions/_shared/automacao/padroes.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let donoId: string
let leadId: string
let leadDeManausId: string

const SEGUNDA_10H = '2026-10-05T13:00:00.000Z'
let sequencia = 0

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Retentativa Ltda') returning id`,
  )
  contaId = rows[0]!.id
  donoId = await banco.criarUsuario('dono@retentativa.test', 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [contaId, donoId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead de São Paulo', '+5511990000101', 'cenario') returning id`,
    [contaId],
  )
  leadId = leads[0]!.id
  const { rows: deManaus } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source, timezone)
     values ($1, 'Lead de Manaus', '+5592990000102', 'cenario', 'America/Manaus') returning id`,
    [contaId],
  )
  leadDeManausId = deManaus[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue')
  await banco.sql.query('delete from public.calls')
  await banco.sql.query(`delete from public.lead_events where kind = 'automation'`)
})

/** Uma ligação que saiu de um item da fila, e o item apontando para ela. */
async function ligacaoDaFila(
  opcoes: { fonte?: string; ref?: string; tentativa?: number; lead?: string } = {},
): Promise<string> {
  sequencia += 1
  const lead = opcoes.lead ?? leadId
  const fonte = opcoes.fonte ?? 'stl'
  const ref = opcoes.ref ?? (fonte === 'stl' ? lead : `${crypto.randomUUID()}:1`)
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, lead_id, purpose, direction, idempotency_key, status, end_reason)
     values ($1, $2, 'discovery', 'outbound', $3, 'failed', 'no_answer') returning id`,
    [contaId, lead, `teste:${sequencia}`],
  )
  const chamadaId = rows[0]!.id
  await banco.sql.query(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, status, call_id)
     values ($1, $2, 'discovery', $3, $4, $5, 'done', $6)`,
    [contaId, lead, fonte, ref, opcoes.tentativa ?? 1, chamadaId],
  )
  return chamadaId
}

interface Resposta {
  readonly resultado: string
  readonly tentativa?: number
  readonly quando?: string
  readonly turno?: string
}

async function reprogramar(chamadaId: string, resultado: string, agora = SEGUNDA_10H): Promise<Resposta> {
  const { rows } = await banco.sql.query<{ r: Resposta }>(
    'select public.reprogramar_tentativa($1, $2, $3) as r',
    [chamadaId, resultado, agora],
  )
  return rows[0]!.r
}

async function fila(): Promise<Array<{ attempt: number; run_at: Date; source: string; source_ref: string; status: string }>> {
  const { rows } = await banco.sql.query<{ attempt: number; run_at: Date; source: string; source_ref: string; status: string }>(
    'select attempt, run_at, source, source_ref, status from public.dial_queue order by attempt',
  )
  return rows
}

describe('a mesma decisão nos dois lados', () => {
  for (const caso of CASOS_DE_RETENTATIVA) {
    test(caso.nome, async () => {
      const { rows } = await banco.sql.query<{ d: Record<string, unknown> }>(
        `select public.decidir_retentativa($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) as d`,
        [
          caso.resultado,
          caso.tentativa,
          caso.agora,
          caso.fuso,
          caso.politica.tetoDeTentativas,
          caso.politica.recuosEmMinutos,
          caso.politica.recuoOcupadoEmMinutos,
          caso.politica.diasUteis,
          JSON.stringify(caso.turnos),
        ],
      )
      const decisao = rows[0]!.d
      if (caso.esperado.reprogramar) {
        expect(decisao.reprogramar).toBe(true)
        expect(Date.parse(String(decisao.quando))).toBe(Date.parse(caso.esperado.quando))
        expect(decisao.turno).toBe(caso.esperado.turno)
        expect(decisao.motivo).toBe(caso.resultado)
      } else {
        expect(decisao).toEqual({ reprogramar: false, motivo: caso.esperado.motivo })
      }
    })
  }

  test('os padrões das colunas são os de padroes.ts', async () => {
    const { rows } = await banco.sql.query<{
      retry_max_attempts: number
      retry_backoff_minutes: number[]
      retry_busy_minutes: number
      retry_shifts: unknown
      dias: number[]
    }>(
      `select retry_max_attempts, retry_backoff_minutes, retry_busy_minutes, retry_shifts,
              array(select k::int from jsonb_object_keys(dialing_window) as k order by 1) as dias
         from public.account_settings where account_id = $1`,
      [contaId],
    )
    const linha = rows[0]!
    expect(linha.retry_max_attempts).toBe(POLITICA_PADRAO.tetoDeTentativas)
    expect(linha.retry_backoff_minutes).toEqual(POLITICA_PADRAO.recuosEmMinutos)
    expect(linha.retry_busy_minutes).toBe(POLITICA_PADRAO.recuoOcupadoEmMinutos)
    expect(linha.retry_shifts).toEqual(TURNOS_PADRAO)
    expect(linha.dias).toEqual(POLITICA_PADRAO.diasUteis)
  })
})

describe('reprogramar_tentativa', () => {
  test('sem atendimento enfileira a tentativa 2 com o recuo da política, mesma fonte e mesma referência', async () => {
    const chamada = await ligacaoDaFila()
    const resposta = await reprogramar(chamada, 'sem_atendimento')
    expect(resposta).toMatchObject({ resultado: 'reprogramada', tentativa: 2, turno: 'manha' })
    const linhas = await fila()
    expect(linhas).toHaveLength(2)
    expect(linhas[1]).toMatchObject({ attempt: 2, source: 'stl', source_ref: leadId, status: 'queued' })
    expect(linhas[1]!.run_at.toISOString()).toBe('2026-10-05T14:00:00.000Z')
  })

  test('caixa postal às 10h enfileira no começo da tarde', async () => {
    const chamada = await ligacaoDaFila()
    const resposta = await reprogramar(chamada, 'caixa_postal')
    expect(resposta).toMatchObject({ resultado: 'reprogramada', turno: 'tarde' })
    expect((await fila())[1]!.run_at.toISOString()).toBe('2026-10-05T15:00:00.000Z')
  })

  test('o turno é o do fuso do lead, não o da conta', async () => {
    const chamada = await ligacaoDaFila({ lead: leadDeManausId })
    // 15h30 UTC: 12h30 em São Paulo (tarde), 11h30 em Manaus (manhã).
    const resposta = await reprogramar(chamada, 'caixa_postal', '2026-10-05T15:30:00.000Z')
    expect(resposta).toMatchObject({ resultado: 'reprogramada', turno: 'tarde' })
    expect((await fila())[1]!.run_at.toISOString()).toBe('2026-10-05T16:00:00.000Z')
  })

  test('a política gravada na conta é a que vale', async () => {
    await banco.sql.query(
      `update public.account_settings set retry_backoff_minutes = '{30}' where account_id = $1`,
      [contaId],
    )
    try {
      const chamada = await ligacaoDaFila()
      await reprogramar(chamada, 'sem_atendimento')
      expect((await fila())[1]!.run_at.toISOString()).toBe('2026-10-05T13:30:00.000Z')
    } finally {
      await banco.sql.query(
        `update public.account_settings set retry_backoff_minutes = '{60,180,1440}' where account_id = $1`,
        [contaId],
      )
    }
  })

  test('duas chamadas em sequência deixam uma linha nova só, e a segunda é ja_reprogramada', async () => {
    const chamada = await ligacaoDaFila()
    expect((await reprogramar(chamada, 'sem_atendimento')).resultado).toBe('reprogramada')
    expect((await reprogramar(chamada, 'sem_atendimento')).resultado).toBe('ja_reprogramada')
    expect(await fila()).toHaveLength(2)
  })

  test('número inválido não enfileira nada', async () => {
    const chamada = await ligacaoDaFila()
    expect((await reprogramar(chamada, 'numero_invalido')).resultado).toBe('numero_invalido')
    expect(await fila()).toHaveLength(1)
  })

  test('o teto não enfileira e grava um evento de automação no lead, uma vez só', async () => {
    const chamada = await ligacaoDaFila({ tentativa: POLITICA_PADRAO.tetoDeTentativas })
    expect((await reprogramar(chamada, 'sem_atendimento')).resultado).toBe('teto_de_tentativas')
    expect((await reprogramar(chamada, 'sem_atendimento')).resultado).toBe('teto_de_tentativas')
    expect(await fila()).toHaveLength(1)
    const { rows } = await banco.sql.query<{ actor: string; payload: Record<string, unknown>; account_id: string }>(
      `select actor, payload, account_id from public.lead_events where kind = 'automation' and lead_id = $1`,
      [leadId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor: 'system',
      account_id: contaId,
      payload: { acao: 'retentativas_esgotadas', call_id: chamada, tentativas: 4, fonte: 'stl' },
    })
  })

  test('cadência e resgate reprogramam; manual, lembrete e campanha não', async () => {
    const cadencia = await ligacaoDaFila({ fonte: 'cad' })
    expect((await reprogramar(cadencia, 'ocupado')).resultado).toBe('reprogramada')
    const resgate = await ligacaoDaFila({ fonte: 'rescue' })
    expect((await reprogramar(resgate, 'ocupado')).resultado).toBe('reprogramada')
    for (const fonte of ['manual', 'rem', 'camp']) {
      const ref = fonte === 'camp' ? `${crypto.randomUUID()}:1` : crypto.randomUUID()
      const chamada = await ligacaoDaFila({ fonte, ref })
      expect(await reprogramar(chamada, 'sem_atendimento')).toEqual({
        resultado: 'fonte_sem_retentativa',
        fonte,
      })
    }
  })

  test('chamada sem item na fila devolve sem_item_na_fila', async () => {
    expect((await reprogramar(crypto.randomUUID(), 'sem_atendimento')).resultado).toBe('sem_item_na_fila')
  })

  test('resultado fora da lista é recusado com 22023', async () => {
    const chamada = await ligacaoDaFila()
    await expect(reprogramar(chamada, 'atendida')).rejects.toMatchObject({ code: '22023' })
  })
})

describe('quem executa e o que a coluna aceita', () => {
  test('authenticated recebe permission denied no RPC e na decisão', async () => {
    await banco.comoUsuario(donoId)
    await expect(
      banco.sql.query(`select public.reprogramar_tentativa(gen_random_uuid(), 'sem_atendimento', now())`),
    ).rejects.toThrow(/permission denied/i)
    await banco.comoServico()
    await banco.comoUsuario(donoId)
    await expect(
      banco.sql.query(
        `select public.decidir_retentativa('ocupado', 1, now(), 'America/Sao_Paulo', 4, '{60}', 15, '{1}', '[]'::jsonb)`,
      ),
    ).rejects.toThrow(/permission denied/i)
    await banco.comoServico()
  })

  test('service_role executa o RPC, pelo catálogo', async () => {
    const { rows } = await banco.sql.query<{ servico: boolean; publico: boolean }>(
      `select has_function_privilege('service_role', 'public.reprogramar_tentativa(uuid, text, timestamptz)', 'execute') as servico,
              has_function_privilege('anon', 'public.reprogramar_tentativa(uuid, text, timestamptz)', 'execute') as publico`,
    )
    expect(rows[0]).toEqual({ servico: true, publico: false })
  })

  test.each([
    ['turno sobreposto', `retry_shifts = '[{"name":"a","start":"09:00","end":"12:00"},{"name":"b","start":"11:00","end":"13:00"}]'`],
    ['turno vazio', `retry_shifts = '[{}]'`],
    ['sem turno', `retry_shifts = '[]'`],
    ['turno com chave a mais', `retry_shifts = '[{"name":"a","start":"09:00","end":"12:00","x":1}]'`],
    ['recuo negativo', `retry_backoff_minutes = '{60,-1}'`],
    ['tabela de recuo vazia', `retry_backoff_minutes = '{}'`],
    ['teto zero', 'retry_max_attempts = 0'],
    ['ocupado zero', 'retry_busy_minutes = 0'],
  ])('o check recusa %s', async (_nome, atribuicao) => {
    await expect(
      banco.sql.query(`update public.account_settings set ${atribuicao} where account_id = $1`, [contaId]),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
