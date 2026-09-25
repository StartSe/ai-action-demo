// rehearsal-session: conversar com a Sarah sem telefone (US-247, T-16, RF-312).
//
// Dois passos, um por `acao`:
//
//   `abrir`     cria a chamada de ensaio e devolve a sessão assinada contra o
//               agente publicado daquele propósito.
//   `encerrar`  busca a conversa no provedor, grava a transcrição e fecha a
//               chamada.
//
// **ENSAIA-SE CONTRA O QUE VAI AO AR.** A sessão abre contra o
// `provider_agent_id` da publicação — o mesmo agente que atende as ligações,
// com o mesmo prompt compilado e as mesmas ferramentas. Um segundo tempo de
// execução só para ensaio testaria outra coisa, e a divergência apareceria
// justamente no dia em que alguém confiasse no ensaio para publicar.
//
// **NÃO EXISTE `rehearsal-turn`** (T-16, O-05). Nenhum turno do ensaio passa
// por código nosso: texto e voz abrem a mesma sessão assinada contra o mesmo
// agente publicado, e o que separa os dois é o `textOnly` do SDK no navegador.
// Se o ensaio corresse num segundo tempo de execução, toda diferença de
// modelo, de temperatura e de chamada de ferramenta faria o ensaio aprovar o
// que a ligação vai errar, e ele deixaria de provar qualquer coisa. Por isso a
// abertura sempre carrega o `agent_publication_id` da publicação (o banco
// também o exige, desde `20260924160000_ensaio_sobre_a_publicacao.sql`).
//
// **A SESSÃO É CURTA E A CHAVE NÃO SAI.** O navegador recebe a URL assinada,
// que vale para uma conversa e expira em `VALIDADE_DA_SESSAO_MS`. A chave da
// conta é procurada no corpo serializado antes de responder, como
// `integrations-status` faz, e achá-la recusa a resposta inteira.
//
// **SEM PUBLICAÇÃO NÃO HÁ O QUE ENSAIAR**, e a recusa diz isso com o caminho
// de onde publicar. Criar um agente temporário para o ensaio seria contornar a
// publicação — e pôr no ar, na prática, um texto que ninguém publicou.
//
// **O ENSAIO É UMA CHAMADA.** `abrir_ensaio` grava em `calls` com
// `direction = 'rehearsal'`, e é isso que faz transcrição, custo e o ciclo de
// evolução (US-245) funcionarem sobre ele sem uma linha a mais.
//
// **A TRANSCRIÇÃO VEM DO PROVEDOR, NÃO DO NAVEGADOR.** O que a aba mostrou
// durante a conversa é o que o SDK renderizou; o que fica gravado é o que o
// provedor registrou. Confiar no navegador deixaria a transcrição do ensaio
// dependente de o usuário não fechar a aba, e aberta a quem editasse o que
// manda de volta.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  montarAbertura,
  variaveisDaChamada,
  type IdentidadeDaAbertura,
  type LeadDaAbertura,
  type PoliticaDaAbertura,
} from '../_shared/agente/abertura-da-chamada.ts'
import { lerIdDoPerfil, perfilPeloId, type IdDoPerfil } from '../_shared/ensaio/perfis-de-lead.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'

import { CAMINHO_DA_RECUSA, MENSAGENS, STATUS, type MotivoDoEnsaio } from './respostas.ts'

/** Quem ensaia. A mesma hierarquia de quem escreve roteiro: é configuração. */
export const PAPEIS_QUE_ENSAIAM: ReadonlySet<string> = new Set(['owner', 'admin'])

export const ACOES = ['abrir', 'encerrar'] as const
export type AcaoDoEnsaio = (typeof ACOES)[number]

/** Por onde se conversa. Os mesmos do check de `rehearsals.mode`. */
export const MODOS = ['voice', 'text'] as const
export type ModoDoEnsaio = (typeof MODOS)[number]

/**
 * Quanto a URL assinada vale para abrir a conversa. É a validade que o
 * provedor dá ao `get_signed_url` (15 minutos); a resposta a declara para a
 * tela não oferecer uma sessão que já expirou.
 */
export const VALIDADE_DA_SESSAO_MS = 15 * 60 * 1000

/** Voz gasta crédito de voz do provedor; texto não sintetiza nem transcreve. */
export const MODOS_QUE_CONSOMEM_CREDITO: ReadonlySet<ModoDoEnsaio> = new Set(['voice'])

export interface UsuarioDaSessao {
  readonly id: string
}

