// call-init: a única fonte de contexto da chamada (T-14, T-25, RF-108, RF-408).
//
// O webhook de início dispara nos dois sentidos, e nos dois ele responde a
// mesma pergunta: **quem é a pessoa do outro lado, e o que a Sarah diz
// primeiro?** O que muda entre os dois é o que existe antes da pergunta.
//
// **FONTE ÚNICA** (T-25). `call-place` manda `{ call_id }` e nada além, e todo o
// resto — nome do lead, identidade da conta, política de gravação, propósito —
// é resolvido aqui, pelo `call_id`. Duas fontes de contexto divergem no dia em
// que uma das duas mudar, e a que o agente falaria em voz alta seria a
// congelada no momento da discagem: o lead que trocou de nome entre a fila e a
// ligação seria chamado pelo nome antigo.
//
// **NA ENTRADA, É AQUI QUE A CHAMADA NASCE** (T-14, RF-108). Ligação recebida
// não passou por `call-place`, e portanto não tem linha em `calls`. Sem ela, a
// primeira ferramenta que a Sarah chamasse devolveria "conversa inexistente" —
// as sete resolvem a chamada por `provider_conversation_id`, e o índice único
// que elas usam não teria o que encontrar. Então a ordem da entrada é: linha
// pelo número chamado, lead pelo número de quem ligou (criado com
// `source='inbound'` quando não existe), e **`calls` gravada** com
// `direction='inbound'` antes de qualquer fala.
//
// **A MESMA CONVERSA DUAS VEZES NÃO CRIA DUAS CHAMADAS.** O provedor reenvia
// webhook, e reenviar é o comportamento normal dele. Na saída, a linha já
// existe e o segundo pedido não escreve nada — `provider_conversation_id` já
// está preenchido. Na entrada, quem segura é o índice único global de
// `calls.provider_conversation_id`: o insert em conflito devolve a linha que já
// estava lá, e a resposta sai igual à primeira.
//
// **A ASSINATURA VEM ANTES DE TUDO**, inclusive antes de ler o corpo. Quem
// chega aqui não tem sessão: é o provedor, de servidor para servidor, no meio
// de uma ligação. A credencial é a assinatura sobre o corpo cru
// (`_shared/provedor/assinatura-de-webhook.ts`), e ausente, malformada, fora da
// janela e inválida saem pela **mesma** porta. Nenhuma delas consulta o banco:
// sem isso, um pedido forjado viraria uma sonda de quais números a instalação
// atende, medida pelo tempo da resposta.
//
// **O WEBHOOK DE INÍCIO DA ELEVENLABS NÃO É ASSINADO.** A credencial que ele
// traz é o cabeçalho que `agent-publish` escreveu na configuração do workspace
// (`x-sarah-webhook-secret`), com o segredo derivado da conta indicada em
// `?conta=` (`_shared/provedor/webhooks-da-conta.ts`). Conferido ele, o pedido
// só alcança chamada e linha **daquela** conta: chamada ou número de outra
// saem pelo mesmo 404 do que não existe. A assinatura da instalação continua
// valendo, sem restrição de conta, para quem configurou o webhook à mão.
//
// **A REUNIÃO EM JOGO VAI VAZIA, E A RAZÃO É A FATIA.** `meetings` é da F5, e
// não existe banco nenhum a consultar na F2. O campo existe no contrato desde
// agora para que a F5 o preencha sem mudar a forma da resposta — acrescentá-lo
// depois faria quem já lê o contexto ter que aprender uma segunda forma.
//
// **A PRIMEIRA FALA É ESCOLHIDA AQUI, E NÃO NA PUBLICAÇÃO.** A publicação
// carrega a primeira fala da conta sem os marcadores da chamada
// (`MARCADORES_DA_CHAMADA` do compilador): resolvê-los lá congelaria o nome de
// um lead na publicação e a Sarah chamaria todo mundo por ele. Aqui ela é
// interpolada com o lead desta chamada (`_shared/agente/abertura-da-chamada.ts`,
// a mesma regra que `call-place` e o ensaio usam), e o aviso de gravação sai junto —
// **só quando a conta tem a gravação ligada**. Com ela desligada, a abertura não
// promete gravação nenhuma, porque prometer o que não acontece é a única
// mentira que o produto não pode dizer em voz alta.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoContexto`, implementada em `index.ts` e dublada no teste.

