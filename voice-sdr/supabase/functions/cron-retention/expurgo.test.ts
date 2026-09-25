// cron-retention: o expurgo dos dois lados, a marca só depois do 2xx duplo, a
// idempotência, a chamada de 89 dias preservada e a de 91 expurgada, o registro
// da contagem e a desistência depois de cinco falhas.
//
// O dublê guarda `calls` em memória com o conteúdo inteiro (duração, custo,
// classificação), e `reivindicarChamadas` aplica a régua de
// `reivindicar_expurgo`: terminada, sem marca, sem desistência, com algo a
// apagar e com o fim mais antigo que `retention_days`. A régua do SQL de
// verdade se prova em `testes/banco/expurgo-de-conteudo.test.ts`; aqui ela
// existe para a passagem dupla poder mostrar o que a segunda passagem deixa de
// pedir. O Storage e o provedor contam cada pedido, e é pela contagem que a
// idempotência se prova.

import { describe, expect, test } from 'vitest'

import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import {
  atenderRotina,
  caminhoDaConversa,
  expurgarConteudo,
  LIMITE_DE_FALHAS,
  NOME_DA_ROTINA,
  provedorConfirmou,
  type ChamadaVencida,
  type ConclusaoDoExpurgo,
  type LinhaDaConta,
  type NotaDoExpurgo,
  type PortaDoExpurgo,
  type RastroDoExpurgo,
  type RespostaDoArmazenamento,
  type RespostaDoProvedor,
} from './expurgo.ts'

const AGORA = Date.parse('2026-09-23T06:00:00.000Z')
const DIA = 24 * 60 * 60_000
const INSTANTE = new Date(AGORA).toISOString()

const CONTA_A = 'abcdef00-0000-4000-8000-0000000000a1'
const CONTA_B = 'abcdef00-0000-4000-8000-0000000000b2'
const SEGREDO = 'segredo-interno-da-instalacao'

function em(ms: number): string {
  return new Date(ms).toISOString()
}

/** A linha de `calls` no que o expurgo lê e no que ele precisa deixar de pé. */
interface ChamadaGuardada {
  id: string
  account_id: string
  status: 'queued' | 'ringing' | 'in_progress' | 'ended' | 'failed'
  ended_at: string | null
  duration_sec: number
  cost_cents: number
  classification: Record<string, unknown>
  transcript: Record<string, unknown>
  recording_path: string | null
  recording_expires_at: string | null
  provider_conversation_id: string | null
  content_purged_at: string | null
  purge_storage_at: string | null
  purge_provider_at: string | null
  purge_attempts: number
  purge_note: string | null
  purge_gave_up_at: string | null
}

const TRANSCRICAO = { turns: [{ role: 'agent', text: 'Oi, aqui é a Sarah.', at: em(AGORA - 91 * DIA) }] }

function chamada(n: number, ajustes: Partial<ChamadaGuardada> = {}): ChamadaGuardada {
  const sufixo = String(n).padStart(4, '0')
  const fim = ajustes.ended_at ?? em(AGORA - 91 * DIA)
  return {
    id: `abcdef00-0000-4000-8000-00000000${sufixo}`,
    account_id: CONTA_A,
    status: 'ended',
    ended_at: fim,
    duration_sec: 184,
    cost_cents: 37,
    classification: { stage: 'qualificado', temperature: 'quente' },
    transcript: TRANSCRICAO,
    recording_path: `${CONTA_A}/${sufixo}.mp3`,
    recording_expires_at: em(Date.parse(fim) + 90 * DIA),
    provider_conversation_id: `conv_${sufixo}`,
    content_purged_at: null,
    purge_storage_at: null,
    purge_provider_at: null,
    purge_attempts: 0,
    purge_note: null,
    purge_gave_up_at: null,
    ...ajustes,
  }
}

type RespostaRoteirizada<T> = T | 'lança'