/** A publicação daquele propósito, na parte que o ensaio usa. */
export interface PublicacaoDoProposito {
  readonly id: string
  /** O agente no provedor. Nulo quando a publicação ainda não completou. */
  readonly provider_agent_id: string | null
  readonly playbook_version_id: string | null
}

export interface EnsaioAberto {
  readonly id: string
  readonly call_id: string
  readonly finished_at: string | null
  readonly provider_conversation_id: string | null
  /**
   * O agente no provedor da publicação contra a qual o ensaio abriu. É o dono
   * que a conversa lida no fim precisa ter: conversa de outro agente não é
   * transcrição deste ensaio.
   */
  readonly provider_agent_id?: string | null
}

/** O que a abertura da sessão lê para montar as variáveis e a primeira fala. */
export interface ContextoDaAbertura {
  readonly identidade: IdentidadeDaAbertura
  readonly politica: PoliticaDaAbertura
  /** O lead de ensaio da conta, em que a chamada foi pendurada. */
  readonly lead: LeadDaAbertura | null
}

export interface RespostaDoProvedor extends EnvelopeDoProvedor {
  /** A URL assinada, quando o passo é abrir. */
  readonly urlAssinada?: string | null
  /**
   * A chave que o adaptador usou no pedido. Existe só para a conferência de
   * vazamento antes de responder; nada a escreve no corpo.
   */
  readonly credencial?: string | null
}

/** A conversa como o provedor a devolve, já lida. */
export interface ConversaDoProvedor {
  readonly turnos: readonly { quem: 'agent' | 'lead'; texto: string }[]
  readonly duracaoSeg: number | null
  /** O `agent_id` que o provedor diz ter conduzido a conversa. */
  readonly agenteId?: string | null
}

export interface PortaDoEnsaio {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** Se a conta já tem a linha de `agents`. Sem ela não há o que publicar. */
  contaTemAgente(contaId: string): Promise<boolean>
  publicacaoDoProposito(contaId: string, proposito: Proposito): Promise<PublicacaoDoProposito | null>
  /** Nunca levanta: falha de rede e recusa chegam como `ok: false`. */
  pedirSessaoAssinada(agenteId: string): Promise<RespostaDoProvedor>
  abrirEnsaio(dados: {
    contaId: string
    proposito: Proposito
    modo: ModoDoEnsaio
    /** O que `rehearsals.persona_profile` guarda: só o id do perfil do catálogo. */
    persona: { readonly perfil: IdDoPerfil }
    criadoPor: string
    publicacaoId: string
    versaoDoPlaybookId: string | null
  }): Promise<{ ensaioId: string; chamadaId: string }>
  /**
   * A identidade, a política e o lead da chamada de ensaio. Nulo quando a
   * conta não tem agente legível: aí a sessão vai só com os valores iniciais.
   */
  contextoDaAbertura(contaId: string, chamadaId: string): Promise<ContextoDaAbertura | null>
  lerEnsaio(contaId: string, ensaioId: string): Promise<EnsaioAberto | null>
  /** A conversa gravada no provedor. Nula quando ele não a devolveu. */
  buscarConversa(conversaId: string): Promise<ConversaDoProvedor | null>
  /** Falso quando o ensaio já estava encerrado: a RPC é quem decide. */
  encerrarEnsaio(dados: {
    ensaioId: string
    transcricao: Readonly<Record<string, unknown>>
    conversaId: string | null
    duracaoSeg: number | null
  }): Promise<boolean>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly autorizacao: string | null
  readonly contaId: unknown
  readonly acao: unknown
  readonly proposito: unknown
  readonly modo: unknown
  /** O id do perfil de lead simulado, do catálogo de `_shared/ensaio/`. */
  readonly perfil: unknown
  readonly ensaioId: unknown
  /** O identificador da conversa que o SDK devolveu ao encerrar. */
  readonly conversaId: unknown
}

export type CorpoDoEnsaio =
  | {
      ok: true
      passo: 'aberto'
      ensaioId: string
      chamadaId: string
      /** A publicação contra a qual a sessão foi assinada (T-16, RF-308). */
      publicacaoId: string
      /** A sessão assinada, para o SDK abrir a conversa no navegador. */
      urlAssinada: string
      modo: ModoDoEnsaio
      /** O navegador abre sem microfone nem áudio: `textOnly` do SDK. */
      somenteTexto: boolean
      /** Até quando a URL abre a conversa, em ISO. */
      expiraEm: string
      /** Verdadeiro na voz: a tela avisa antes de gastar crédito do provedor. */
      consomeCredito: boolean
      /**
       * As variáveis que o SDK passa ao abrir a conversa: `call_id` e todas as
       * que o prompt publicado cita, com o lead de ensaio e o perfil dentro.
       * A sessão do navegador não passa pelo webhook de início, e sem elas o
       * prompt do ensaio ficaria com os campos do lead em branco.
       */
      variaveis: Readonly<Record<string, string>>
      /** A primeira fala com o lead de ensaio dentro, que sobrepõe a publicada. */
      primeiraFala: string | null
    }
  | { ok: true; passo: 'encerrado'; ensaioId: string; chamadaId: string; turnos: number }

