// Provas do ciclo de evolução. Ambiente node, sem rede e sem banco: o modelo e
// a camada de dados são dublados, e o dublê guarda o estado entre os passos
// para o ciclo inteiro correr num teste só.
//
// O que este arquivo segura:
//
// 1. **Uma versão, não duas.** Roteiro e jeito da casa aceitos juntos vão para
//    a mesma linha de `playbook_versions`, e as duas propostas apontam para
//    ela. A camada que ninguém mudou sai da vigente, byte a byte.
// 2. **O rascunho nasce `draft`.** A porta não tem método que publique, e a
//    linha gravada leva o status no tipo.
// 3. **O caminho de "onde mexer" é do repositório, não do modelo.** Voz vai
//    para a tela de voz ainda que o modelo peça outra; `other` com tela
//    inventada é descartado, porque não há endereço para ele.
// 4. **O que não se aplica não gera versão** e volta para a tela como
//    encaminhamento, com a ação escrita.
// 5. **A tela que não existe se declara.** O encaminhamento de conhecimento
//    aponta para US-085 com `caminhoDisponivel: false`, em vez de oferecer uma
//    navegação morta.
// 6. **O crivo de O-06 vale aqui.** Proposta de roteiro que promete horário num
//    propósito sem agenda nem chega a ser oferecida.
// 7. **Recusada não aplica**, e aplicar sem nada aceito não grava versão.
// 8. **Cada passo só na sua vez**, e quem não administra a conta recebe a
//    negativa antes de qualquer custo de modelo.

import { describe, expect, test } from 'vitest'

import {
  montarPedidoDeAnalise,
  TELAS_DE_ENCAMINHAMENTO,
  type HistoricoDaConta,
} from '../_shared/agente/revisao-de-chamada.ts'

import { MODELOS_PADRAO } from '../_shared/modelo/resolucao.ts'

import {
  atenderRevisao,
  TAREFA_DA_REVISAO,
  TAMANHO_MINIMO_DO_QUESTIONAMENTO,
  varianteDoProposito,
  type ChamadaParaRevisar,
  type CorpoDaRevisao,
  type DecisaoDaMudanca,
  type LinhaDaMudanca,
  type LinhaDaPergunta,
  type LinhaDaRevisao,
  type MudancaGravada,
  type PedidoAoModelo,
  type PedidoDaBorda,
  type PerguntaGravada,
  type PortaDaRevisao,
  type RecusaDaRevisao,
  type RespostaDoModelo,
  type RevisaoCompleta,
} from './revisao.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const CHAMADA = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const PLAYBOOK = '44444444-4444-4444-8444-444444444444'
const VERSAO_DA_CHAMADA = '55555555-5555-4555-8555-555555555555'

/** O roteiro com que a Sarah falou. Distinto o bastante para achar por busca. */
const ROTEIRO_ANTIGO = '1. Cumprimente.\n2. Pergunte sobre a frota de empilhadeiras.'
const JEITO_ANTIGO = 'Trate por você.\nNunca chame a empresa de "cliente".'

const ROTEIRO_NOVO = [
  '1. Cumprimente e diga de onde fala.',
  '2. Pergunte quantas empilhadeiras a operação tem hoje.',
  '3. Confirme o interesse e encaminhe para o especialista.',
].join('\n')

const JEITO_NOVO = 'Trate por você.\nFale devagar quando o interlocutor pedir para repetir.'

const ROTEIRO_COM_HORARIO = '1. Ofereça: "posso deixar marcado para amanhã às 14h?"'

const CONVERSA = {
  turns: [
    { role: 'agent', text: 'Oi, aqui é a Sarah. Esta ligação é gravada.' },
    { role: 'lead', text: 'Pode falar, mas não entendi direito o que você falou.' },
    { role: 'agent', text: 'Queria saber da sua frota de empilhadeiras.' },
    { role: 'lead', text: 'Temos quatro. Quanto custa a manutenção de vocês?' },
    { role: 'agent', text: 'Não arrisco um valor. O especialista te explica.' },
  ],
}

// A análise e as propostas que o modelo devolve, como texto de resposta -------------

const ANALISE = JSON.stringify({
  leitura: {
    resumo: 'O lead atendeu, disse que não entendeu a Sarah e perguntou preço da manutenção.',
    tropecos: ['O interlocutor pediu para repetir logo na abertura.'],
    sem_resposta: ['Quanto custa a manutenção.'],
  },
  perguntas: [
    {
      pergunta: 'Existe uma faixa de preço de manutenção que a Sarah pode dizer?',
      porque: 'O lead perguntou o preço e a Sarah não tinha o que responder.',
      tipo: 'choice',
      opcoes: ['Sim, há faixa pública', 'Não, só o especialista fala de preço'],
    },
    {
      pergunta: 'O que a Sarah deve dizer quando pedem para repetir?',
      porque: 'O interlocutor não entendeu a primeira fala.',
      tipo: 'text',
      opcoes: [],
    },
  ],
})

