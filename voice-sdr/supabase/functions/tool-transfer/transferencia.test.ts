// tool-transfer sobre o esqueleto, com as portas dubladas em memória: com
// destino, sem destino, destino inválido, urgência alta, ensaio e falha da
// porta virando frase de contorno.

import { describe, expect, test } from 'vitest'

import { DESCRICOES_DAS_FERRAMENTAS, DESTINO_DA_TRANSFERENCIA } from '../_shared/agente/compilador.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import { FALAS_DA_TRANSFERENCIA } from '../_shared/speech/transferencia.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import {
  criarToolTransfer,
  destinoDaTransferencia,
  recorteDoPedido,
  urgenciaDoPedido,
  type EscritaDaTransferencia,
  type ItemDeTransferenciaNaFila,
  type LeituraDaTransferencia,
} from './transferencia.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const CONVERSA = 'conv_vexo_marcos_02'
const CHAVE = 'chave-do-servidor-de-teste'
const DESTINO_GRAVADO = '(11) 3322-4455'
const DESTINO_E164 = '+551133224455'

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

/** O que uma resposta diria se afirmasse a transferência já feita. */
const TRANSFERENCIA_FEITA = /transferi|transferid|te passei|já (te )?(passo|coloquei|conectei)|conectad|já está com|já tá com/i

/** Prazo que nada no sistema cumpre. */
const PRAZO = /\d|minuto|hora|hoje|amanhã|já já|logo mais|em breve|daqui a pouco/i

interface Cenario {
  readonly itens: ItemDeTransferenciaNaFila[]
  readonly registros: InvocacaoParaRegistro[]
  readonly leituras: string[]
}

function montar(
  opcoes: {
    chamada?: ChamadaDaFerramenta
    destino?: string | null
    leituraFalha?: boolean
    escritaFalha?: boolean
  } = {},
) {
  const chamada = opcoes.chamada ?? CHAMADA
  const cenario: Cenario = { itens: [], registros: [], leituras: [] }

  const leitura: LeituraDaTransferencia = {
    async destinoDaConta(contaId) {
      cenario.leituras.push('destinoDaConta')
      if (opcoes.leituraFalha) throw new Error('banco indisponível')
      expect(contaId).toBe(CONTA)
      return opcoes.destino === undefined ? DESTINO_GRAVADO : opcoes.destino
    },
  }

  const escrita: EscritaDaTransferencia = {
    async abrirItemNaFila(item) {
      if (opcoes.escritaFalha) throw new Error('conexão recusada')
      cenario.itens.push(item)
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDaTransferencia> = {
    escrita,
    chaves: { vigente: CHAVE },
    agora: () => Date.UTC(2026, 8, 24, 14, 0, 0),
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

  const tratar = criarToolTransfer(leitura)
  const chamar = async (corpo: unknown, conversa = CONVERSA): Promise<RespostaDaFerramenta> =>
    tratar({ metodo: 'POST', segredo: await derivarSegredo(CHAVE, CONTA), conversa, corpo }, ambiente)
  return { cenario, chamar }
}

describe('com destino configurado', () => {
  test('devolve o número de destino em E.164 e não abre item', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'quer falar com o comercial', urgency: 'normal' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { transfer_number: DESTINO_E164, queued: false },
      speech: FALAS_DA_TRANSFERENCIA.emCurso,
    })
    expect(cenario.itens).toHaveLength(0)
  })

  test('registra a invocação com a resposta e sem erro', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'quer falar com o comercial' })

    expect(cenario.registros).toHaveLength(1)
    expect(cenario.registros[0]).toMatchObject({
      tool: 'tool-transfer',
      call_id: CHAMADA_ID,
      error: null,
      response: { ...resposta.corpo },
    })
  })
})

