// onboarding-interview: a assistente entrevista quem está configurando a
// conta, por voz no navegador, e a conversa vira as sugestões da configuração.
// Ela se apresenta com o nome que a conta escolheu na primeira pergunta do
// tutorial (`agents.name`), lido aqui pela porta e nunca pelo corpo do pedido.
//
// Duas ações:
//
// - **abrir** cria, na ElevenLabs da conta, um agente só para a entrevista
//   (roteiro em `_shared/speech/entrevista.ts`) e devolve a URL assinada da
//   conversa, como `rehearsal-session`. A chave da conta nunca vai ao
//   navegador: a URL vale para uma conversa e expira.
// - **encerrar** lê a transcrição do provedor, apaga o agente e pede as
//   sugestões com a conversa como contexto, pela mesma metade de
//   `onboarding-suggest` (`sugerirAPartirDe`). Nada de configuração é gravado.
//
// **O AGENTE É DE UMA CONVERSA SÓ.** Ele nasce na abertura e morre no
// encerramento, para a conta não guardar um quinto agente que nenhuma tela
// administra. Se a abertura cria o agente e a URL assinada falha, ele é
// apagado ali mesmo. Se o encerramento nunca chega (a aba fechou), o agente
// sobra no provedor com o nome que diz o que é; é o único lixo possível, e o
// nome existe para ser achado.
//
// **A TRANSCRIÇÃO PODE NÃO ESTAR PRONTA.** O provedor processa a conversa
// depois que ela acaba. O encerramento tenta algumas vezes, com espera curta;
// se ainda não estiver pronta, responde `transcricao_pendente` sem apagar o
// agente, e a tela pede de novo.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'
import { falasDaEntrevista, instrucaoDaEntrevista, nomeNaEntrevista } from '../_shared/speech/entrevista.ts'
import type { VozNaConta } from '../_shared/voz/voz-na-conta.ts'
import {
  PAPEIS_QUE_CONFIGURAM,
  sistemaDasSugestoes,
  sugerirAPartirDe,
  type PortaDaSugestao,
  type RespostaDaSugestao,
} from '../onboarding-suggest/sugestoes.ts'

import { MENSAGENS, STATUS, type MotivoDaEntrevista } from './respostas.ts'

export const ACOES = ['abrir', 'encerrar'] as const
export type AcaoDaEntrevista = (typeof ACOES)[number]

/** O nome do agente no provedor: é por ele que um agente que sobrou se acha. */
export const NOME_DO_AGENTE_DA_ENTREVISTA = `${NOME_DO_PRODUTO} · entrevista de configuração`

/**
 * Quanto silêncio a assistente tolera antes de retomar. Mais longo que numa ligação
 * de venda: quem configura pensa, consulta e digita.
 */
export const ESPERA_POR_RESPOSTA_SEG = 25

/** A conversa não passa disto: a instrução fala em cinco minutos. */
export const DURACAO_MAXIMA_DA_ENTREVISTA_SEG = 480

/** Quantas vezes o encerramento pergunta pela transcrição, e quanto espera. */
export const TENTATIVAS_DA_TRANSCRICAO = 4
export const ESPERA_ENTRE_TENTATIVAS_MS = 2_500

/** Menos do que isto de falas de quem configura não dá para sugerir nada. */
export const MINIMO_DE_RESPOSTAS = 2

export interface TurnoDaEntrevista {
  readonly quem: 'agent' | 'lead'
  readonly texto: string
}

/** O que a porta devolve de uma conversa: pronta ou ainda processando. */
export type ConversaLida =
  | {
      readonly pronta: true
      readonly turnos: readonly TurnoDaEntrevista[]
      /** O `agent_id` que o provedor diz ter conduzido a conversa. */
      readonly agenteId?: string | null
    }
  | { readonly pronta: false }

/** O agente que a abertura pede ao provedor. */
export interface AgenteDaEntrevista {
  readonly nome: string
  readonly primeiraFala: string
  readonly instrucao: string
  readonly duracaoMaximaSeg: number
  /** Silêncio tolerado antes de a assistente retomar a palavra. */
  readonly esperaPorRespostaSeg: number
  /** A voz escolhida no assistente, quando há. Nula usa a da conta. */
  readonly vozId: string | null
}

export type ResultadoDoProvedor<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly semCredencial: boolean }