import { resolverFusoDoTelefone } from '../_shared/ddd.ts'
import { perfilPeloId } from '../_shared/ensaio/perfis-de-lead.ts'
import type { Proposito } from '../_shared/playbook/camada-um.ts'
import { conferirAssinaturaDoProvedor } from '../_shared/provedor/assinatura-de-webhook.ts'
import { segredoDoInicioConfere } from '../_shared/provedor/webhooks-da-conta.ts'
import type { ChavesDoServidor } from '../_shared/tools/segredo.ts'
import { falaDeAbertura, montarAbertura } from '../_shared/agente/abertura-da-chamada.ts'
import { contextoDaReuniao, propositoDeReuniao, type ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { interpolarFala } from '../_shared/agente/compilador.ts'

import { lerPedidoDoProvedor, type PedidoDeContexto } from './formato-do-provedor.ts'
import { MENSAGENS, STATUS, type MotivoDoInicio } from './respostas.ts'

/**
 * O propósito de uma ligação que chega sem publicação conhecida.
 *
 * `calls.purpose` não aceita nulo, e a ligação recebida não foi disparada por
 * ninguém que pudesse ter escolhido um propósito. `discovery` é o que uma
 * ligação de fora é: primeiro contato. Quando o provedor diz qual agente
 * atendeu, o propósito vem da publicação dele, que é a verdade — este padrão só
 * vale quando nem isso chegou.
 */
export const PROPOSITO_DA_ENTRADA: Proposito = 'discovery'

/** A origem que o lead da ligação recebida carrega (RF-108). */
export const ORIGEM_DA_ENTRADA = 'inbound'

/**
 * O prefixo da chave de idempotência da ligação recebida.
 *
 * **Não vem de `_shared/chamada/idempotencia.ts` de propósito**: as seis fontes
 * de lá são fontes de *discagem*, e uma ligação recebida não foi discada por
 * ninguém. Escrevê-la como sétima fonte faria `lerChave` prometer que existe
 * uma rotina `inbound` que reprograma tentativa, e não existe.
 *
 * O que realmente impede a segunda linha aqui não é esta chave, e sim o índice
 * único global de `calls.provider_conversation_id`. A chave existe porque
 * `calls.idempotency_key` não aceita nulo, e ela é derivada da conversa pelo
 * mesmo motivo: duas conversas nunca colidem, e a mesma conversa sempre forma a
 * mesma chave.
 */
export const PREFIXO_DA_ENTRADA = 'inbound'

/** O formato de `phone_lines.e164` e de `calls.to_number`. */
const FORMATO_E164 = /^\+[1-9][0-9]{7,14}$/

// O que a camada de dados devolve ------------------------------------------------

/** A chamada de saída, que `call-place` já gravou. */
export interface ChamadaEmCurso {
  readonly id: string
  readonly account_id: string
  /** `rehearsal` é o ensaio (T-16), que passa por aqui pelo mesmo `call_id`. */
  readonly direction: 'outbound' | 'inbound' | 'rehearsal'
  readonly lead_id: string | null
  readonly purpose: Proposito
  readonly provider_conversation_id: string | null
}

/** A linha que recebeu a ligação. */
export interface LinhaRecebida {
  readonly id: string
  readonly account_id: string
  readonly e164: string
}

/** A publicação que atendeu, e o propósito que ela carrega (T-01). */
export interface PublicacaoQueAtende {
  readonly id: string
  readonly purpose: Proposito
}

/** A versão publicada do roteiro, que a chamada carimba (RF-308). */
export interface VersaoDoPlaybook {
  readonly id: string
}

/** O lead, no que a fala precisa dele. */
export interface LeadDaChamada {
  readonly id: string
  readonly name: string | null
  readonly company: string | null
  readonly city: string | null
  readonly state: string | null
}

/** O lead a gravar, com as chaves da tabela — é o que `registrar_lead` recebe. */
export interface LeadDaEntrada {
  readonly name: string | null
  readonly phone_e164: string
  readonly city: string | null
  readonly state: string | null
  readonly timezone: string | null
  readonly source: string
  readonly source_ref: string | null
}

/** O que `registrar_lead` devolveu. Código, nunca frase. */
export interface LeadGravado {
  readonly leadId: string
  readonly resultado: 'criado' | 'ignorado' | 'atualizado'
}

/** O que `calls` guarda quando a ligação recebida nasce, com as chaves da tabela. */
export interface LinhaDeChamadaRecebida {
  readonly account_id: string
  readonly lead_id: string | null
  readonly phone_line_id: string | null
  readonly agent_publication_id: string | null
  readonly playbook_version_id: string | null
  readonly purpose: Proposito
  readonly direction: 'inbound'
  readonly status: 'in_progress'
  readonly provider_conversation_id: string
  readonly provider_call_sid: string | null
  readonly from_number: string
  readonly to_number: string
  readonly idempotency_key: string
}

/**
 * O resultado da gravação. `criada` é falso quando o índice único de
 * `provider_conversation_id` recusou o insert e a porta devolveu a linha que já
 * estava lá — que é o caminho do webhook reenviado.
 */
export interface ResultadoDaGravacao {
  readonly criada: boolean
  readonly chamada: ChamadaEmCurso
}

/** A identidade da Sarah daquela conta, como `agents` a guarda. */
export interface IdentidadeDaConta {
  readonly nome: string
  readonly empresa: string
  /** `agents.first_message`. Nula é o padrão da camada 1. */
  readonly primeiraFala: string | null
}

/** A política de gravação da conta (`account_settings`, RF-806). */
export interface PoliticaDaGravacao {
  readonly gravacaoLigada: boolean
  /** `recording_notice_text`. Nulo é a frase da camada 1. */
  readonly avisoDeGravacao: string | null
}

/**
 * A camada de dados. `index.ts` a implementa sobre o cliente do Supabase com a
 * chave de serviço; o teste a dubla e **conta as chamadas** — sem a contagem,
 * uma versão que gravasse uma segunda linha em `calls` a cada webhook reenviado
 * passaria verde em qualquer asserção sobre a resposta.
 */
export interface PortaDoContexto {
  /** A chamada que `call-place` gravou, pelo `call_id` que viajou. */
  chamadaDeSaida(chamadaId: string): Promise<ChamadaEmCurso | null>
  /** Preenche `provider_conversation_id` numa chamada que ainda não o tinha. */
  marcarConversa(chamadaId: string, conversaId: string): Promise<void>
  /** A linha desta instalação com este número, ou null. */
  linhaPeloNumero(e164: string): Promise<LinhaRecebida | null>
  publicacaoPeloAgenteDoProvedor(
    contaId: string,
    agenteDoProvedorId: string,
  ): Promise<PublicacaoQueAtende | null>
  publicacaoDoProposito(contaId: string, proposito: Proposito): Promise<PublicacaoQueAtende | null>
  versaoPublicadaDoPlaybook(contaId: string, proposito: Proposito): Promise<VersaoDoPlaybook | null>
  /** Chama `registrar_lead` com `p_ao_duplicar = 'ignorar'`. */
  registrarLead(contaId: string, lead: LeadDaEntrada): Promise<LeadGravado>
  leadDaChamada(contaId: string, leadId: string): Promise<LeadDaChamada | null>
  /** Insere em `calls`; conflito de conversa devolve a linha que já existe. */
  gravarChamadaRecebida(linha: LinhaDeChamadaRecebida): Promise<ResultadoDaGravacao>
  identidadeDaConta(contaId: string): Promise<IdentidadeDaConta | null>
  politicaDaConta(contaId: string): Promise<PoliticaDaGravacao>
  /**
   * O id do perfil simulado do ensaio daquela chamada
   * (`rehearsals.persona_profile.perfil`). Nulo quando a chamada não tem ensaio.
   */
  perfilDoEnsaio(chamadaId: string): Promise<string | null>
  /**
   * A reunião em jogo numa chamada de lembrete ou de resgate
   * (`reuniao_em_jogo`, US-194). Opcional: sem ela, o contexto do lead vai
   * vazio, como antes da F6.
   */
  reuniaoDaChamada?(chamadaId: string): Promise<ReuniaoEmJogo | null>
}

// O que sai ----------------------------------------------------------------------

/** O lead, como o contexto o conta. Nulo quando a ligação não tem um. */
export interface LeadDoContexto {
  readonly id: string
  readonly nome: string | null
  readonly empresa: string | null
  readonly cidade: string | null
  readonly estado: string | null
}

/**
 * A reunião em jogo. Sempre nula na F2, e o campo existe assim mesmo: `meetings`
 * é da F5, e acrescentar o campo depois faria quem já lê o contexto aprender uma
 * segunda forma da resposta (RF-408).
 */
export type ReuniaoDoContexto = null

export interface ContextoDaChamada {
  readonly ok: true
  readonly chamadaId: string
  readonly contaId: string
  readonly proposito: Proposito
  readonly sentido: 'outbound' | 'inbound' | 'rehearsal'
  /** Verdadeiro quando esta chamada nasceu agora, aqui. Só na entrada. */
  readonly chamadaCriada: boolean
  readonly lead: LeadDoContexto | null
  readonly reuniao: ReuniaoDoContexto
  /** A primeira fala, já com o lead desta chamada dentro. */
  readonly primeiraFala: string
  /** O aviso de gravação, ou nulo quando a conta desligou a gravação. */
  readonly avisoDeGravacao: string | null
  /** Os marcadores que o prompt publicado ainda tem por resolver (T-25). */
  readonly variaveis: Readonly<Record<string, string>>
}

export interface RecusaDoInicio {
  readonly ok: false
  readonly motivo: MotivoDoInicio
  readonly mensagem: string
}

export interface RespostaDoInicio {
  readonly status: number
  readonly corpo: ContextoDaChamada | RecusaDoInicio
}

export interface PedidoDaBorda {
  readonly metodo: string
  /** O corpo cru, byte a byte como chegou. É ele que a assinatura cobre. */
  readonly corpo: string
  /** O cabeçalho da assinatura do provedor, quando houver. */
  readonly assinatura: string | null
  /**
   * A conta de `?conta=`, já conferida quanto à forma
   * (`_shared/provedor/webhooks-da-conta.ts`). Só escolhe o segredo a conferir.
   */
  readonly contaDoEndereco?: string | null
  /** O cabeçalho `x-sarah-webhook-secret`, quando houver. */
  readonly segredoDoInicio?: string | null
}

export interface OpcoesDoInicio {
  /**
   * O segredo de webhook da instalação. Ausente **recusa** todo pedido, em vez
   * de aceitar: função que atende ligação sem saber conferir quem a chamou é
   * pior do que função que não atende.
   */
  readonly segredoDoWebhook: string | null
  /** O segredo de antes da rotação, quando há uma em curso (R-07). */
  readonly segredoAnterior?: string | null
  /** O carimbo da rotação, em segundos. Nulo desliga o segredo anterior. */
  readonly rotacionadoEmSegundos?: number | null
  /** O relógio de quem confere, em segundos desde a época. */
  readonly agoraEmSegundos: number
  /**
   * As chaves do servidor (`SARAH_TOOL_SERVER_KEY` e a anterior), de onde sai o
   * segredo do início de cada conta. Ausentes, só a assinatura da instalação
   * vale.
   */
  readonly chavesDoServidor?: ChavesDoServidor | null
}

/**
 * Quem o pedido provou ser. `conta` é a conta cujo segredo conferiu, e aí o
 * pedido só alcança chamada e linha dela; nula é a assinatura da instalação,
 * que vale para todas, como sempre valeu.
 */
type Autenticacao = { readonly ok: false } | { readonly ok: true; readonly conta: string | null }

/**
 * O segredo da conta primeiro, a assinatura da instalação depois. Nenhum dos
 * dois caminhos lê banco: o segredo do início é derivado, e a assinatura usa a
 * variável da instalação. Qualquer combinação que não confira sai pelo mesmo
 * `false`, e quem chama devolve o mesmo 401.
 */
async function autenticar(pedido: PedidoDaBorda, opcoes: OpcoesDoInicio): Promise<Autenticacao> {
  const conta = pedido.contaDoEndereco ?? null
  if (conta && opcoes.chavesDoServidor && pedido.segredoDoInicio) {
    const confere = await segredoDoInicioConfere({
      cabecalho: pedido.segredoDoInicio,
      contaId: conta,
      chaves: opcoes.chavesDoServidor,
      agora: () => opcoes.agoraEmSegundos * 1000,
    })
    if (confere) return { ok: true, conta }
  }

  const assinada = await conferirAssinaturaDoProvedor({
    segredo: opcoes.segredoDoWebhook,
    segredoAnterior: opcoes.segredoAnterior ?? null,
    rotacionadoEmSegundos: opcoes.rotacionadoEmSegundos ?? null,
    corpo: pedido.corpo,
    assinatura: pedido.assinatura,
    agoraEmSegundos: opcoes.agoraEmSegundos,
  })
  return assinada ? { ok: true, conta: null } : { ok: false }
}

/** Erro interno com motivo próprio, para a recusa sair com a frase certa. */
class RecusaDoPedido extends Error {
  readonly motivo: MotivoDoInicio

  constructor(motivo: MotivoDoInicio) {
    super(motivo)
    this.motivo = motivo
  }
}

/**
 * Monta o contexto da chamada. Nunca levanta: exceção da camada de dados vira
 * `falha_interna`, porque há alguém com o telefone no ouvido e o provedor
 * precisa de uma resposta, não de um stack trace.
 */
export async function iniciarChamada(
  pedido: PedidoDaBorda,
  porta: PortaDoContexto,
  opcoes: OpcoesDoInicio,
): Promise<RespostaDoInicio> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  // Antes do corpo, antes do banco, antes de tudo.
  const autenticacao = await autenticar(pedido, opcoes)
  if (!autenticacao.ok) return recusa('assinatura_invalida')

  let corpo: unknown
  try {
    corpo = JSON.parse(pedido.corpo)
  } catch {
    return recusa('corpo_invalido')
  }

  const entrada = lerPedidoDoProvedor(corpo)
  if (!entrada) return recusa('corpo_invalido')

  try {
    // O sentido se descobre pela presença do `call_id`, e não por um campo que
    // o provedor mande dizendo qual é: só a saída passou por `call-place`, e é
    // `call-place` quem põe a variável. Confiar num campo declarado faria uma
    // ligação recebida se dizer de saída e ir procurar uma linha que não existe.
    const contexto = entrada.chamadaId
      ? await contextoDaSaida(entrada.chamadaId, entrada, porta, autenticacao.conta, opcoes.agoraEmSegundos * 1000)
      : await contextoDaEntrada(entrada, porta, autenticacao.conta)
    return { status: 200, corpo: contexto }
  } catch (erro) {
    if (erro instanceof RecusaDoPedido) return recusa(erro.motivo)
    return recusa('falha_interna')
  }
}