describe('sem destino configurado', () => {
  test('responde queued com a fala do retorno', async () => {
    const { chamar } = montar({ destino: null })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    expect(resposta.corpo).toEqual({
      ok: true,
      data: { transfer_number: null, queued: true },
      speech: FALAS_DA_TRANSFERENCIA.retorno,
    })
  })

  test('abre item human_requested com o recorte, o call_id e a pendência de configuração', async () => {
    const { cenario, chamar } = montar({ destino: null })

    await chamar({ reason: 'quer falar com uma pessoa', notes: 'reclamou de cobrança duplicada' })

    expect(cenario.itens).toEqual([
      {
        contaId: CONTA,
        chamadaId: CHAMADA_ID,
        leadId: LEAD,
        contexto: {
          call_id: CHAMADA_ID,
          recorte: 'quer falar com uma pessoa | reclamou de cobrança duplicada',
          urgencia: 'normal',
          pendencia: 'destino_ausente',
        },
      },
    ])
  })

  test('a mensagem de configuração fica na fila e não na conversa', async () => {
    const { chamar } = montar({ destino: null })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    const serializado = JSON.stringify(resposta.corpo)
    expect(serializado).not.toMatch(/destino_ausente|pendencia|configur|transfer_target/i)
  })

  test('destino gravado que não é telefone vira queued com pendência própria', async () => {
    const { cenario, chamar } = montar({ destino: 'ramal do João' })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    expect(resposta.corpo.data).toEqual({ transfer_number: null, queued: true })
    expect(cenario.itens[0]!.contexto).toMatchObject({ pendencia: 'destino_invalido' })
  })
})

describe('a urgência', () => {
  test('urgência alta vai para o contexto do item e não muda a resposta', async () => {
    const normal = montar({ destino: null })
    const alta = montar({ destino: null })

    const respostaNormal = await normal.chamar({ reason: 'tema jurídico', urgency: 'normal' })
    const respostaAlta = await alta.chamar({ reason: 'tema jurídico', urgency: 'high' })

    expect(respostaAlta.corpo).toEqual(respostaNormal.corpo)
    expect(alta.cenario.itens[0]!.contexto).toMatchObject({ urgencia: 'alta' })
    expect(normal.cenario.itens[0]!.contexto).toMatchObject({ urgencia: 'normal' })
  })

  test('com destino, urgência alta transfere do mesmo jeito', async () => {
    const { cenario, chamar } = montar()

    const resposta = await chamar({ reason: 'tema jurídico', urgency: 'alta' })

    expect(resposta.corpo.data).toEqual({ transfer_number: DESTINO_E164, queued: false })
    expect(cenario.itens).toHaveLength(0)
  })
})

describe('as falas', () => {
  test.each([
    ['com destino', DESTINO_GRAVADO],
    ['sem destino', null],
  ] as const)('%s: a resposta nunca afirma que a transferência já aconteceu', async (_caso, destino) => {
    const { chamar } = montar({ destino })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    expect(resposta.corpo.speech).not.toMatch(TRANSFERENCIA_FEITA)
    expect(JSON.stringify(resposta.corpo.data)).not.toMatch(/transferred|done|completed/i)
  })

  test('são duas falas distintas, sem prazo, sem travessão e soando faladas', () => {
    const { emCurso, retorno } = FALAS_DA_TRANSFERENCIA
    expect(emCurso).not.toBe(retorno)
    for (const fala of [emCurso, retorno]) {
      expect(fala).not.toMatch(PRAZO)
      expect(fala).not.toMatch(/[—–]/)
      expect(fala).not.toMatch(TRANSFERENCIA_FEITA)
      expect(fala).toMatch(/(?<![\p{L}\d])(pra|tá|te|viu)(?![\p{L}\d])/iu)
    }
  })

  test('o crivo de transferência feita pega as frases que a regra proíbe', () => {
    for (const frase of ['Pronto, te transferi.', 'Já te passei pro time.', 'Você já está com o comercial.']) {
      expect(frase).toMatch(TRANSFERENCIA_FEITA)
    }
  })
})

describe('o ensaio', () => {
  const ENSAIO: ChamadaDaFerramenta = { ...CHAMADA, direction: 'rehearsal' }

  test('lê de verdade e não abre item na fila', async () => {
    const { cenario, chamar } = montar({ chamada: ENSAIO, destino: null })

    await chamar({ reason: 'quer falar com uma pessoa' })

    expect(cenario.leituras).toEqual(['destinoDaConta'])
    expect(cenario.itens).toHaveLength(0)
  })

  test.each([
    ['com destino', DESTINO_GRAVADO],
    ['sem destino', null],
  ] as const)('%s: responde exatamente o que a chamada real responderia', async (_caso, destino) => {
    const real = await montar({ destino }).chamar({ reason: 'quer falar com uma pessoa' })
    const ensaio = await montar({ chamada: ENSAIO, destino }).chamar({ reason: 'quer falar com uma pessoa' })

    expect(ensaio).toEqual(real)
  })
})