export interface RecusaDoEnsaio {
  readonly ok: false
  readonly motivo: MotivoDoEnsaio
  readonly mensagem: string
  readonly caminho?: string
}

export interface RespostaDoEnsaio {
  readonly status: number
  readonly corpo: CorpoDoEnsaio | RecusaDoEnsaio
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Conduz um passo do ensaio. Nunca levanta: exceção da porta vira `falha_interna`. */
export interface OpcoesDoEnsaio {
  /** O relógio da validade da sessão. Padrão: o do sistema. */
  readonly agora?: () => Date
}

export async function atenderEnsaio(
  pedido: PedidoDaBorda,
  porta: PortaDoEnsaio,
  opcoes: OpcoesDoEnsaio = {},
): Promise<RespostaDoEnsaio> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = texto(pedido.contaId)
  if (!contaId) return recusa('conta_ausente')

  const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? '')?.[1]?.trim()
  if (!jwt) return recusa('sem_sessao')

  const acao = lerAcao(pedido.acao)
  if (!acao) return recusa('acao_invalida')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_ENSAIAM.has(papel)) return recusa('papel_insuficiente')

    return acao === 'abrir'
      ? await abrir(pedido, contaId, usuario.id, porta, opcoes.agora ?? (() => new Date()))
      : await encerrar(pedido, contaId, porta)
  } catch {
    return recusa('falha_interna')
  }
}

async function abrir(
  pedido: PedidoDaBorda,
  contaId: string,
  autorId: string,
  porta: PortaDoEnsaio,
  agora: () => Date,
): Promise<RespostaDoEnsaio> {
  const proposito = lerProposito(pedido.proposito)
  if (!proposito) return recusa('proposito_invalido')

  const modo = lerModo(pedido.modo)
  if (!modo) return recusa('modo_invalido')

  // Só o id viaja e só o id fica gravado. O contexto do perfil sai do
  // catálogo e do banco, pela mesma regra da ligação real
  // (`_shared/agente/abertura-da-chamada.ts`): aceitar nome ou contexto do
  // navegador seria um segundo caminho de contexto.
  const perfil = lerIdDoPerfil(pedido.perfil)
  if (!perfil) return recusa('perfil_invalido')

  // Conta sem agente e agente sem publicação levam a lugares diferentes: a
  // primeira precisa montar a Sarah, a segunda só publicar.
  if (!(await porta.contaTemAgente(contaId))) return recusa('sem_agente')

  const publicacao = await porta.publicacaoDoProposito(contaId, proposito)
  // Sem agente no provedor não há contra o que ensaiar. Criar um temporário
  // seria contornar a publicação, e pôr no ar um texto que ninguém publicou.
  if (!publicacao?.provider_agent_id) return recusa('sem_publicacao')

  const sessao = await porta.pedirSessaoAssinada(publicacao.provider_agent_id)
  if (!sessao.ok) {
    return recusa(sessao.codigo === 'sem_credencial' ? 'sem_credencial_de_voz' : 'provedor_indisponivel')
  }
  const urlAssinada = texto(sessao.urlAssinada)
  if (!urlAssinada) return recusa('resposta_ilegivel')

  const credenciais = sessao.credencial ? [sessao.credencial] : []
  // Primeira passagem antes de criar a chamada: a URL é o único texto que vem
  // do provedor, e um provedor que ecoasse a chave nela deixaria, depois da
  // recusa, um ensaio pendurado sem conversa.
  if (vazou({ urlAssinada }, credenciais)) return recusa('falha_interna')

  // A chamada só nasce depois de a sessão existir: criada antes, uma falha do
  // provedor deixaria um ensaio pendurado que nunca teve conversa.
  const criado = await porta.abrirEnsaio({
    contaId,
    proposito,
    modo,
    persona: { perfil },
    criadoPor: autorId,
    publicacaoId: publicacao.id,
    versaoDoPlaybookId: publicacao.playbook_version_id,
  })

  const contexto = await porta.contextoDaAbertura(contaId, criado.chamadaId)
  const contextoDoLead = perfilPeloId(perfil)?.contexto ?? ''
  const abertura = contexto
    ? montarAbertura({ ...contexto, contextoDoLead })
    : { variaveis: variaveisDaChamada(null, contextoDoLead), primeiraFala: null }

  const corpo: CorpoDoEnsaio = {
    ok: true,
    passo: 'aberto',
    ensaioId: criado.ensaioId,
    chamadaId: criado.chamadaId,
    publicacaoId: publicacao.id,
    urlAssinada,
    modo,
    somenteTexto: modo === 'text',
    expiraEm: new Date(agora().getTime() + VALIDADE_DA_SESSAO_MS).toISOString(),
    consomeCredito: MODOS_QUE_CONSOMEM_CREDITO.has(modo),
    variaveis: { ...abertura.variaveis, call_id: criado.chamadaId },
    primeiraFala: abertura.primeiraFala,
  }
  // A rede de segurança do corpo inteiro, imediatamente antes de responder.
  if (vazou(corpo, credenciais)) return recusa('falha_interna')

  return { status: 201, corpo }
}