class Duble {
  readonly chamadas = new Map<string, ChamadaGuardada>()
  readonly retencao = new Map<string, number>()
  readonly remocoesNoStorage: string[] = []
  readonly remocoesNoProvedor: { conta: string; conversa: string }[] = []
  readonly rastros: RastroDoExpurgo[] = []
  readonly notas: { id: string; nota: NotaDoExpurgo }[] = []
  readonly conclusoes: { id: string; conclusao: ConclusaoDoExpurgo }[] = []
  readonly linhasDaConta: LinhaDaConta[] = []
  /** A resposta do Storage por caminho, na ordem dos pedidos; a última se repete. */
  readonly storage = new Map<string, RespostaRoteirizada<RespostaDoArmazenamento>[]>()
  /** A resposta do provedor por conversa; `null` é credencial indisponível. */
  readonly provedor = new Map<string, RespostaRoteirizada<RespostaDoProvedor | null>[]>()
  /** Chamada cuja conclusão levanta, para provar a contagem com a execução em erro. */
  concluirFalhaEm: string | null = null

  constructor(chamadas: readonly ChamadaGuardada[]) {
    for (const linha of chamadas) this.chamadas.set(linha.id, { ...linha })
  }

  linha(id: string): ChamadaGuardada {
    const linha = this.chamadas.get(id)
    if (!linha) throw new Error(`chamada ${id} não está no dublê`)
    return linha
  }

  private proxima<T>(fila: RespostaRoteirizada<T>[] | undefined, padrao: T): T {
    if (!fila || fila.length === 0) return padrao
    const resposta = fila.length > 1 ? fila.shift()! : fila[0]!
    if (resposta === 'lança') throw new Error('conexão recusada')
    return resposta
  }

  readonly porta: PortaDoExpurgo = {
    reivindicarChamadas: async (limite, instante) => {
      const agora = Date.parse(instante)
      const vencidas = [...this.chamadas.values()].filter((linha) => {
        const dias = this.retencao.get(linha.account_id) ?? 90
        const temConteudo =
          linha.recording_path !== null ||
          Object.keys(linha.transcript).length > 0 ||
          linha.provider_conversation_id !== null
        return (
          (linha.status === 'ended' || linha.status === 'failed') &&
          linha.content_purged_at === null &&
          linha.purge_gave_up_at === null &&
          temConteudo &&
          linha.ended_at !== null &&
          Date.parse(linha.ended_at) < agora - dias * DIA
        )
      })
      return vencidas.slice(0, limite).map(
        (linha): ChamadaVencida => ({
          id: linha.id,
          account_id: linha.account_id,
          recording_path: linha.recording_path,
          recording_expires_at: linha.recording_expires_at,
          provider_conversation_id: linha.provider_conversation_id,
          purge_storage_at: linha.purge_storage_at,
          purge_provider_at: linha.purge_provider_at,
          purge_attempts: linha.purge_attempts,
          retention_days: this.retencao.get(linha.account_id) ?? 90,
        }),
      )
    },

    apagarGravacao: async (caminho) => {
      this.remocoesNoStorage.push(caminho)
      return this.proxima(this.storage.get(caminho), { ok: true })
    },

    apagarConversa: async (conta, conversa) => {
      this.remocoesNoProvedor.push({ conta, conversa })
      return this.proxima(this.provedor.get(conversa), { status_code: 204, latency_ms: 80 })
    },

    rastrear: async (rastro) => {
      this.rastros.push(rastro)
    },

    anotar: async (id, nota) => {
      this.notas.push({ id, nota })
      const linha = this.linha(id)
      if (linha.content_purged_at !== null) return
      Object.assign(linha, nota)
    },

    concluir: async (id, conclusao) => {
      if (this.concluirFalhaEm === id) throw new Error('banco fora do ar')
      this.conclusoes.push({ id, conclusao })
      const linha = this.linha(id)
      if (linha.content_purged_at !== null) return
      Object.assign(linha, conclusao)
    },

    registrarNaConta: async (linha) => {
      this.linhasDaConta.push(linha)
    },
  }
}

function portaDeExecucao() {
  const fins: LinhaDeFim[] = []
  const porta: PortaDeExecucao = {
    inserirExecucao: async () => 'execucao-1',
    concluirExecucao: async (_id, linha) => {
      fins.push(linha)
    },
    itensDasUltimasExecucoes: async () => [],
  }
  return { porta, fins }
}

async function rodar(duble: Duble, instante = AGORA) {
  const { porta: execucao, fins } = portaDeExecucao()
  const resultado = await expurgarConteudo({ porta: duble.porta, execucao, agora: () => instante })
  return { resultado, fins }
}