describe('o que não é a ligação conversando', () => {
  test('conversa inexistente é 404, sem leitura nem escrita', async () => {
    const { cenario, chamar } = montar({ destino: null })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' }, 'conversa_de_ninguem')

    expect(resposta.status).toBe(404)
    expect(cenario.leituras).toHaveLength(0)
    expect(cenario.itens).toHaveLength(0)
  })

  test('sem reason é 400 com o campo nomeado', async () => {
    const { cenario, chamar } = montar({ destino: null })

    const resposta = await chamar({ urgency: 'alta' })

    expect(resposta.status).toBe(400)
    expect(resposta.corpo.data).toEqual({ campo: 'motivo', chave: 'reason' })
    expect(cenario.itens).toHaveLength(0)
  })
})

describe('a falha da porta', () => {
  test('leitura que falha vira a frase de contorno, com o erro registrado', async () => {
    const { cenario, chamar } = montar({ leituraFalha: true })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(cenario.registros[0]!.error).toMatch(/^falha_do_executor: banco indisponível/)
  })

  test('item que falha ao abrir vira a frase de contorno, sem prometer retorno', async () => {
    const { cenario, chamar } = montar({ destino: null, escritaFalha: true })

    const resposta = await chamar({ reason: 'quer falar com uma pessoa' })

    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(cenario.registros[0]!.error).toMatch(/^falha_do_efeito: conexão recusada/)
  })
})

describe('as decisões puras', () => {
  test.each([
    ['alta', 'alta'],
    [' HIGH ', 'alta'],
    ['urgente', 'alta'],
    ['normal', 'normal'],
    ['baixa', 'normal'],
    [undefined, 'normal'],
  ] as const)('a urgência %j vira %s', (urgency, urgencia) => {
    expect(urgenciaDoPedido(urgency)).toBe(urgencia)
  })

  test('o destino se normaliza, e ausente não é o mesmo que inválido', () => {
    expect(destinoDaTransferencia('+55 11 3322-4455')).toEqual({ numero: DESTINO_E164, pendencia: null })
    expect(destinoDaTransferencia(null)).toEqual({ numero: null, pendencia: 'destino_ausente' })
    expect(destinoDaTransferencia('   ')).toEqual({ numero: null, pendencia: 'destino_ausente' })
    expect(destinoDaTransferencia('12')).toEqual({ numero: null, pendencia: 'destino_invalido' })
  })

  test('o recorte junta reason e notes sem repetir', () => {
    expect(recorteDoPedido({})).toBeNull()
    expect(recorteDoPedido({ reason: 'quer gente', notes: 'quer gente' })).toBe('quer gente')
    expect(recorteDoPedido({ reason: ' quer gente ', notes: '  ' })).toBe('quer gente')
  })
})

describe('o corpo declarado na publicação (US-106)', () => {
  // `agent-publish` declara ao provedor os campos de DESCRICOES_DAS_FERRAMENTAS.
  // Obrigatório lá que a ferramenta não cobra aqui (ou o contrário) faz o
  // modelo mandar um pedido que ela recusa com 400 em toda chamada.
  const obrigatorios = (DESCRICOES_DAS_FERRAMENTAS.get('tool-transfer')?.campos ?? [])
    .filter((campo) => campo.obrigatorio)
    .map((campo) => campo.chave)

  test('declara ao menos um obrigatório', () => {
    expect(obrigatorios.length).toBeGreaterThan(0)
  })

  test.each(obrigatorios)('sem %s a ferramenta responde 400', async (chave) => {
    const { chamar } = montar()
    const corpo: Record<string, unknown> = { ...{ reason: 'quer falar com uma pessoa' } }
    delete corpo[chave]

    expect((await chamar(corpo)).status).toBe(400)
  })

  test('só com os obrigatórios a ferramenta não responde 400', async () => {
    const { chamar } = montar()
    const corpo = Object.fromEntries(Object.entries({ reason: 'quer falar com uma pessoa' }).filter(([chave]) => obrigatorios.includes(chave)))

    expect((await chamar(corpo)).status).toBe(200)
  })

  test('o caminho que a publicação lê na resposta é o do número de destino', async () => {
    // `transfer_to_number` lê a variável escrita a partir deste caminho; com o
    // caminho errado, a transferência sairia sem destino.
    const { chamar } = montar()
    const resposta = await chamar({ reason: 'quer falar com o comercial' })

    let valor: unknown = resposta.corpo
    for (const passo of DESTINO_DA_TRANSFERENCIA.campo_da_resposta.split('.')) {
      valor = (valor as Record<string, unknown> | null)?.[passo]
    }
    expect(valor).toBe(DESTINO_E164)
  })
})