function propostas(itens: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ mudancas: itens })
}

const MUDANCA_DE_ROTEIRO = {
  tipo: 'script',
  titulo: 'Abrir dizendo de onde fala',
  razao: 'O interlocutor pediu para repetir logo na abertura.',
  corpo: ROTEIRO_NOVO,
  tela: null,
  acao: null,
}

const MUDANCA_DE_CASA = {
  tipo: 'house',
  titulo: 'Falar devagar quando pedirem para repetir',
  razao: 'O lead não entendeu a primeira fala.',
  corpo: JEITO_NOVO,
  tela: null,
  acao: null,
}

const MUDANCA_DE_VOZ = {
  tipo: 'voice',
  titulo: 'Testar outra voz',
  razao: 'O interlocutor não entendeu a Sarah na abertura.',
  corpo: null,
  // A tela errada de propósito: voz tem destino fixo, e o código o impõe.
  tela: 'bloqueios',
  acao: 'Ouça as prévias e troque a voz da Sarah.',
}

const MUDANCA_DE_CONHECIMENTO = {
  tipo: 'knowledge',
  titulo: 'Ensinar a faixa de preço da manutenção',
  razao: 'O lead perguntou o preço e ninguém ensinou a resposta à Sarah.',
  corpo: null,
  tela: null,
  acao: 'Cadastre a faixa de preço da manutenção.',
}

// O dublê --------------------------------------------------------------------------

interface Cenario {
  papel?: string | null
  /** De qual modelo a conta fala. Sem isto, a porta da plataforma com o padrão. */
  modelo?: { porta: 'platform' | 'openrouter'; modelo: string; escolhidoPelaConta: boolean }
  usuario?: string | null
  chamada?: Partial<ChamadaParaRevisar> | null
  /** As respostas do modelo, na ordem em que os passos as consomem. */
  respostas?: string[]
  modeloFalha?: boolean
  /** A porta responde sem credencial, que é a conta que nunca conectou nada. */
  modeloSemCredencial?: boolean
  criacaoFalha?: boolean
  /** O que a conta já respondeu e aceitou antes. Sem isto, nada. */
  historico?: HistoricoDaConta
  /** A versão mais nova do propósito. Sem isto, a mesma da chamada. */
  atual?: { roteiro: string; jeitoDaCasa: string } | null
}

interface Dubla {
  porta: PortaDaRevisao
  tocados: string[]
  pedidos: PedidoAoModelo[]
  rascunhos: {
    account_id: string
    playbook_id: string
    status: 'draft'
    body_script: string
    body_house: string
    change_note: string
    author_id: string
  }[]
  aplicadas: { ids: readonly string[]; versaoId: string }[]
  encerramentos: { revisaoId: string; status: string }[]
  historicosPedidos: { contaId: string; excetoRevisaoId: string | null }[]
}

function respostaDoModelo(texto: string): RespostaDoModelo {
  return { ok: true, status: 200, latenciaMs: 12, endpoint: 'v1/messages', texto, tokensDeEntrada: 900, tokensDeSaida: 300 }
}

