// tool-dnc sobre o esqueleto, com as portas dubladas em memória: pedido comum,
// pessoa errada, pedido repetido, ensaio, conversa inexistente e falha da porta
// virando frase de contorno.
//
// O dublê da escrita guarda o bloqueio com a mesma regra do único parcial de
// `dnc_entries` (um ativo por conta e número), para "pedido repetido não cria
// segunda linha" ser asserção sobre o estado e não sobre quantas vezes um
// método foi chamado. O banco de verdade está em
// `testes/banco/bloqueio-pela-ferramenta.test.ts`.

import { describe, expect, test } from 'vitest'

import { DESCRICOES_DAS_FERRAMENTAS } from '../_shared/agente/compilador.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import { FALAS_DAS_REGRAS_TRAVADAS } from '../_shared/speech/regras-travadas.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import {
  MOTIVO_GRAVADO,
  criarToolDnc,
  notasDoPedido,
  numeroDoInterlocutor,
  origemDoMotivo,
  type EscritaDoDnc,
  type ItemDeBloqueioNaFila,
  type LeituraDoDnc,
  type NumerosDaChamada,
  type PedidoDeBloqueio,
} from './bloqueio.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const CONVERSA = 'conv_vexo_marcos_01'
const CHAVE = 'chave-do-servidor-de-teste'
const INICIO = Date.UTC(2026, 8, 24, 14, 0, 0)
const TELEFONE_DO_LEAD = '+5511988887777'
const TELEFONE_DISCADO = '+5511988886666'
const QUEM_LIGOU = '+5521977775555'

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

const NUMEROS: NumerosDaChamada = { de: '+5511333322221', para: TELEFONE_DISCADO, doLead: TELEFONE_DO_LEAD }

interface Bloqueio extends PedidoDeBloqueio {
  readonly criadoEm: string
}

interface Cenario {
  readonly bloqueios: Bloqueio[]
  readonly itens: ItemDeBloqueioNaFila[]
  readonly registros: InvocacaoParaRegistro[]
  readonly leituras: string[]
  relogio: number
}