export interface PortaDaEntrevista
  extends Pick<
    PortaDaSugestao,
    | 'usuarioDaSessao'
    | 'papelNaConta'
    | 'modeloDaConta'
    | 'perguntarAoModelo'
    | 'registrarEventoDeIntegracao'
    | 'nomeDoAgente'
  > {
  /**
   * Confere a voz escolhida na conta do provedor e a adiciona da biblioteca
   * quando falta. Sem isso, o provedor cria o agente e fala com outra voz.
   */
  garantirVoz(contaId: string, vozId: string, nome: string | null): Promise<VozNaConta | null>
  criarAgente(contaId: string, agente: AgenteDaEntrevista): Promise<ResultadoDoProvedor<string>>
  pedirSessaoAssinada(contaId: string, agenteId: string): Promise<ResultadoDoProvedor<string>>
  /** Nula quando o provedor não conhece a conversa ou não respondeu. */
  lerConversa(contaId: string, conversaId: string): Promise<ConversaLida | null>
  /** Melhor esforço: falhar em apagar não muda o resultado da entrevista. */
  apagarAgente(contaId: string, agenteId: string): Promise<void>
  /** Espera entre as tentativas de ler a transcrição. O teste a zera. */
  esperar(ms: number): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly acao: unknown
  readonly agenteId?: unknown
  readonly conversaId?: unknown
  /** A voz que a pessoa escolheu antes da entrevista. */
  readonly vozId?: unknown
  /** O nome da voz, para achá-la na biblioteca do provedor. */
  readonly vozNome?: unknown
}

export type RespostaDaEntrevista =
  | {
      readonly status: number
      readonly corpo: { readonly ok: true; readonly agenteId: string; readonly urlAssinada: string }
    }
  | RespostaDaSugestao
  | {
      readonly status: number
      readonly corpo: {
        readonly ok: false
        readonly motivo: MotivoDaEntrevista
        readonly mensagem: string
      }
    }

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

export async function atenderEntrevista(
  pedido: PedidoDaBorda,
  porta: PortaDaEntrevista,
): Promise<RespostaDaEntrevista> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const acao = typeof pedido.acao === 'string' && (ACOES as readonly string[]).includes(pedido.acao)
    ? (pedido.acao as AcaoDaEntrevista)
    : null
  if (!acao) return recusa('acao_invalida')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const agenteId = typeof pedido.agenteId === 'string' ? pedido.agenteId.trim() : ''
  const conversaId = typeof pedido.conversaId === 'string' ? pedido.conversaId.trim() : ''
  if (acao === 'encerrar' && !agenteId) return recusa('agente_ausente')
  if (acao === 'encerrar' && !conversaId) return recusa('conversa_ausente')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_CONFIGURAM.has(papel)) return recusa('papel_insuficiente')

    const vozId =
      typeof pedido.vozId === 'string' && FORMA_DO_ID_DE_VOZ.test(pedido.vozId) ? pedido.vozId : null
    const vozNome = typeof pedido.vozNome === 'string' ? pedido.vozNome.trim().slice(0, 120) || null : null
    return acao === 'abrir'
      ? await abrir(contaId, porta, vozId, vozNome)
      : await encerrar(contaId, agenteId, conversaId, porta)
  } catch {
    return recusa('falha_interna')
  }
}

/** O agente que a entrevista usa, com o roteiro da fala. */
/** Identificador de voz do provedor: letras e números, sem mais nada. */
const FORMA_DO_ID_DE_VOZ = /^[A-Za-z0-9]{10,40}$/

export function agenteDaEntrevista(
  vozId: string | null = null,
  nomeDaAssistente: string | null = null,
): AgenteDaEntrevista {
  return {
    vozId,
    nome: NOME_DO_AGENTE_DA_ENTREVISTA,
    primeiraFala: falasDaEntrevista(nomeDaAssistente).abertura,
    instrucao: instrucaoDaEntrevista(nomeDaAssistente),
    duracaoMaximaSeg: DURACAO_MAXIMA_DA_ENTREVISTA_SEG,
    esperaPorRespostaSeg: ESPERA_POR_RESPOSTA_SEG,
  }
}