describe('o expurgo dos dois lados', () => {
  test('apaga o arquivo no Storage e a conversa no provedor, e zera o conteúdo com a marca', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])

    const { resultado } = await rodar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(duble.remocoesNoStorage).toEqual([vencida.recording_path])
    expect(duble.remocoesNoProvedor).toEqual([{ conta: CONTA_A, conversa: 'conv_0001' }])

    const depois = duble.linha(vencida.id)
    expect(depois.recording_path).toBeNull()
    expect(depois.transcript).toEqual({})
    expect(depois.content_purged_at).toBe(INSTANTE)
    expect(depois.purge_storage_at).toBe(INSTANTE)
    expect(depois.purge_provider_at).toBe(INSTANTE)
  })

  test('a chamada continua existindo: duração, custo, classificação e o identificador da conversa ficam', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])

    await rodar(duble)

    const depois = duble.linha(vencida.id)
    expect(depois.duration_sec).toBe(184)
    expect(depois.cost_cents).toBe(37)
    expect(depois.classification).toEqual({ stage: 'qualificado', temperature: 'quente' })
    expect(depois.provider_conversation_id).toBe('conv_0001')
    expect(depois.status).toBe('ended')
  })

  test('recording_expires_at fica preenchida, que é por onde call-audio responde "expurgada"', async () => {
    const vencida = chamada(1)
    const semData = chamada(2, { recording_expires_at: null })
    const prazoEncurtado = chamada(3, { recording_expires_at: em(AGORA + 200 * DIA) })
    const semGravacao = chamada(4, { recording_path: null, recording_expires_at: null })
    const duble = new Duble([vencida, semData, prazoEncurtado, semGravacao])

    await rodar(duble)

    expect(duble.linha(vencida.id).recording_expires_at).toBe(vencida.recording_expires_at)
    expect(duble.linha(semData.id).recording_expires_at).toBe(INSTANTE)
    expect(duble.linha(prazoEncurtado.id).recording_expires_at).toBe(INSTANTE)
    // Quem nunca teve gravação não passa a ter data de expurgo de gravação.
    expect(duble.linha(semGravacao.id).recording_expires_at).toBeNull()
  })

  test('chamada sem gravação só pede o provedor; sem conversa, só o Storage', async () => {
    const soTranscricao = chamada(1, { recording_path: null, recording_expires_at: null })
    const soArquivo = chamada(2, { provider_conversation_id: null })
    const duble = new Duble([soTranscricao, soArquivo])

    await rodar(duble)

    expect(duble.remocoesNoStorage).toEqual([soArquivo.recording_path])
    expect(duble.remocoesNoProvedor).toEqual([{ conta: CONTA_A, conversa: 'conv_0001' }])
    expect(duble.linha(soTranscricao.id).content_purged_at).toBe(INSTANTE)
    expect(duble.linha(soArquivo.id).content_purged_at).toBe(INSTANTE)
  })

  test('o pedido ao provedor vira rastro com o call_id e sem nada da conversa', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])

    await rodar(duble)

    expect(duble.rastros).toEqual([
      {
        account_id: CONTA_A,
        direction: 'outbound',
        provider: 'voz',
        endpoint: caminhoDaConversa('conv_0001'),
        request: { metodo: 'DELETE', motivo: 'expurgo' },
        response: { expurgo: 'confirmado' },
        status_code: 204,
        latency_ms: 80,
        correlation_id: vencida.id,
      },
    ])
    expect(JSON.stringify(duble.rastros)).not.toContain('Sarah')
  })
})