function montar(opcoes: {
  chamada?: ChamadaDaFerramenta
  numeros?: NumerosDaChamada
  leituraFalha?: boolean
  escritaFalha?: 'bloquear' | 'item'
  bloqueiosIniciais?: Bloqueio[]
} = {}) {
  const chamada = opcoes.chamada ?? CHAMADA
  const cenario: Cenario = {
    bloqueios: [...(opcoes.bloqueiosIniciais ?? [])],
    itens: [],
    registros: [],
    leituras: [],
    relogio: INICIO,
  }

  const leitura: LeituraDoDnc = {
    async numerosDaChamada(contaId, chamadaId) {
      cenario.leituras.push('numerosDaChamada')
      if (opcoes.leituraFalha) throw new Error('banco indisponível')
      expect([contaId, chamadaId]).toEqual([CONTA, chamada.id])
      return opcoes.numeros ?? NUMEROS
    },
    async bloqueioVigente(contaId, telefone) {
      cenario.leituras.push('bloqueioVigente')
      const achado = cenario.bloqueios.find((b) => b.contaId === contaId && b.telefone === telefone)
      return achado?.criadoEm ?? null
    },
  }

  const escrita: EscritaDoDnc = {
    async bloquear(pedido) {
      if (opcoes.escritaFalha === 'bloquear') throw new Error('conexão recusada')
      const vigente = cenario.bloqueios.find((b) => b.contaId === pedido.contaId && b.telefone === pedido.telefone)
      if (vigente) return { blockedAt: vigente.criadoEm, criado: false }
      cenario.bloqueios.push({ ...pedido, criadoEm: pedido.instante })
      return { blockedAt: pedido.instante, criado: true }
    },
    async abrirItemNaFila(item) {
      if (opcoes.escritaFalha === 'item') throw new Error('conexão recusada')
      cenario.itens.push(item)
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDoDnc> = {
    escrita,
    chaves: { vigente: CHAVE },
    agora: () => cenario.relogio,
    esperar: () => new Promise<void>(() => undefined),
    log: () => undefined,
    porta: {
      async contasCandidatas() {
        return [CONTA]
      },
      async chamadaDaConversa(contaId, conversaId) {
        return conversaId === CONVERSA && contaId === chamada.account_id ? chamada : null
      },
      async registrarInvocacao(invocacao) {
        cenario.registros.push(invocacao)
      },
    },
  }

  const tratar = criarToolDnc(leitura)
  const chamar = async (corpo: unknown, conversa = CONVERSA): Promise<RespostaDaFerramenta> =>
    tratar(
      { metodo: 'POST', segredo: await derivarSegredo(CHAVE, CONTA), conversa, corpo },
      ambiente,
    )
  return { cenario, chamar }
}

describe('o pedido do interlocutor', () => {
  test('grava o bloqueio durante a chamada e devolve blocked_at', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.data).toEqual({ blocked_at: new Date(INICIO).toISOString() })
    expect(cenario.bloqueios).toEqual([
      {
        contaId: CONTA,
        telefone: TELEFONE_DISCADO,
        origem: 'lead_request',
        motivo: MOTIVO_GRAVADO.lead_request,
        notas: null,
        instante: new Date(INICIO).toISOString(),
        criadoEm: new Date(INICIO).toISOString(),
      },
    ])
  })

  test('a fala é a despedida da regra de não perturbe, e não promete encerrar', async () => {
    const { chamar } = montar()

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.corpo.speech).toBe(FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe.at(-1))
    expect(resposta.corpo.speech).not.toMatch(/encerr|deslig|finaliz/i)
  })

  test('abre um item dnc_requested de severidade baixa com o recorte e o call_id', async () => {
    const { cenario, chamar } = montar()

    await chamar({ reason: 'lead_request', notes: 'disse que já tem fornecedor e não quer mais ligação' })

    expect(cenario.itens).toEqual([
      {
        contaId: CONTA,
        chamadaId: CHAMADA_ID,
        leadId: LEAD,
        contexto: {
          call_id: CHAMADA_ID,
          origem: 'lead_request',
          recorte: 'disse que já tem fornecedor e não quer mais ligação',
          blocked_at: new Date(INICIO).toISOString(),
        },
      },
    ])
  })

  test('o motivo dito na conversa vai para notes, e reason livre conta como pedido', async () => {
    const { cenario, chamar } = montar()

    await chamar({ reason: 'pediu para não receber ligação' })

    expect(cenario.bloqueios[0]).toMatchObject({
      origem: 'lead_request',
      notas: 'pediu para não receber ligação',
    })
  })

  test('registra a invocação com a resposta e sem erro', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'lead_request' })

    expect(cenario.registros).toHaveLength(1)
    expect(cenario.registros[0]).toMatchObject({
      tool: 'tool-dnc',
      call_id: CHAMADA_ID,
      error: null,
      request: { reason: 'lead_request' },
      response: { ...resposta.corpo },
    })
  })
})

describe('a pessoa errada', () => {
  test('grava com source wrong_number e devolve a despedida de pessoa errada', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'wrong_number', notes: 'atendeu a filha, o Marcos não mora mais ali' })

    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.speech).toBe(FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada.at(-1))
    expect(cenario.bloqueios[0]).toMatchObject({
      origem: 'wrong_number',
      motivo: MOTIVO_GRAVADO.wrong_number,
      notas: 'atendeu a filha, o Marcos não mora mais ali',
    })
    expect(cenario.itens[0]!.contexto).toMatchObject({ origem: 'wrong_number' })
  })
})