function dublar(cenario: Cenario = {}): Dubla {
  const tocados: string[] = []
  const pedidos: PedidoAoModelo[] = []
  const rascunhos: Dubla['rascunhos'] = []
  const aplicadas: Dubla['aplicadas'] = []
  const encerramentos: Dubla['encerramentos'] = []
  const historicosPedidos: Dubla['historicosPedidos'] = []
  const respostas = [...(cenario.respostas ?? [])]

  // O estado que o banco guardaria entre os passos.
  const banco = {
    revisao: null as (LinhaDaRevisao & { id: string }) | null,
    perguntas: [] as PerguntaGravada[],
    mudancas: [] as MudancaGravada[],
    status: 'questions',
  }
  let proximoId = 0
  const novoId = (prefixo: string) => `${prefixo}-${(proximoId += 1)}`

  const porta: PortaDaRevisao = {
    async usuarioDaSessao(jwt) {
      tocados.push('usuarioDaSessao')
      return jwt === 'token-bom' ? { id: cenario.usuario ?? ADMIN } : null
    },
    async papelNaConta() {
      tocados.push('papelNaConta')
      return cenario.papel === undefined ? 'admin' : cenario.papel
    },
    async lerChamada() {
      tocados.push('lerChamada')
      if (cenario.chamada === null) return null
      return {
        id: CHAMADA,
        account_id: CONTA,
        purpose: 'discovery',
        status: 'ended',
        transcript: CONVERSA,
        end_reason: 'completed',
        duration_sec: 163,
        playbook_version_id: VERSAO_DA_CHAMADA,
        body_script: ROTEIRO_ANTIGO,
        body_house: JEITO_ANTIGO,
        ...(cenario.chamada ?? {}),
      }
    },
    async lerRevisao(_conta, revisaoId): Promise<RevisaoCompleta | null> {
      tocados.push('lerRevisao')
      if (!banco.revisao || banco.revisao.id !== revisaoId) return null
      return {
        id: banco.revisao.id,
        account_id: CONTA,
        call_id: CHAMADA,
        status: banco.status,
        purpose: banco.revisao.purpose,
        analysis: banco.revisao.analysis,
        perguntas: banco.perguntas,
        mudancas: banco.mudancas,
      }
    },
    async criarRevisao(linha) {
      tocados.push('criarRevisao')
      // O único parcial `call_reviews_uma_aberta`, como o banco o aplicaria.
      if (cenario.criacaoFalha || banco.revisao) throw new Error('duplicate key')
      banco.revisao = { ...linha, id: novoId('rev') }
      banco.status = 'questions'
      return { id: banco.revisao.id }
    },
    async gravarPerguntas(linhas: readonly LinhaDaPergunta[]) {
      tocados.push('gravarPerguntas')
      banco.perguntas = linhas.map((linha) => ({
        id: novoId('perg'),
        position: linha.position,
        question: linha.question,
        why: linha.why,
        kind: linha.kind,
        options: linha.options,
        answer: null,
      }))
    },
    async gravarRespostas(_revisaoId, dadas) {
      tocados.push('gravarRespostas')
      banco.perguntas = banco.perguntas.map((pergunta) => ({
        ...pergunta,
        answer: dadas.find((item) => item.id === pergunta.id)?.answer ?? pergunta.answer,
      }))
    },
    async gravarMudancas(linhas: readonly LinhaDaMudanca[]) {
      tocados.push('gravarMudancas')
      banco.mudancas = linhas.map((linha) => ({
        id: novoId('mud'),
        position: linha.position,
        kind: linha.kind,
        title: linha.title,
        rationale: linha.rationale,
        body: linha.body,
        path: linha.path,
        path_action: linha.path_action,
        decision: 'pending',
        revisions: 0,
      }))
      banco.status = 'proposed'
    },
    async substituirMudanca(mudancaId, reescrita) {
      tocados.push('substituirMudanca')
      banco.mudancas = banco.mudancas.map((mudanca) =>
        mudanca.id === mudancaId
          ? {
              ...mudanca,
              title: reescrita.title,
              rationale: reescrita.rationale,
              body: reescrita.body,
              path: reescrita.path,
              path_action: reescrita.path_action,
              revisions: mudanca.revisions + 1,
            }
          : mudanca,
      )
    },
    async decidirMudancas(_revisaoId, decisoes: readonly DecisaoDaMudanca[]) {
      tocados.push('decidirMudancas')
      banco.mudancas = banco.mudancas.map((mudanca) => {
        const decisao = decisoes.find((item) => item.id === mudanca.id)
        return decisao ? { ...mudanca, decision: decisao.aceita ? 'accepted' : 'rejected' } : mudanca
      })
    },
    async playbookDoProposito() {
      tocados.push('playbookDoProposito')
      return { id: PLAYBOOK, body_script: ROTEIRO_ANTIGO, body_house: JEITO_ANTIGO }
    },
    async configuracaoAtual() {
      tocados.push('configuracaoAtual')
      return cenario.atual === undefined
        ? { roteiro: ROTEIRO_ANTIGO, jeitoDaCasa: JEITO_ANTIGO }
        : cenario.atual
    },
    async historicoDaConta(contaId, excetoRevisaoId) {
      tocados.push('historicoDaConta')
      historicosPedidos.push({ contaId, excetoRevisaoId })
      return cenario.historico ?? { respondidas: [], aceitas: [] }
    },
    async gravarRascunho(linha) {
      tocados.push('gravarRascunho')
      rascunhos.push(linha)
      return { id: novoId('versao'), version: 7 }
    },
    async marcarMudancasAplicadas(ids, versaoId) {
      tocados.push('marcarMudancasAplicadas')
      aplicadas.push({ ids, versaoId })
    },
    async encerrarRevisao(revisaoId, status) {
      tocados.push('encerrarRevisao')
      encerramentos.push({ revisaoId, status })
      banco.status = status
    },
    async modeloDaConta() {
      tocados.push('modeloDaConta')
      return (
        cenario.modelo ?? {
          porta: 'platform' as const,
          modelo: MODELOS_PADRAO.platform[TAREFA_DA_REVISAO],
          escolhidoPelaConta: false,
        }
      )
    },
    async perguntarAoModelo(pedido) {
      tocados.push('perguntarAoModelo')
      pedidos.push(pedido)
      if (cenario.modeloSemCredencial) {
        return { ok: false, codigo: 'sem_credencial', status: null, endpoint: 'v1/messages' }
      }
      if (cenario.modeloFalha) return { ok: false, codigo: 'timeout', status: null, endpoint: 'v1/messages' }
      const texto = respostas.shift()
      return texto === undefined
        ? { ok: false, codigo: 'sem_resposta', status: null, endpoint: 'v1/messages' }
        : respostaDoModelo(texto)
    },
    async registrarEventoDeIntegracao() {
      tocados.push('registrarEventoDeIntegracao')
    },
  }

  return { porta, tocados, pedidos, rascunhos, aplicadas, encerramentos, historicosPedidos }
}