describe('a marca só depois do 2xx dos dois lados', () => {
  test('provedor que recusa não marca: o conteúdo fica, a tentativa soma e o Storage confirmado fica anotado', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])
    duble.provedor.set('conv_0001', [{ status_code: 503, latency_ms: 40 }])

    const { resultado } = await rodar(duble)

    expect(resultado.ok).toBe(true)
    expect(duble.conclusoes).toEqual([])
    const depois = duble.linha(vencida.id)
    expect(depois.content_purged_at).toBeNull()
    expect(depois.recording_path).toBe(vencida.recording_path)
    expect(depois.transcript).toEqual(TRANSCRICAO)
    expect(depois.purge_storage_at).toBe(INSTANTE)
    expect(depois.purge_provider_at).toBeNull()
    expect(depois.purge_attempts).toBe(1)
    expect(depois.purge_note).toBe('provedor de voz respondeu 503')
  })

  test('Storage que recusa não marca, e o provedor confirmado fica anotado', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])
    duble.storage.set(vencida.recording_path!, [{ ok: false, razao: 'bucket indisponível' }])

    await rodar(duble)

    const depois = duble.linha(vencida.id)
    expect(depois.content_purged_at).toBeNull()
    expect(depois.recording_path).toBe(vencida.recording_path)
    expect(depois.purge_provider_at).toBe(INSTANTE)
    expect(depois.purge_storage_at).toBeNull()
    expect(depois.purge_note).toBe('Storage recusou a remoção: bucket indisponível')
  })

  test('o item volta na execução seguinte e só o lado que faltou é pedido', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])
    duble.provedor.set('conv_0001', [{ status_code: 500, latency_ms: 40 }, { status_code: 200, latency_ms: 40 }])

    await rodar(duble)
    const amanha = AGORA + DIA
    await rodar(duble, amanha)

    expect(duble.remocoesNoStorage).toEqual([vencida.recording_path])
    expect(duble.remocoesNoProvedor).toHaveLength(2)
    const depois = duble.linha(vencida.id)
    expect(depois.content_purged_at).toBe(em(amanha))
    expect(depois.purge_storage_at).toBe(INSTANTE)
    expect(depois.purge_provider_at).toBe(em(amanha))
    expect(depois.recording_path).toBeNull()
    expect(depois.purge_note).toBeNull()
  })

  test('404 do provedor não é confirmação: a conversa pode estar sob outra credencial', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])
    duble.provedor.set('conv_0001', [{ status_code: 404, latency_ms: 40 }])

    await rodar(duble)

    expect(provedorConfirmou({ status_code: 404, latency_ms: 0 })).toBe(false)
    expect(duble.linha(vencida.id).content_purged_at).toBeNull()
    expect(duble.linha(vencida.id).purge_note).toMatch(/404/)
  })

  test.each([
    ['204', 204, true],
    ['200', 200, true],
    ['301', 301, false],
    ['401', 401, false],
    ['500', 500, false],
  ])('provedor respondendo %s confirma? %s', (_nome, status, confirma) => {
    expect(provedorConfirmou({ status_code: status, latency_ms: 0 })).toBe(confirma)
  })

  test('sem credencial não há pedido nem rastro, e a chamada não é marcada', async () => {
    const vencida = chamada(1)
    const duble = new Duble([vencida])
    duble.provedor.set('conv_0001', [null])

    await rodar(duble)

    expect(duble.rastros).toEqual([])
    expect(duble.linha(vencida.id).content_purged_at).toBeNull()
    expect(duble.linha(vencida.id).purge_note).toBe('credencial do provedor de voz indisponível')
  })

  test('provedor que lança e Storage que lança são falha, não derrubam a passagem', async () => {
    const primeira = chamada(1)
    const segunda = chamada(2)
    const duble = new Duble([primeira, segunda])
    duble.provedor.set('conv_0001', ['lança'])
    duble.storage.set(segunda.recording_path!, ['lança'])

    const { resultado } = await rodar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 2 })
    expect(duble.linha(primeira.id).content_purged_at).toBeNull()
    expect(duble.linha(primeira.id).purge_note).toBe('provedor de voz sem resposta')
    expect(duble.linha(segunda.id).content_purged_at).toBeNull()
    expect(duble.linha(segunda.id).purge_note).toBe('Storage recusou a remoção: conexão recusada')
  })
})