describe('o pedido repetido na mesma chamada', () => {
  test('devolve o blocked_at do bloqueio vigente, sem segunda linha nem segundo item', async () => {
    const { cenario, chamar } = montar()

    const primeira = await chamar({ reason: 'lead_request' })
    cenario.relogio = INICIO + 90_000
    const segunda = await chamar({ reason: 'lead_request' })

    expect(segunda.corpo.ok).toBe(true)
    expect(segunda.corpo.data).toEqual(primeira.corpo.data)
    expect(segunda.corpo.speech).toBe(primeira.corpo.speech)
    expect(cenario.bloqueios).toHaveLength(1)
    expect(cenario.itens).toHaveLength(1)
    expect(cenario.registros.map((r) => r.error)).toEqual([null, null])
  })

  test('bloqueio anterior à chamada responde o instante dele e não abre item', async () => {
    const antigo = '2026-08-01T10:00:00.000Z'
    const { cenario, chamar } = montar({
      bloqueiosIniciais: [
        {
          contaId: CONTA,
          telefone: TELEFONE_DISCADO,
          origem: 'lead_request',
          motivo: 'manual',
          notas: null,
          instante: antigo,
          criadoEm: antigo,
        },
      ],
    })

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.corpo.data).toEqual({ blocked_at: antigo })
    expect(cenario.bloqueios).toHaveLength(1)
    expect(cenario.itens).toHaveLength(0)
  })
})

describe('o ensaio', () => {
  const ENSAIO: ChamadaDaFerramenta = { ...CHAMADA, direction: 'rehearsal' }

  test('lê de verdade e não escreve: nem bloqueio nem item', async () => {
    const { cenario, chamar } = montar({ chamada: ENSAIO })

    await chamar({ reason: 'lead_request' })

    expect(cenario.leituras).toEqual(['numerosDaChamada', 'bloqueioVigente'])
    expect(cenario.bloqueios).toHaveLength(0)
    expect(cenario.itens).toHaveLength(0)
  })

  test('responde exatamente o que a chamada real responderia', async () => {
    const real = await montar().chamar({ reason: 'wrong_number' })
    const ensaio = await montar({ chamada: ENSAIO }).chamar({ reason: 'wrong_number' })

    expect(ensaio).toEqual(real)
  })
})

describe('o que não é a ligação conversando', () => {
  test('conversa inexistente é 404, sem leitura nem escrita', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'lead_request' }, 'conversa_de_ninguem')

    expect(resposta.status).toBe(404)
    expect(cenario.leituras).toHaveLength(0)
    expect(cenario.bloqueios).toHaveLength(0)
    expect(cenario.registros).toHaveLength(0)
  })

  test('sem reason é 400 com o campo nomeado', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({})

    expect(resposta.status).toBe(400)
    expect(resposta.corpo.data).toEqual({ campo: 'motivo', chave: 'reason' })
    expect(cenario.bloqueios).toHaveLength(0)
  })
})

describe('a falha da porta', () => {
  test('leitura que falha vira a frase de contorno, com o erro registrado', async () => {
    const { cenario, chamar } = montar({ leituraFalha: true })

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(cenario.registros[0]!.error).toMatch(/^falha_do_executor: banco indisponível/)
    expect(cenario.bloqueios).toHaveLength(0)
  })

  test('escrita do bloqueio que falha vira a frase de contorno e não abre item', async () => {
    const { cenario, chamar } = montar({ escritaFalha: 'bloquear' })

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(cenario.registros[0]!.error).toMatch(/^falha_do_efeito: conexão recusada/)
    expect(cenario.itens).toHaveLength(0)
  })

  test('item que falha também fica registrado como falha, com o bloqueio já gravado', async () => {
    const { cenario, chamar } = montar({ escritaFalha: 'item' })

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.corpo.ok).toBe(false)
    expect(cenario.bloqueios).toHaveLength(1)
    expect(cenario.registros[0]!.error).toMatch(/^falha_do_efeito/)
  })
})

