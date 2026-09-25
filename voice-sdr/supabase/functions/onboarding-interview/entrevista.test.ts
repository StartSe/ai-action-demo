// onboarding-interview com a ElevenLabs e o modelo dublados. O que se prova:
// quem pode, que o agente é de uma conversa só (nasce na abertura, morre no
// encerramento, e sai na hora se a sessão falhar), que a transcrição pendente
// é repetida sem apagar o agente, e que a conversa vira sugestões conferidas.

import { describe, expect, it } from 'vitest'

import { falas, falasDaEntrevista, NOME_SEM_ESCOLHA } from '../_shared/speech/entrevista.ts'
import type { VozNaConta } from '../_shared/voz/voz-na-conta.ts'

import {
  ESPERA_POR_RESPOSTA_SEG,
  MINIMO_DE_RESPOSTAS,
  NOME_DO_AGENTE_DA_ENTREVISTA,
  TENTATIVAS_DA_TRANSCRICAO,
  atenderEntrevista,
  montarPedidoDaEntrevista,
  type AgenteDaEntrevista,
  type ConversaLida,
  type PortaDaEntrevista,
  type TurnoDaEntrevista,
} from './entrevista.ts'

const CONVERSA: TurnoDaEntrevista[] = [
  { quem: 'agent', texto: falas.abertura },
  { quem: 'lead', texto: 'Pode sim. A empresa é a Aurora Energia.' },
  { quem: 'agent', texto: 'O que vocês vendem, e para quem?' },
  { quem: 'lead', texto: 'Usinas solares por assinatura para indústrias do Sul.' },
]

const SUGESTOES = {
  etapas: [
    {
      etapa: 'identidade',
      campos: [{ campo: 'oferta', valor: 'Energia solar sem investimento.', porque: 'Tira a objeção de custo.' }],
      perguntas: [],
    },
  ],
}

interface Dublê extends PortaDaEntrevista {
  criados: AgenteDaEntrevista[]
  apagados: string[]
  leituras: number
  mensagens: string[]
  vozesConferidas: { vozId: string; nome: string | null }[]
}

function criarPorta(opcoes: {
  papel?: string | null
  criar?: 'ok' | 'sem_credencial' | 'falha'
  sessao?: 'ok' | 'falha'
  conversas?: (ConversaLida | null)[]
  voz?: VozNaConta | null
  nome?: string | null
} = {}): Dublê {
  const criados: AgenteDaEntrevista[] = []
  const apagados: string[] = []
  const mensagens: string[] = []
  const conversas = [...(opcoes.conversas ?? [{ pronta: true, turnos: CONVERSA }])]
  const porta: Dublê = {
    criados,
    apagados,
    mensagens,
    leituras: 0,
    vozesConferidas: [],
    async usuarioDaSessao() {
      return { id: 'u-1' }
    },
    async papelNaConta() {
      return opcoes.papel === undefined ? 'owner' : opcoes.papel
    },
    async modeloDaConta() {
      return { porta: 'openrouter', modelo: 'anthropic/claude-opus-5', escolhidoPelaConta: false }
    },
    async perguntarAoModelo(pedido) {
      mensagens.push(pedido.mensagem)
      return { ok: true, codigo: null, status: 200, endpoint: 'x', texto: JSON.stringify(SUGESTOES) }
    },
    async registrarEventoDeIntegracao() {},
    async nomeDoAgente() {
      return opcoes.nome ?? null
    },
    async garantirVoz(_conta, vozId, nome) {
      porta.vozesConferidas.push({ vozId, nome })
      return opcoes.voz === undefined ? { estado: 'na_conta', vozId } : opcoes.voz
    },
    async criarAgente(_conta, agente) {
      criados.push(agente)
      if (opcoes.criar === 'sem_credencial') return { ok: false, semCredencial: true }
      if (opcoes.criar === 'falha') return { ok: false, semCredencial: false }
      return { ok: true, valor: 'agente-1' }
    },
    async pedirSessaoAssinada() {
      return opcoes.sessao === 'falha'
        ? { ok: false, semCredencial: false }
        : { ok: true, valor: 'wss://assinada' }
    },
    async lerConversa() {
      porta.leituras += 1
      return conversas.length > 1 ? (conversas.shift() ?? null) : (conversas[0] ?? null)
    },
    async apagarAgente(_conta, agenteId) {
      apagados.push(agenteId)
    },
    async esperar() {},
  }
  return porta
}

const ABRIR = { metodo: 'POST', autorizacao: 'Bearer jwt', contaId: 'c-1', acao: 'abrir' }
const ENCERRAR = { ...ABRIR, acao: 'encerrar', agenteId: 'agente-1', conversaId: 'conv-1' }