describe('a idempotência', () => {
  test('a segunda passagem do mesmo dia não chama o Storage nem o provedor', async () => {
    const duble = new Duble([chamada(1), chamada(2), chamada(3, { recording_path: null })])

    await rodar(duble)
    const storageNaPrimeira = duble.remocoesNoStorage.length
    const provedorNaPrimeira = duble.remocoesNoProvedor.length
    expect(storageNaPrimeira).toBe(2)
    expect(provedorNaPrimeira).toBe(3)

    const { resultado } = await rodar(duble, AGORA + 60 * 60_000)

    expect(resultado).toMatchObject({ ok: true, itens: 0 })
    expect(duble.remocoesNoStorage).toHaveLength(storageNaPrimeira)
    expect(duble.remocoesNoProvedor).toHaveLength(provedorNaPrimeira)
    expect(duble.conclusoes).toHaveLength(3)
  })
})

describe('o prazo', () => {
  test('a chamada de 89 dias fica e a de 91 sai, com o padrão de 90', async () => {
    const dentro = chamada(1, { ended_at: em(AGORA - 89 * DIA) })
    const fora = chamada(2, { ended_at: em(AGORA - 91 * DIA) })
    const duble = new Duble([dentro, fora])

    await rodar(duble)

    expect(duble.linha(dentro.id).content_purged_at).toBeNull()
    expect(duble.linha(dentro.id).transcript).toEqual(TRANSCRICAO)
    expect(duble.linha(fora.id).content_purged_at).toBe(INSTANTE)
    expect(duble.remocoesNoStorage).toEqual([fora.recording_path])
  })

  test('o prazo é o da conta: com 30 dias, a de 31 sai', async () => {
    const trintaEUm = chamada(1, { account_id: CONTA_B, ended_at: em(AGORA - 31 * DIA) })
    const duble = new Duble([trintaEUm])
    duble.retencao.set(CONTA_B, 30)

    await rodar(duble)

    expect(duble.linha(trintaEUm.id).content_purged_at).toBe(INSTANTE)
  })

  test('chamada em curso nunca é expurgada, por mais antiga que seja', async () => {
    const tocando = chamada(1, { status: 'ringing', ended_at: null })
    const naFila = chamada(2, { status: 'queued', ended_at: null })
    const duble = new Duble([tocando, naFila])

    await rodar(duble)

    expect(duble.remocoesNoStorage).toEqual([])
    expect(duble.remocoesNoProvedor).toEqual([])
    expect(duble.conclusoes).toEqual([])
  })
})

describe('o registro em job_runs', () => {
  test('uma linha por conta com a contagem das chamadas expurgadas, sem contar as que falharam', async () => {
    const duble = new Duble([
      chamada(1),
      chamada(2),
      chamada(3),
      chamada(4, { account_id: CONTA_B }),
      chamada(5, { account_id: CONTA_B }),
    ])
    duble.provedor.set('conv_0005', [{ status_code: 500, latency_ms: 40 }])

    const { resultado, fins } = await rodar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 5 })
    expect(fins).toEqual([expect.objectContaining({ items: 5, error: null })])
    expect(duble.linhasDaConta).toEqual([
      { routine: NOME_DA_ROTINA, account_id: CONTA_A, started_at: INSTANTE, finished_at: INSTANTE, items: 3, error: null },
      { routine: NOME_DA_ROTINA, account_id: CONTA_B, started_at: INSTANTE, finished_at: INSTANTE, items: 1, error: null },
    ])
  })

  test('passagem que não expurgou nada não escreve linha de conta', async () => {
    const duble = new Duble([chamada(1, { ended_at: em(AGORA - 10 * DIA) })])

    await rodar(duble)

    expect(duble.linhasDaConta).toEqual([])
  })

  test('com a execução em erro, o que foi expurgado antes do erro ainda é contado', async () => {
    const primeira = chamada(1)
    const segunda = chamada(2)
    const duble = new Duble([primeira, segunda])
    duble.concluirFalhaEm = segunda.id

    const { resultado, fins } = await rodar(duble)

    expect(resultado).toMatchObject({ ok: false, itens: 1, erro: 'banco fora do ar' })
    expect(fins[0]?.error).toBe('banco fora do ar')
    expect(duble.linhasDaConta).toEqual([expect.objectContaining({ account_id: CONTA_A, items: 1, error: null })])
  })
})