function pedido(parcial: Partial<PedidoDaBorda>): PedidoDaBorda {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer token-bom',
    contaId: CONTA,
    acao: 'analisar',
    chamadaId: CHAMADA,
    revisaoId: null,
    respostas: null,
    mudancaId: null,
    questionamento: null,
    decisoes: null,
    ...parcial,
  }
}

/** Corre o ciclo até as propostas, devolvendo o dublê e o que a tela recebeu. */
async function ateAsPropostas(mudancas: readonly Record<string, unknown>[]) {
  const dubla = dublar({ respostas: [ANALISE, propostas(mudancas)] })

  const primeira = await atenderRevisao(pedido({}), dubla.porta)
  const questionario = primeira.corpo as Extract<CorpoDaRevisao, { passo: 'questionario' }>

  const segunda = await atenderRevisao(
    pedido({
      acao: 'responder',
      revisaoId: questionario.revisaoId,
      respostas: questionario.perguntas.map((pergunta) => ({ id: pergunta.id, resposta: 'Só o especialista fala de preço.' })),
    }),
    dubla.porta,
  )

  return {
    dubla,
    revisaoId: questionario.revisaoId,
    questionario,
    propostas: segunda.corpo as Extract<CorpoDaRevisao, { passo: 'propostas' }>,
  }
}

// As provas ------------------------------------------------------------------------