async function abrir(
  contaId: string,
  porta: PortaDaEntrevista,
  escolhida: string | null,
  vozNome: string | null,
): Promise<RespostaDaEntrevista> {
  let vozId = escolhida
  if (escolhida) {
    // Nula é a porta sem chave da voz: a criação do agente diz o mesmo logo abaixo.
    const voz = await porta.garantirVoz(contaId, escolhida, vozNome)
    if (voz?.estado === 'fora_da_biblioteca') return recusa('voz_fora_da_conta')
    if (voz?.estado === 'indisponivel') return recusa('voz_indisponivel')
    if (voz?.estado === 'na_conta' || voz?.estado === 'adicionada') vozId = voz.vozId
  }
  const nome = await lerNome(porta, contaId)
  const criado = await porta.criarAgente(contaId, agenteDaEntrevista(vozId, nome))
  if (!criado.ok) return recusa(criado.semCredencial ? 'voz_nao_conectada' : 'voz_indisponivel')

  const sessao = await porta.pedirSessaoAssinada(contaId, criado.valor)
  if (!sessao.ok) {
    // Sem conversa, o agente não serve para nada: sai agora, e não depois.
    await apagarSemFalhar(porta, contaId, criado.valor)
    return recusa(sessao.semCredencial ? 'voz_nao_conectada' : 'voz_indisponivel')
  }

  return { status: 201, corpo: { ok: true, agenteId: criado.valor, urlAssinada: sessao.valor } }
}

async function encerrar(
  contaId: string,
  agenteId: string,
  conversaId: string,
  porta: PortaDaEntrevista,
): Promise<RespostaDaEntrevista> {
  let conversa: ConversaLida | null = null
  for (let tentativa = 0; tentativa < TENTATIVAS_DA_TRANSCRICAO; tentativa += 1) {
    if (tentativa > 0) await porta.esperar(ESPERA_ENTRE_TENTATIVAS_MS)
    conversa = await porta.lerConversa(contaId, conversaId)
    if (conversa?.pronta) break
  }
  if (!conversa) return recusa('voz_indisponivel')
  // Ainda processando: o agente fica, porque a tela vai pedir de novo.
  if (!conversa.pronta) return recusa('transcricao_pendente')
  // A conversa tem que ser do agente desta entrevista. Um identificador velho
  // ou trocado traria a entrevista de outro agente do mesmo workspace — outra
  // conta, outro negócio — para dentro das sugestões desta.
  const conduzidaPor = conversa.agenteId?.trim()
  if (conduzidaPor && conduzidaPor !== agenteId) return recusa('conversa_ausente')

  await apagarSemFalhar(porta, contaId, agenteId)

  const respostas = conversa.turnos.filter((turno) => turno.quem === 'lead')
  if (respostas.length < MINIMO_DE_RESPOSTAS) return recusa('conversa_curta')

  const nome = await lerNome(porta, contaId)
  return await sugerirAPartirDe(
    contaId,
    montarPedidoDaEntrevista(conversa.turnos, nome),
    porta,
    { finalidade: 'sugestoes_da_entrevista', turnos: conversa.turnos.length },
    nome,
  )
}

/** O nome gravado, ou nulo. Leitura que falha não derruba a entrevista. */
async function lerNome(porta: Pick<PortaDaEntrevista, 'nomeDoAgente'>, contaId: string): Promise<string | null> {
  try {
    const nome = (await porta.nomeDoAgente(contaId))?.trim() ?? ''
    return nome === '' ? null : nome
  } catch {
    return null
  }
}

/**
 * O pedido ao modelo a partir da conversa: as mesmas regras do negócio
 * escrito, com a transcrição no lugar das três respostas.
 */
export function montarPedidoDaEntrevista(
  turnos: readonly TurnoDaEntrevista[],
  nomeDaAssistente: string | null = null,
): {
  sistema: string
  mensagem: string
} {
  // O rótulo das falas dela é o nome com que ela se apresentou na conversa.
  const quemFala = nomeNaEntrevista(nomeDaAssistente)
  const conversa = turnos
    .map((turno) => `${turno.quem === 'agent' ? quemFala : 'Cliente'}: ${turno.texto}`)
    .join('\n')
  return {
    sistema: `${sistemaDasSugestoes(nomeDaAssistente)}\n\nO contexto vem de uma conversa entre a assistente (${quemFala}) e a pessoa que configura a conta. Use só o que o Cliente disse.`,
    mensagem: `Conversa de configuração:\n${conversa}`,
  }
}

async function apagarSemFalhar(porta: PortaDaEntrevista, contaId: string, agenteId: string) {
  try {
    await porta.apagarAgente(contaId, agenteId)
  } catch {
    // O agente sobra com o nome que diz o que é; ver o cabeçalho.
  }
}

function recusa(motivo: MotivoDaEntrevista): RespostaDaEntrevista {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