describe('abrir', () => {
  it('cria o agente da entrevista e devolve a URL assinada', async () => {
    const porta = criarPorta()
    const resposta = await atenderEntrevista(ABRIR, porta)

    expect(resposta.status).toBe(201)
    expect(resposta.corpo).toEqual({ ok: true, agenteId: 'agente-1', urlAssinada: 'wss://assinada' })
    expect(porta.criados[0]).toMatchObject({
      nome: NOME_DO_AGENTE_DA_ENTREVISTA,
      primeiraFala: falas.abertura,
      esperaPorRespostaSeg: ESPERA_POR_RESPOSTA_SEG,
    })
    // Quem configura pensa e digita: a espera é mais longa que numa ligação.
    expect(ESPERA_POR_RESPOSTA_SEG).toBeGreaterThanOrEqual(20)
    expect(porta.criados[0]?.instrucao).toMatch(/não cobre resposta/)
    // O roteiro proíbe combinar horário: a assistente ainda não tem agenda.
    expect(porta.criados[0]?.instrucao).toMatch(/Não ofereça nem combine horário/)
    expect(porta.apagados).toEqual([])
  })

  it('se a sessão falha, o agente que acabou de nascer é apagado', async () => {
    const porta = criarPorta({ sessao: 'falha' })
    const resposta = await atenderEntrevista(ABRIR, porta)

    expect(resposta.status).toBe(503)
    expect(porta.apagados).toEqual(['agente-1'])
  })

  it('sem a chave da ElevenLabs, diz onde conectar', async () => {
    const resposta = await atenderEntrevista(ABRIR, criarPorta({ criar: 'sem_credencial' }))
    expect(resposta.status).toBe(428)
    expect(resposta.corpo).toMatchObject({ motivo: 'voz_nao_conectada' })
  })

  it('operador não abre a entrevista', async () => {
    const porta = criarPorta({ papel: 'operator' })
    const resposta = await atenderEntrevista(ABRIR, porta)
    expect(resposta.status).toBe(403)
    expect(porta.criados).toEqual([])
  })

  it('ação desconhecida é recusada antes de tocar no provedor', async () => {
    const porta = criarPorta()
    const resposta = await atenderEntrevista({ ...ABRIR, acao: 'apagar' }, porta)
    expect(resposta.status).toBe(400)
    expect(porta.criados).toEqual([])
  })
})

describe('encerrar', () => {
  it('lê a conversa, apaga o agente e devolve as sugestões', async () => {
    const porta = criarPorta()
    const resposta = await atenderEntrevista(ENCERRAR, porta)

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true })
    expect(porta.apagados).toEqual(['agente-1'])
    // O que o cliente disse chega ao modelo.
    expect(porta.mensagens[0]).toContain('Usinas solares por assinatura')
  })

  it('transcrição ainda processando é repetida, e desistir não apaga o agente', async () => {
    const porta = criarPorta({ conversas: [{ pronta: false }] })
    const resposta = await atenderEntrevista(ENCERRAR, porta)

    expect(resposta.status).toBe(409)
    expect(porta.leituras).toBe(TENTATIVAS_DA_TRANSCRICAO)
    expect(porta.apagados).toEqual([])
  })

  it('transcrição que fica pronta na segunda tentativa segue', async () => {
    const porta = criarPorta({ conversas: [{ pronta: false }, { pronta: true, turnos: CONVERSA }] })
    const resposta = await atenderEntrevista(ENCERRAR, porta)
    expect(resposta.status).toBe(200)
    expect(porta.leituras).toBe(2)
  })

  it('conversa curta é 422, e o modelo não é chamado', async () => {
    const porta = criarPorta({
      conversas: [{ pronta: true, turnos: CONVERSA.slice(0, MINIMO_DE_RESPOSTAS) }],
    })
    const resposta = await atenderEntrevista(ENCERRAR, porta)
    expect(resposta.status).toBe(422)
    expect(porta.mensagens).toEqual([])
    expect(porta.apagados).toEqual(['agente-1'])
  })

  it('conversa conduzida por outro agente não vira sugestão desta conta', async () => {
    const porta = criarPorta({
      conversas: [{ pronta: true, turnos: CONVERSA, agenteId: 'agente-de-outra-conta' }],
    })
    const resposta = await atenderEntrevista(ENCERRAR, porta)
    expect(resposta.status).toBe(400)
    expect(porta.mensagens).toEqual([])
  })

  it('sem conversa ou sem agente no pedido, recusa', async () => {
    expect((await atenderEntrevista({ ...ENCERRAR, conversaId: '' }, criarPorta())).status).toBe(400)
    expect((await atenderEntrevista({ ...ENCERRAR, agenteId: '' }, criarPorta())).status).toBe(400)
  })
})