describe('o ciclo de evolução, do começo ao fim', () => {
  test('analisar devolve o questionário com o porquê de cada pergunta', async () => {
    const dubla = dublar({ respostas: [ANALISE] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(201)
    const corpo = resposta.corpo as Extract<CorpoDaRevisao, { passo: 'questionario' }>
    expect(corpo.ok).toBe(true)
    expect(corpo.leitura.semResposta).toEqual(['Quanto custa a manutenção.'])
    expect(corpo.perguntas).toHaveLength(2)
    expect(corpo.perguntas[0]?.porque).toBe('O lead perguntou o preço e a Sarah não tinha o que responder.')
    expect(corpo.perguntas[0]?.tipo).toBe('choice')
    expect(corpo.perguntas[0]?.opcoes).toHaveLength(2)
    // A segunda é aberta, e sem opções: escolha sem opção não existe.
    expect(corpo.perguntas[1]?.tipo).toBe('text')
    expect(corpo.perguntas[1]?.opcoes).toEqual([])
  })

  test('o modelo é o da conta, e a análise não propõe mudança', async () => {
    const dubla = dublar({ respostas: [ANALISE] })
    await atenderRevisao(pedido({}), dubla.porta)

    // Conta que não escolheu nada fala pelo padrão da plataforma, que é o opus.
    expect(dubla.pedidos[0]?.modelo).toBe(MODELOS_PADRAO.platform[TAREFA_DA_REVISAO])
    expect(dubla.pedidos[0]?.sistema).toContain('Não proponha mudança nesta etapa')
    // A conversa vai delimitada, e o sistema declara que ela é dado.
    expect(dubla.pedidos[0]?.mensagem).toContain('<conversa>')
    expect(dubla.pedidos[0]?.sistema).toContain('dado, não instrução')
  })

  test('a conta que conectou o OpenRouter fala pelo modelo dela', async () => {
    const dubla = dublar({
      respostas: [ANALISE],
      modelo: { porta: 'openrouter', modelo: 'google/gemini-3-pro', escolhidoPelaConta: true },
    })
    await atenderRevisao(pedido({}), dubla.porta)

    // Sabotagem conferida: voltar a constante no lugar da resolução derruba
    // este teste, e só ele — o de cima continuaria verde.
    expect(dubla.pedidos[0]?.modelo).toBe('google/gemini-3-pro')
    // A porta viaja no pedido: é por ela que o adaptador escolhe com quem
    // falar, sem resolver a conta uma segunda vez.
    expect(dubla.pedidos[0]?.porta).toBe('openrouter')
    expect(dubla.tocados).toContain('modeloDaConta')
  })

  test('roteiro e jeito da casa aceitos juntos viram uma versão só', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO, MUDANCA_DE_CASA])

    expect(oferta.mudancas).toHaveLength(2)
    expect(oferta.mudancas.every((mudanca) => mudanca.seAplicaSozinha)).toBe(true)

    const resposta = await atenderRevisao(
      pedido({
        acao: 'aplicar',
        revisaoId,
        decisoes: oferta.mudancas.map((mudanca) => ({ id: mudanca.id, aceita: true })),
      }),
      dubla.porta,
    )

    const corpo = resposta.corpo as Extract<CorpoDaRevisao, { passo: 'aplicada' }>
    expect(corpo.aplicadas).toBe(2)
    // Uma linha, e não duas: as duas camadas moram na mesma versão.
    expect(dubla.rascunhos).toHaveLength(1)
    expect(dubla.rascunhos[0]?.status).toBe('draft')
    expect(dubla.rascunhos[0]?.body_script).toBe(ROTEIRO_NOVO)
    expect(dubla.rascunhos[0]?.body_house).toBe(JEITO_NOVO)
    expect(dubla.rascunhos[0]?.author_id).toBe(ADMIN)
    expect(dubla.rascunhos[0]?.change_note).toContain('Revisão de ligação')
    // As duas propostas apontam para a mesma versão.
    expect(dubla.aplicadas[0]?.ids).toHaveLength(2)
    expect(dubla.aplicadas[0]?.versaoId).toBe(corpo.versaoId)
    expect(dubla.encerramentos).toEqual([{ revisaoId, status: 'applied' }])
  })

  test('a camada que ninguém mudou sai da vigente, byte a byte', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])

    await atenderRevisao(
      pedido({ acao: 'aplicar', revisaoId, decisoes: [{ id: oferta.mudancas[0]!.id, aceita: true }] }),
      dubla.porta,
    )

    expect(dubla.rascunhos[0]?.body_script).toBe(ROTEIRO_NOVO)
    // Sabotagem conferida: trocar por '' aqui derruba este teste. Versão nova
    // com a camada 3 em branco a apagaria na publicação seguinte.
    expect(dubla.rascunhos[0]?.body_house).toBe(JEITO_ANTIGO)
  })
})

describe('o que o ciclo não aplica, ele encaminha', () => {
  test('voz vai para a tela de voz, ainda que o modelo peça outra', async () => {
    const { propostas: oferta } = await ateAsPropostas([MUDANCA_DE_VOZ])

    const voz = oferta.mudancas[0]!
    expect(voz.seAplicaSozinha).toBe(false)
    expect(voz.corpo).toBeNull()
    // O modelo pediu 'bloqueios'; o destino da voz é fixo no repositório.
    expect(voz.caminho).toBe(TELAS_DE_ENCAMINHAMENTO.voz.caminho)
    expect(voz.caminhoDisponivel).toBe(true)
    expect(voz.acaoNoCaminho).toBe('Ouça as prévias e troque a voz da Sarah.')
  })

  test('conhecimento aponta para a tela da base, que já existe', async () => {
    const { propostas: oferta } = await ateAsPropostas([MUDANCA_DE_CONHECIMENTO])

    const conhecimento = oferta.mudancas[0]!
    expect(conhecimento.caminho).toBe(TELAS_DE_ENCAMINHAMENTO.conhecimento.caminho)
    // US-085 nasceu: o encaminhamento virou link de verdade. Enquanto ela não
    // existia, `disponivel: false` fazia a tela mostrar o caminho como texto,
    // e é essa a razão de a marca continuar existindo para a próxima.
    expect(conhecimento.caminhoDisponivel).toBe(true)
  })

  test('encaminhamento aceito não gera versão e volta para a tela', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_VOZ, MUDANCA_DE_CONHECIMENTO])

    const resposta = await atenderRevisao(
      pedido({
        acao: 'aplicar',
        revisaoId,
        decisoes: oferta.mudancas.map((mudanca) => ({ id: mudanca.id, aceita: true })),
      }),
      dubla.porta,
    )

    const corpo = resposta.corpo as Extract<CorpoDaRevisao, { passo: 'aplicada' }>
    expect(corpo.aplicadas).toBe(0)
    expect(corpo.versaoId).toBeNull()
    expect(dubla.rascunhos).toHaveLength(0)
    expect(dubla.tocados).not.toContain('gravarRascunho')
    // Some da tela se ninguém devolver: é o caminho de onde a pessoa mexe.
    expect(corpo.encaminhamentos).toHaveLength(2)
    expect(corpo.encaminhamentos.map((item) => item.caminho)).toEqual([
      TELAS_DE_ENCAMINHAMENTO.voz.caminho,
      TELAS_DE_ENCAMINHAMENTO.conhecimento.caminho,
    ])
  })

  test('tela inventada em `other` não vira proposta: não há para onde mandar ninguém', async () => {
    const { propostas: oferta } = await ateAsPropostas([
      { tipo: 'other', titulo: 'Mexer em algo', razao: 'Porque sim', corpo: null, tela: 'tela-que-nao-existe', acao: 'Faça lá.' },
      MUDANCA_DE_ROTEIRO,
    ])

    // A de tela inventada foi descartada na leitura; sobrou a do roteiro.
    expect(oferta.mudancas).toHaveLength(1)
    expect(oferta.mudancas[0]?.tipo).toBe('script')
  })
})