// A saída -------------------------------------------------------------------------

async function contextoDaSaida(
  chamadaId: string,
  entrada: PedidoDeContexto,
  porta: PortaDoContexto,
  contaProvada: string | null,
  agoraMs: number,
): Promise<ContextoDaChamada> {
  const chamada = await porta.chamadaDeSaida(chamadaId)
  if (!chamada) throw new RecusaDoPedido('chamada_desconhecida')
  // Chamada de outra conta é o mesmo 404 da inexistente: o segredo de uma conta
  // não abre a ficha do lead de outra, e a resposta não conta que ela existe.
  if (contaProvada !== null && chamada.account_id !== contaProvada) {
    throw new RecusaDoPedido('chamada_desconhecida')
  }

  // Só preenche o que está vazio. Sobrescrever com uma conversa diferente
  // deixaria a chamada anterior sem identificador nenhum, e as ferramentas dela
  // passariam a achar esta — que é escrever na chamada errada.
  if (entrada.conversaId && !chamada.provider_conversation_id) {
    await porta.marcarConversa(chamada.id, entrada.conversaId)
  }

  const lead = chamada.lead_id
    ? await porta.leadDaChamada(chamada.account_id, chamada.lead_id)
    : null

  // O ensaio chega por aqui com o mesmo `call_id` da ligação de verdade, e o
  // perfil simulado é resolvido pela chamada, como o lead (US-112, T-25). O
  // navegador não manda contexto nenhum: se mandasse, seria um segundo caminho.
  const ensaio = chamada.direction === 'rehearsal'
  const perfil = ensaio ? perfilPeloId(await porta.perfilDoEnsaio(chamada.id)) : null

  // Lembrete e resgate falam de uma reunião que já existe (US-194): o motivo
  // da ligação, com o horário no fuso do lead, vai no contexto do lead, que o
  // roteiro manda dizer depois da abertura. O ensaio segue com o perfil dele.
  const reuniao =
    !ensaio && propositoDeReuniao(chamada.purpose) && porta.reuniaoDaChamada
      ? await porta.reuniaoDaChamada(chamada.id)
      : null
  const daReuniao = reuniao ? contextoDaReuniao(chamada.purpose, reuniao, new Date(agoraMs).toISOString()) : null

  return await montarContexto(
    {
      chamadaId: chamada.id,
      contaId: chamada.account_id,
      proposito: chamada.purpose,
      sentido: ensaio ? 'rehearsal' : 'outbound',
      chamadaCriada: false,
      lead,
      contextoDoLead: perfil?.contexto ?? daReuniao ?? '',
    },
    porta,
  )
}