describe('sem número conhecido', () => {
  test('responde a despedida com ok false e abre o item para alguém do time', async () => {
    const { cenario, chamar } = montar({ numeros: { de: null, para: null, doLead: null } })

    const resposta = await chamar({ reason: 'lead_request' })

    expect(resposta.corpo).toEqual({
      ok: false,
      data: { blocked_at: null },
      speech: FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe.at(-1),
    })
    expect(cenario.registros[0]!.error).toBe('numero_desconhecido')
    expect(cenario.bloqueios).toHaveLength(0)
    expect(cenario.itens).toHaveLength(1)
    expect(cenario.itens[0]!.contexto).toMatchObject({ blocked_at: null })
  })
})

describe('as decisões puras', () => {
  test.each([
    ['wrong_number', 'wrong_number'],
    [' WRONG_NUMBER ', 'wrong_number'],
    ['lead_request', 'lead_request'],
    ['não quer mais ligação', 'lead_request'],
    [undefined, 'lead_request'],
  ] as const)('o reason %j vira a origem %s', (reason, origem) => {
    expect(origemDoMotivo(reason)).toBe(origem)
  })

  test('o código sozinho não vira nota; o texto livre e o notes viram', () => {
    expect(notasDoPedido({ reason: 'lead_request' })).toBeNull()
    expect(notasDoPedido({ reason: 'wrong_number', notes: '  ' })).toBeNull()
    expect(notasDoPedido({ reason: 'lead_request', notes: 'mudou de empresa' })).toBe('mudou de empresa')
    expect(notasDoPedido({ reason: 'chega de ligação', notes: 'irritado' })).toBe('chega de ligação | irritado')
    expect(notasDoPedido({ reason: 'chega', notes: 'chega' })).toBe('chega')
  })

  test('na recebida o número é o de quem ligou; na feita e no ensaio, o discado', () => {
    const numeros = { de: QUEM_LIGOU, para: TELEFONE_DISCADO, doLead: TELEFONE_DO_LEAD }
    expect(numeroDoInterlocutor({ direction: 'inbound' }, numeros)).toBe(QUEM_LIGOU)
    expect(numeroDoInterlocutor({ direction: 'outbound' }, numeros)).toBe(TELEFONE_DISCADO)
    expect(numeroDoInterlocutor({ direction: 'rehearsal' }, numeros)).toBe(TELEFONE_DISCADO)
  })

  test('sem o número da chamada, vale o do lead', () => {
    expect(numeroDoInterlocutor({ direction: 'outbound' }, { de: null, para: null, doLead: TELEFONE_DO_LEAD })).toBe(
      TELEFONE_DO_LEAD,
    )
    expect(numeroDoInterlocutor({ direction: 'inbound' }, { de: '', para: null, doLead: null })).toBeNull()
  })
})

describe('o corpo declarado na publicação (US-106)', () => {
  // `agent-publish` declara ao provedor os campos de DESCRICOES_DAS_FERRAMENTAS.
  // Obrigatório lá que a ferramenta não cobra aqui (ou o contrário) faz o
  // modelo mandar um pedido que ela recusa com 400 em toda chamada.
  const obrigatorios = (DESCRICOES_DAS_FERRAMENTAS.get('tool-dnc')?.campos ?? [])
    .filter((campo) => campo.obrigatorio)
    .map((campo) => campo.chave)

  test('declara ao menos um obrigatório', () => {
    expect(obrigatorios.length).toBeGreaterThan(0)
  })

  test.each(obrigatorios)('sem %s a ferramenta responde 400', async (chave) => {
    const { chamar } = montar()
    const corpo: Record<string, unknown> = { ...{ reason: 'lead_request' } }
    delete corpo[chave]

    expect((await chamar(corpo)).status).toBe(400)
  })

  test('só com os obrigatórios a ferramenta não responde 400', async () => {
    const { chamar } = montar()
    const corpo = Object.fromEntries(Object.entries({ reason: 'lead_request' }).filter(([chave]) => obrigatorios.includes(chave)))

    expect((await chamar(corpo)).status).toBe(200)
  })
})