describe('os crivos', () => {
  test('proposta de roteiro que promete horário não é oferecida', async () => {
    // A descoberta está sem `tool-availability` enquanto a F5 não chega.
    expect(varianteDoProposito('discovery')).toBe('sem_agenda')

    const { propostas: oferta } = await ateAsPropostas([
      { ...MUDANCA_DE_ROTEIRO, corpo: ROTEIRO_COM_HORARIO },
      MUDANCA_DE_CASA,
    ])

    // Sabotagem conferida: tirar o crivo de `lerMudanca` faz esta subir para 2.
    expect(oferta.mudancas).toHaveLength(1)
    expect(oferta.mudancas[0]?.tipo).toBe('house')
  })

  test('recusada não vai para a versão', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO, MUDANCA_DE_CASA])

    await atenderRevisao(
      pedido({
        acao: 'aplicar',
        revisaoId,
        decisoes: [
          { id: oferta.mudancas[0]!.id, aceita: false },
          { id: oferta.mudancas[1]!.id, aceita: true },
        ],
      }),
      dubla.porta,
    )

    expect(dubla.rascunhos).toHaveLength(1)
    // O roteiro recusado não entrou: a versão levou o antigo.
    expect(dubla.rascunhos[0]?.body_script).toBe(ROTEIRO_ANTIGO)
    expect(dubla.rascunhos[0]?.body_house).toBe(JEITO_NOVO)
  })

  test('aplicar sem nada aceito não grava nem encerra', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])

    const resposta = await atenderRevisao(
      pedido({ acao: 'aplicar', revisaoId, decisoes: [{ id: oferta.mudancas[0]!.id, aceita: false }] }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('nada_aceito')
    expect(dubla.rascunhos).toHaveLength(0)
    expect(dubla.encerramentos).toHaveLength(0)
  })

  test('decisão de proposta que não é desta revisão derruba o pedido inteiro', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])

    const resposta = await atenderRevisao(
      pedido({
        acao: 'aplicar',
        revisaoId,
        decisoes: [
          { id: oferta.mudancas[0]!.id, aceita: true },
          { id: 'de-outra-revisao', aceita: true },
        ],
      }),
      dubla.porta,
    )

    // Tela desatualizada: aplicar "o que deu para casar" gravaria uma versão
    // que ninguém aprovou.
    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('mudanca_inexistente')
    expect(dubla.rascunhos).toHaveLength(0)
  })
})

describe('questionar uma proposta', () => {
  test('reescreve no lugar, somando revisão e mantendo o tipo', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])
    const reescrita = JSON.stringify({ ...MUDANCA_DE_ROTEIRO, titulo: 'Abrir mais curto', corpo: '1. Seja breve.' })

    const resposta = await atenderRevisao(
      pedido({
        acao: 'questionar',
        revisaoId,
        mudancaId: oferta.mudancas[0]!.id,
        questionamento: 'Ficou longo demais para uma abertura de ligação.',
      }),
      criarPortaComResposta(dubla, reescrita),
    )

    const corpo = resposta.corpo as Extract<CorpoDaRevisao, { passo: 'reescrita' }>
    expect(corpo.mudanca.titulo).toBe('Abrir mais curto')
    expect(corpo.mudanca.tipo).toBe('script')
    expect(corpo.mudanca.revisoes).toBe(1)
  })

  test('questionamento curto demais não chega ao modelo', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])
    const antes = dubla.pedidos.length

    const resposta = await atenderRevisao(
      pedido({
        acao: 'questionar',
        revisaoId,
        mudancaId: oferta.mudancas[0]!.id,
        questionamento: 'ruim',
      }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('questionamento_curto')
    expect('ruim'.length).toBeLessThan(TAMANHO_MINIMO_DO_QUESTIONAMENTO)
    expect(dubla.pedidos).toHaveLength(antes)
  })
})