// A entrada -----------------------------------------------------------------------

async function contextoDaEntrada(
  entrada: PedidoDeContexto,
  porta: PortaDoContexto,
  contaProvada: string | null,
): Promise<ContextoDaChamada> {
  const conversaId = entrada.conversaId
  if (!conversaId) throw new RecusaDoPedido('conversa_ausente')

  const chamado = entrada.numeroChamado ?? ''
  if (!FORMATO_E164.test(chamado)) throw new RecusaDoPedido('linha_desconhecida')

  const linha = await porta.linhaPeloNumero(chamado)
  if (!linha) throw new RecusaDoPedido('linha_desconhecida')
  // Número de outra conta não nasce chamada na conta que o segredo provou.
  if (contaProvada !== null && linha.account_id !== contaProvada) {
    throw new RecusaDoPedido('linha_desconhecida')
  }

  const contaId = linha.account_id
  const publicacao = await escolherPublicacao(contaId, entrada.agenteDoProvedorId, porta)
  const proposito = publicacao?.purpose ?? PROPOSITO_DA_ENTRADA
  const versao = await porta.versaoPublicadaDoPlaybook(contaId, proposito)

  const lead = await resolverLeadDeQuemLigou(contaId, entrada.numeroDeQuemLigou, porta)

  const gravacao = await porta.gravarChamadaRecebida({
    account_id: contaId,
    lead_id: lead?.id ?? null,
    phone_line_id: linha.id,
    agent_publication_id: publicacao?.id ?? null,
    playbook_version_id: versao?.id ?? null,
    purpose: proposito,
    direction: 'inbound',
    // A conversa está acontecendo enquanto este webhook é respondido: nascer
    // `queued` faria a varredura de recuperação procurar uma ligação perdida
    // que está no ar.
    status: 'in_progress',
    provider_conversation_id: conversaId,
    provider_call_sid: entrada.chamadaDaTelefoniaId,
    from_number: entrada.numeroDeQuemLigou ?? '',
    to_number: linha.e164,
    idempotency_key: `${PREFIXO_DA_ENTRADA}:${conversaId}`,
  })

  return await montarContexto(
    {
      chamadaId: gravacao.chamada.id,
      contaId,
      proposito: gravacao.chamada.purpose,
      sentido: 'inbound',
      chamadaCriada: gravacao.criada,
      lead,
      contextoDoLead: '',
    },
    porta,
  )
}