it('o pedido ao modelo nomeia quem falou e manda usar só o que o cliente disse', () => {
  const { sistema, mensagem } = montarPedidoDaEntrevista(CONVERSA)
  expect(mensagem).toContain('Cliente: Pode sim. A empresa é a Aurora Energia.')
  expect(mensagem).toContain(`${NOME_SEM_ESCOLHA}: ${falas.abertura}`)
  expect(sistema).toMatch(/Use só o que o Cliente disse/)
})

describe('o nome que a conta escolheu', () => {
  it('a entrevista abre com o nome gravado, e a instrução o usa', async () => {
    const porta = criarPorta({ nome: 'Ana' })
    await atenderEntrevista(ABRIR, porta)
    const agente = porta.criados[0]
    expect(agente?.primeiraFala).toBe(falasDaEntrevista('Ana').abertura)
    expect(agente?.primeiraFala).toMatch(/^Oi! Aqui é a Ana\./)
    expect(agente?.instrucao).toMatch(/^Você é a Ana,/)
    // Com o nome escolhido, perguntar de novo desfaria a primeira resposta.
    expect(agente?.instrucao).not.toMatch(/outro nome/)
    expect(`${agente?.instrucao}\n${agente?.primeiraFala}`).not.toContain('Sarah')
  })

  it('sem nome gravado, vale o padrão e o nome continua entre os assuntos', async () => {
    const porta = criarPorta()
    await atenderEntrevista(ABRIR, porta)
    expect(porta.criados[0]?.primeiraFala).toContain(`Aqui é a ${NOME_SEM_ESCOLHA}.`)
    expect(porta.criados[0]?.instrucao).toMatch(/outro nome/)
  })

  it('o pedido ao modelo chama as falas dela pelo nome gravado', async () => {
    const porta = criarPorta({ nome: 'Ana' })
    await atenderEntrevista(ENCERRAR, porta)
    const { mensagem, sistema } = montarPedidoDaEntrevista(CONVERSA, 'Ana')
    expect(mensagem).toContain(`Ana: ${falas.abertura}`)
    expect(sistema).toMatch(/Não sugira outro nome/)
  })
})

it('a voz escolhida no assistente vai para o agente, e identificador torto é ignorado', async () => {
  const porta = criarPorta()
  await atenderEntrevista({ ...ABRIR, vozId: 'czvzJwIVS2asEKnthV40' }, porta)
  await atenderEntrevista({ ...ABRIR, vozId: '../etc' }, porta)
  expect(porta.criados.map((agente) => agente.vozId)).toEqual(['czvzJwIVS2asEKnthV40', null])
})

describe('a voz escolhida precisa estar na conta do provedor', () => {
  it('é conferida pelo nome antes de criar o agente', async () => {
    const porta = criarPorta()
    await atenderEntrevista({ ...ABRIR, vozId: 'czvzJwIVS2asEKnthV40', vozNome: 'Daniel' }, porta)
    expect(porta.vozesConferidas).toEqual([{ vozId: 'czvzJwIVS2asEKnthV40', nome: 'Daniel' }])
  })

  it('adicionada da biblioteca com outro identificador, o agente usa o da conta', async () => {
    const porta = criarPorta({ voz: { estado: 'adicionada', vozId: 'idDaContaAbcdef1234' } })
    await atenderEntrevista({ ...ABRIR, vozId: 'czvzJwIVS2asEKnthV40' }, porta)
    expect(porta.criados[0]?.vozId).toBe('idDaContaAbcdef1234')
  })

  it('fora da conta e da biblioteca, recusa em vez de falar com outra voz', async () => {
    const porta = criarPorta({ voz: { estado: 'fora_da_biblioteca' } })
    const resposta = await atenderEntrevista({ ...ABRIR, vozId: 'czvzJwIVS2asEKnthV40' }, porta)
    expect(resposta.corpo).toMatchObject({ ok: false, motivo: 'voz_fora_da_conta' })
    expect(porta.criados).toEqual([])
  })

  it('provedor fora do ar na conferência é voz indisponível, sem agente', async () => {
    const porta = criarPorta({ voz: { estado: 'indisponivel' } })
    const resposta = await atenderEntrevista({ ...ABRIR, vozId: 'czvzJwIVS2asEKnthV40' }, porta)
    expect(resposta.corpo).toMatchObject({ motivo: 'voz_indisponivel' })
    expect(porta.criados).toEqual([])
  })

  it('sem voz escolhida, nada é conferido e vale a da conta', async () => {
    const porta = criarPorta()
    await atenderEntrevista(ABRIR, porta)
    expect(porta.vozesConferidas).toEqual([])
    expect(porta.criados[0]?.vozId).toBeNull()
  })
})