describe('as negativas', () => {
  test('quem não administra a conta recebe a negativa antes do modelo', async () => {
    const dubla = dublar({ papel: 'operator', respostas: [ANALISE] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(403)
    expect((resposta.corpo as RecusaDaRevisao).mensagem).toBe(MENSAGENS.papel_insuficiente)
    expect(dubla.tocados).not.toContain('perguntarAoModelo')
  })

  test('ligação sem fala do interlocutor não se revisa', async () => {
    const dubla = dublar({
      chamada: { transcript: { turns: [{ role: 'agent', text: 'Oi, aqui é a Sarah.' }] } },
      respostas: [ANALISE],
    })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('sem_conversa')
    expect(dubla.tocados).not.toContain('perguntarAoModelo')
  })

  test('ligação em andamento não se revisa', async () => {
    const dubla = dublar({ chamada: { status: 'in_progress' }, respostas: [ANALISE] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('chamada_em_andamento')
    expect(dubla.tocados).not.toContain('perguntarAoModelo')
  })

  test('segunda revisão aberta na mesma chamada é recusada', async () => {
    const dubla = dublar({ criacaoFalha: true, respostas: [ANALISE] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(409)
    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('ja_existe_revisao')
  })

  test('responder sem responder tudo não chega ao modelo', async () => {
    const dubla = dublar({ respostas: [ANALISE] })
    const primeira = await atenderRevisao(pedido({}), dubla.porta)
    const questionario = primeira.corpo as Extract<CorpoDaRevisao, { passo: 'questionario' }>
    const antes = dubla.pedidos.length

    const resposta = await atenderRevisao(
      pedido({
        acao: 'responder',
        revisaoId: questionario.revisaoId,
        respostas: [{ id: questionario.perguntas[0]!.id, resposta: 'Só o especialista.' }],
      }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('respostas_incompletas')
    expect(dubla.pedidos).toHaveLength(antes)
  })

  test('cada passo só na sua vez', async () => {
    const { dubla, revisaoId } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])

    // A revisão já está em `proposed`: responder de novo é etapa errada.
    const resposta = await atenderRevisao(
      pedido({ acao: 'responder', revisaoId, respostas: [] }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('etapa_errada')
  })

  test('revisão encerrada não recebe mais passo', async () => {
    const { dubla, revisaoId, propostas: oferta } = await ateAsPropostas([MUDANCA_DE_ROTEIRO])
    await atenderRevisao(
      pedido({ acao: 'aplicar', revisaoId, decisoes: [{ id: oferta.mudancas[0]!.id, aceita: true }] }),
      dubla.porta,
    )

    const resposta = await atenderRevisao(pedido({ acao: 'descartar', revisaoId }), dubla.porta)
    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('revisao_encerrada')
  })

  test('conta sem provedor conectado recebe o caminho de onde conectar', async () => {
    // Credencial que falta não é indisponibilidade: tem conserto numa tela, e
    // "tente de novo em alguns minutos" mandaria a pessoa esperar por algo que
    // nunca acontece sozinho.
    const dubla = dublar({ modeloSemCredencial: true })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    const recusa = resposta.corpo as RecusaDaRevisao
    expect(recusa.motivo).toBe('modelo_nao_conectado')
    expect(resposta.status).toBe(428)
    expect(recusa.caminho).toBe('/config/integracoes')
    expect(dubla.tocados).not.toContain('criarRevisao')
  })

  test('modelo fora do ar não traz caminho nenhum: não há tela que resolva', async () => {
    const dubla = dublar({ modeloFalha: true })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    const recusa = resposta.corpo as RecusaDaRevisao
    expect(recusa.motivo).toBe('modelo_indisponivel')
    expect(recusa.caminho).toBeUndefined()
  })

  test('modelo fora do ar não grava revisão nenhuma', async () => {
    const dubla = dublar({ modeloFalha: true })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(503)
    expect(dubla.tocados).not.toContain('criarRevisao')
  })

  test('resposta do modelo fora do formato não grava revisão nenhuma', async () => {
    const dubla = dublar({ respostas: ['{"leitura":{}}'] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.status).toBe(502)
    expect((resposta.corpo as RecusaDaRevisao).motivo).toBe('resposta_ilegivel')
    expect(dubla.tocados).not.toContain('criarRevisao')
  })

  test('só POST, e só com sessão', async () => {
    const dubla = dublar()
    expect((await atenderRevisao(pedido({ metodo: 'GET' }), dubla.porta)).status).toBe(405)
    expect((await atenderRevisao(pedido({ autorizacao: null }), dubla.porta)).status).toBe(401)
    expect((await atenderRevisao(pedido({ acao: 'voar' }), dubla.porta)).status).toBe(400)
  })
})

/**
 * O mesmo dublê com uma resposta a mais na fila do modelo. Serve ao passo de
 * reescrita, que acontece depois de a fila do cenário já ter sido consumida.
 */
function criarPortaComResposta(dubla: Dubla, texto: string): PortaDaRevisao {
  return {
    ...dubla.porta,
    async perguntarAoModelo(pedidoAoModelo) {
      dubla.pedidos.push(pedidoAoModelo)
      return respostaDoModelo(texto)
    },
  }
}

describe('o questionário parte da conversa e do que a conta já disse', () => {
  const HISTORICO: HistoricoDaConta = {
    respondidas: [
      {
        pergunta: 'O que a Sarah deve dizer quando pedem para repetir?',
        resposta: 'Repetir mais devagar, dizendo de novo o nome da empresa.',
      },
    ],
    aceitas: [{ tipo: 'house', titulo: 'Falar devagar quando pedirem para repetir' }],
  }

  test('o pedido de análise leva o histórico desta conta e a configuração atual', async () => {
    const dubla = dublar({
      respostas: [ANALISE],
      historico: HISTORICO,
      atual: { roteiro: ROTEIRO_NOVO, jeitoDaCasa: JEITO_ANTIGO },
    })
    await atenderRevisao(pedido({}), dubla.porta)

    const mensagem = dubla.pedidos[0]?.mensagem ?? ''
    expect(mensagem).toContain('<historico>')
    expect(mensagem).toContain('Repetir mais devagar, dizendo de novo o nome da empresa.')
    expect(mensagem).toContain('Mudança já aceita (house): Falar devagar quando pedirem para repetir')
    expect(mensagem).toContain('<roteiro_atual>')
    expect(mensagem).toContain(ROTEIRO_NOVO)
    // O histórico é sempre da conta do pedido.
    expect(dubla.historicosPedidos).toEqual([{ contaId: CONTA, excetoRevisaoId: null }])
  })

  test('pergunta que o histórico já respondeu não volta ao questionário', async () => {
    const dubla = dublar({ respostas: [ANALISE], historico: HISTORICO })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    const corpo = resposta.corpo as Extract<CorpoDaRevisao, { passo: 'questionario' }>
    expect(corpo.perguntas.map((pergunta) => pergunta.pergunta)).toEqual([
      'Existe uma faixa de preço de manutenção que a Sarah pode dizer?',
    ])
  })

  test('sem nada a perguntar, a revisão vai direto às propostas', async () => {
    const semPerguntas = JSON.stringify({ ...JSON.parse(ANALISE), perguntas: [] })
    const dubla = dublar({ respostas: [semPerguntas, propostas([MUDANCA_DE_ROTEIRO])] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.corpo).toMatchObject({ ok: true, passo: 'propostas' })
    expect(dubla.tocados).toContain('gravarRespostas')
    expect(dubla.pedidos[1]?.mensagem).toContain('Não houve perguntas nesta revisão')
  })

  test('sem pergunta e sem mudança, a revisão fecha sozinha e diz que não há o que mudar', async () => {
    const semPerguntas = JSON.stringify({ ...JSON.parse(ANALISE), perguntas: [] })
    const dubla = dublar({ respostas: [semPerguntas, propostas([])] })
    const resposta = await atenderRevisao(pedido({}), dubla.porta)

    expect(resposta.corpo).toMatchObject({ ok: true, passo: 'sem_mudancas' })
    expect(dubla.encerramentos).toHaveLength(1)
    expect(dubla.encerramentos[0]?.status).toBe('discarded')
    expect(dubla.tocados).not.toContain('gravarMudancas')
  })

  test('o pedido de análise não traz exemplo de negócio e permite não perguntar nada', () => {
    const { sistema, esquema } = montarPedidoDeAnalise({
      proposito: 'discovery',
      variante: 'sem_agenda',
      turnos: [{ quem: 'lead', texto: 'Oi.' }],
      roteiro: '',
      jeitoDaCasa: '',
      motivoDoFim: null,
      duracaoSeg: null,
    })
    expect(sistema).not.toMatch(/o que o preço cobre/)
    expect(sistema).toContain('devolva a lista de perguntas vazia')
    const perguntas = (esquema.properties as Record<string, { minItems?: number }>).perguntas
    expect(perguntas?.minItems).toBe(0)
  })
})