/**
 * Qual publicação atendeu. O provedor diz qual agente tocou, e é ele que sabe:
 * são quatro publicações por conta, uma por propósito (T-01), e adivinhar pelo
 * número chamado daria o propósito errado sempre que a conta usasse a mesma
 * linha em dois deles.
 */
async function escolherPublicacao(
  contaId: string,
  agenteDoProvedorId: string | null,
  porta: PortaDoContexto,
): Promise<PublicacaoQueAtende | null> {
  if (agenteDoProvedorId) {
    const publicacao = await porta.publicacaoPeloAgenteDoProvedor(contaId, agenteDoProvedorId)
    if (publicacao) return publicacao
  }
  return await porta.publicacaoDoProposito(contaId, PROPOSITO_DA_ENTRADA)
}

/**
 * O lead de quem ligou (RF-108). `registrar_lead` com `ignorar` resolve e cria
 * na mesma ida: ler antes de escrever deixaria uma janela entre a leitura e o
 * insert, e duas ligações do mesmo número chegando juntas passariam por ela.
 *
 * Cidade, estado e fuso saem do DDD, como nos outros dois caminhos que criam
 * lead (`lead-intake` e `leads-import`): sem eles, a janela de discagem do
 * RF-407 trataria este lead pelo fuso da conta, e o retorno sairia na hora
 * errada para quem mora em outro.
 */