describe('a desistência', () => {
  test(`na ${LIMITE_DE_FALHAS}ª falha a chamada sai da fila com a razão, e a sexta passagem não a pede`, async () => {
    const teimosa = chamada(1)
    const duble = new Duble([teimosa])
    duble.provedor.set('conv_0001', [{ status_code: 500, latency_ms: 40 }])

    for (let dia = 0; dia < LIMITE_DE_FALHAS - 1; dia += 1) {
      await rodar(duble, AGORA + dia * DIA)
      expect(duble.linha(teimosa.id).purge_gave_up_at).toBeNull()
    }
    expect(duble.linhasDaConta).toEqual([])

    const quintoDia = AGORA + (LIMITE_DE_FALHAS - 1) * DIA
    await rodar(duble, quintoDia)

    const depois = duble.linha(teimosa.id)
    expect(depois.purge_attempts).toBe(LIMITE_DE_FALHAS)
    expect(depois.purge_gave_up_at).toBe(em(quintoDia))
    expect(depois.content_purged_at).toBeNull()
    expect(duble.linhasDaConta).toEqual([
      {
        routine: NOME_DA_ROTINA,
        account_id: CONTA_A,
        started_at: em(quintoDia),
        finished_at: em(quintoDia),
        items: 1,
        error: expect.stringContaining('provedor de voz respondeu 500'),
      },
    ])
    expect(duble.linhasDaConta[0]!.error).toContain(teimosa.id)
    expect(duble.linhasDaConta[0]!.error).toMatch(/apuração manual/)

    const pedidosAntes = duble.remocoesNoProvedor.length
    await rodar(duble, quintoDia + DIA)
    expect(duble.remocoesNoProvedor).toHaveLength(pedidosAntes)
  })

  test('o Storage confirmado na primeira passagem não é pedido nas quatro seguintes', async () => {
    const teimosa = chamada(1)
    const duble = new Duble([teimosa])
    duble.provedor.set('conv_0001', [{ status_code: 500, latency_ms: 40 }])

    for (let dia = 0; dia < LIMITE_DE_FALHAS; dia += 1) await rodar(duble, AGORA + dia * DIA)

    expect(duble.remocoesNoStorage).toEqual([teimosa.recording_path])
    expect(duble.remocoesNoProvedor).toHaveLength(LIMITE_DE_FALHAS)
  })
})

describe('o portão', () => {
  function portaEspiada(): { porta: PortaDoExpurgo; tocados: string[] } {
    const tocados: string[] = []
    const porta = new Proxy({} as PortaDoExpurgo, {
      get(_alvo, nome) {
        tocados.push(String(nome))
        return async () => []
      },
    })
    return { porta, tocados }
  }

  test.each([
    ['sem cabeçalho', null],
    ['com segredo errado', 'outro-segredo'],
  ])('%s responde 401 sem tocar em porta nenhuma', async (_nome, segredo) => {
    const { porta, tocados } = portaEspiada()
    const execucao = new Proxy({} as PortaDeExecucao, {
      get(_alvo, nome) {
        tocados.push(String(nome))
        return async () => 'x'
      },
    })

    const resposta = await atenderRotina({ metodo: 'POST', segredo }, { porta, execucao }, { segredoInterno: SEGREDO })

    expect(resposta.status).toBe(401)
    expect(tocados).toEqual([])
  })

  test('instalação sem segredo fecha o portão, mesmo com cabeçalho vazio', async () => {
    const { porta, tocados } = portaEspiada()
    const { porta: execucao } = portaDeExecucao()

    const resposta = await atenderRotina({ metodo: 'POST', segredo: '' }, { porta, execucao }, { segredoInterno: '' })

    expect(resposta.status).toBe(401)
    expect(tocados).toEqual([])
  })

  test('GET é 405', async () => {
    const { porta } = portaEspiada()
    const { porta: execucao } = portaDeExecucao()
    const resposta = await atenderRotina({ metodo: 'GET', segredo: SEGREDO }, { porta, execucao }, { segredoInterno: SEGREDO })
    expect(resposta.status).toBe(405)
  })

  test('com o segredo certo a passagem roda e responde 200', async () => {
    const duble = new Duble([chamada(1)])
    const { porta: execucao } = portaDeExecucao()

    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: SEGREDO },
      { porta: duble.porta, execucao, agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )

    expect(resposta).toMatchObject({ status: 200, corpo: { ok: true, itens: 1 } })
  })
})