/**
 * A conversa é do agente do ensaio. Sem agente esperado (publicação apagada) ou
 * sem agente na resposta, não há como conferir, e a leitura segue como antes.
 */
function conversaDoAgente(conversa: ConversaDoProvedor, esperado: string | null): boolean {
  const lido = conversa.agenteId?.trim()
  return !esperado || !lido || lido === esperado
}

function vazou(corpo: unknown, credenciais: readonly string[]): boolean {
  try {
    conferirQueNaoVazou(corpo, credenciais, 'a sessão de ensaio carregava a chave do provedor')
    return false
  } catch {
    return true
  }
}

async function encerrar(
  pedido: PedidoDaBorda,
  contaId: string,
  porta: PortaDoEnsaio,
): Promise<RespostaDoEnsaio> {
  const ensaioId = texto(pedido.ensaioId)
  if (!ensaioId) return recusa('ensaio_ausente')

  const ensaio = await porta.lerEnsaio(contaId, ensaioId)
  if (!ensaio) return recusa('ensaio_inexistente')
  if (ensaio.finished_at !== null) return recusa('ensaio_encerrado')

  // A transcrição vem do provedor, e não do navegador: ver o cabeçalho. O
  // identificador gravado vence o que o navegador mandou, e a conversa só
  // conta se o provedor disser que quem a conduziu foi o agente deste ensaio:
  // um identificador velho ou de outra aba traria a transcrição de outro
  // agente para a ficha — e dela para a revisão da conta.
  const conversaId = ensaio.provider_conversation_id ?? texto(pedido.conversaId)
  const lida = conversaId ? await porta.buscarConversa(conversaId) : null
  const conversa = lida && conversaDoAgente(lida, ensaio.provider_agent_id ?? null) ? lida : null

  const encerrado = await porta.encerrarEnsaio({
    ensaioId,
    // Conversa que o provedor não devolveu vira transcrição vazia, e não
    // impede o fechamento: um ensaio que ficasse aberto para sempre porque a
    // leitura falhou seria pior do que um encerrado sem transcrição — e a
    // ficha já sabe dizer "sem conversa".
    transcricao: conversa
      ? { turns: conversa.turnos.map((turno) => ({ role: turno.quem, text: turno.texto })) }
      : {},
    conversaId,
    duracaoSeg: conversa?.duracaoSeg ?? null,
  })
  if (!encerrado) return recusa('ensaio_encerrado')

  return {
    status: 200,
    corpo: {
      ok: true,
      passo: 'encerrado',
      ensaioId,
      chamadaId: ensaio.call_id,
      turnos: conversa?.turnos.length ?? 0,
    },
  }
}

function lerAcao(valor: unknown): AcaoDoEnsaio | null {
  return typeof valor === 'string' && (ACOES as readonly string[]).includes(valor)
    ? (valor as AcaoDoEnsaio)
    : null
}

function lerProposito(valor: unknown): Proposito | null {
  return typeof valor === 'string' && (PROPOSITOS as readonly string[]).includes(valor)
    ? (valor as Proposito)
    : null
}

function lerModo(valor: unknown): ModoDoEnsaio | null {
  return typeof valor === 'string' && (MODOS as readonly string[]).includes(valor)
    ? (valor as ModoDoEnsaio)
    : null
}

function texto(valor: unknown): string | null {
  const limpo = typeof valor === 'string' ? valor.trim() : ''
  return limpo === '' ? null : limpo
}

function recusa(motivo: MotivoDoEnsaio): RespostaDoEnsaio {
  const caminho = CAMINHO_DA_RECUSA[motivo]
  return {
    status: STATUS[motivo],
    corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo], ...(caminho ? { caminho } : {}) },
  }
}