async function resolverLeadDeQuemLigou(
  contaId: string,
  numero: string | null,
  porta: PortaDoContexto,
): Promise<LeadDaChamada | null> {
  if (!numero || !FORMATO_E164.test(numero)) return null

  const local = resolverFusoDoTelefone(numero)
  const gravado = await porta.registrarLead(contaId, {
    name: null,
    phone_e164: numero,
    city: local?.cidade ?? null,
    state: local?.estado ?? null,
    timezone: local?.fuso ?? null,
    source: ORIGEM_DA_ENTRADA,
    source_ref: null,
  })

  return await porta.leadDaChamada(contaId, gravado.leadId)
}

// A fala ---------------------------------------------------------------------------

interface Miolo {
  readonly chamadaId: string
  readonly contaId: string
  readonly proposito: Proposito
  readonly sentido: 'outbound' | 'inbound' | 'rehearsal'
  readonly chamadaCriada: boolean
  readonly lead: LeadDaChamada | null
  /** O que a Sarah sabe do lead antes de falar. Hoje só o ensaio o preenche. */
  readonly contextoDoLead: string
}

async function montarContexto(miolo: Miolo, porta: PortaDoContexto): Promise<ContextoDaChamada> {
  const identidade = await porta.identidadeDaConta(miolo.contaId)
  if (!identidade) throw new RecusaDoPedido('conta_sem_agente')

  const politica = await porta.politicaDaConta(miolo.contaId)

  // Todas as variáveis que o prompt publicado cita vão, mesmo vazias: a que
  // faltasse cairia no valor inicial da publicação, e é melhor a resposta
  // dizer isso por escrito do que depender dele. Vai sempre também o contexto
  // do lead, mesmo vazio: a forma da resposta é uma só nos três sentidos, e o
  // ensaio não pode ser o único que a tem (US-112).
  const abertura = montarAbertura({
    identidade,
    politica,
    lead: miolo.lead
      ? { nome: miolo.lead.name, empresa: miolo.lead.company, cidade: miolo.lead.city }
      : null,
    contextoDoLead: miolo.contextoDoLead,
  })

  return {
    ok: true,
    chamadaId: miolo.chamadaId,
    contaId: miolo.contaId,
    proposito: miolo.proposito,
    sentido: miolo.sentido,
    chamadaCriada: miolo.chamadaCriada,
    lead: miolo.lead
      ? {
          id: miolo.lead.id,
          nome: miolo.lead.name,
          empresa: miolo.lead.company,
          cidade: miolo.lead.city,
          estado: miolo.lead.state,
        }
      : null,
    reuniao: null,
    primeiraFala: abertura.primeiraFala,
    avisoDeGravacao: abertura.avisoDeGravacao,
    variaveis: abertura.variaveis,
  }
}

/** A abertura padrão; a regra mora em `_shared/agente/abertura-da-chamada.ts`. */
export { falaDeAbertura }

/**
 * A fala com os marcadores trocados pelos valores. Marcador sem valor some,
 * com a frase refeita em volta, como na publicação: é texto dito em voz alta.
 */
export function interpolar(fala: string, valores: Readonly<Record<string, string>>): string {
  return interpolarFala(fala, valores)
}

function recusa(motivo: MotivoDoInicio): RespostaDoInicio {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
