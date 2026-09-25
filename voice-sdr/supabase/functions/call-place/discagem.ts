// call-place: o caminho único de discagem (T-04, T-05, T-07, T-25, RF-407).
//
// Toda ligação que sai desta instalação passa por aqui. Não é figura de
// linguagem nem convenção de equipe: `guard_dial` só tem `execute` para
// `service_role`, `calls` não tem política de escrita pelo cliente, e o freio
// de emergência de RF-011 só é verificável porque existe um lugar só onde ele é
// lido antes de discar. Um segundo caminho de discagem não tornaria o freio
// mais fraco — tornaria o critério de aceite da F2 indemonstrável.
//
// **AUTENTICAÇÃO DUPLA**, que é a correção de T-04. Cinco rotinas produtoras
// (`cron-speed-to-lead`, `cron-meeting-reminder`, `cron-meeting-noshow`,
// `cron-cadence`, `cron-campaign-dispatch`) discam sem usuário nenhum. Com só
// JWT, ou elas discariam por fora e o caminho único acabaria, ou não discariam.
// Por isso há dois portões, e eles são exclusivos:
//
// - **Sessão de usuário**: `actor='user'`, `actor_id=auth.uid()`, papel mínimo
//   de `operator`, e a fonte **precisa** ser `manual`. Gente não dispara
//   cadência.
// - **Segredo interno de serviço**: `actor='system'`, `actor_id` nulo, e a
//   fonte **não** pode ser `manual`. Rotina não assina discagem manual com o
//   nome de ninguém.
//
// As duas travessias são recusa, e não normalização: aceitar `manual` vindo de
// rotina faria uma ligação automática aparecer na auditoria como clique de
// alguém que não estava lá.
//
// **A ORDEM**, escrita porque é ela que o teste segura:
//
// 1. autentica, valida o pedido e forma a chave de idempotência (US-057);
// 2. resolve a conta (fuso) e o lead (número e fuso) — é a política;
// 3. escolhe a publicação do propósito (T-01) e a versão publicada do roteiro;
// 4. chama `guard_dial` pela borda de `_shared/discagem/guarda.ts`;
// 5. grava `calls` com `status='queued'`, **antes** de tocar no provedor;
// 6. dispara no provedor e grava o identificador da chamada.
//
// **DIVERGÊNCIA DECLARADA do critério de aceite**, que pede a publicação
// escolhida depois de gravar `calls`: ela é escolhida **antes**. Propósito sem
// publicação é recusa nossa, e recusá-la depois do insert deixaria uma linha
// `queued` que nunca vai discar — exatamente a linha que `cron-call-recovery`
// existe para procurar. A leitura é barata e a escolha não depende de nada que
// a guarda produza; o que o critério protege — nenhuma chamada externa antes da
// recusa — continua valendo, e com uma linha a menos para alguém limpar.
//
// **O CONTEXTO VIAJA NO DISPARO** (revisão de T-25). A decisão original era
// mandar só `call_id` e deixar `call-init` resolver o resto, supondo que o
// webhook de início dispara também na saída. A documentação do provedor
// descreve o webhook de início para a ligação **recebida**; na saída, o que a
// conversa conhece é o `conversation_initiation_client_data` deste pedido. Com
// só `call_id` aqui, o nome do lead nunca chegava ao prompt da ligação de
// saída. Então o disparo leva todas as variáveis que o prompt cita e a
// primeira fala com o lead dentro, montadas por
// `_shared/agente/abertura-da-chamada.ts` — a mesma função que `call-init`
// usa, lendo o mesmo banco na mesma hora. Se o webhook de início também
// disparar, ele devolve o mesmo resultado, e o que vale é o dele.
//
// **FALHA DO PROVEDOR DEPOIS DO INSERT NÃO É DESFEITA**, e isso é escolha
// (T-07). A linha fica `queued`, sem `provider_call_sid`, e quem a resolve é
// `cron-call-recovery`. Apagá-la perderia o registro de que a tentativa
// existiu, e a chave de idempotência junto: a rotina que tentasse de novo em
// seguida discaria uma segunda vez, porque o único do banco não teria mais nada
// contra o que colidir.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDaDiscagem`, implementada em `index.ts` e dublada no teste.

import {
  montarAbertura,
  variaveisDaChamada,
  type IdentidadeDaAbertura,
  type PoliticaDaAbertura,
} from '../_shared/agente/abertura-da-chamada.ts'
import {
  guardarDiscagem,
  PASSOS_PULAVEIS,
  type AtorDaDiscagem,
  type DecisaoDaGuarda,
  type PassoPulavel,
  type PortaDeGuarda,
} from '../_shared/discagem/guarda.ts'
import {
  chaveDaTentativa,
  chaveDeDiscagem,
  ehFonte,
  type FonteDeDiscagem,
  type PedidoDeChave,
} from '../_shared/chamada/idempotencia.ts'
import { hashEmHexadecimal, hashesIguais } from '../_shared/hash-de-segredo.ts'
import { normalizarTelefone } from '../_shared/telefone.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import {
  eFalhaDoProvedor,
  traduzirErroDoProvedor,
  type MotivoDoProvedor,
} from '../_shared/provedor/erros.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  MENSAGENS,
  MENSAGENS_DO_ESTADO,
  STATUS,
  STATUS_DA_FALHA_DO_PROVEDOR,
  STATUS_DA_GUARDA,
  type EstadoDaDiscagem,
  type MotivoLocal,
} from './respostas.ts'

/** O provedor de voz, como `integrations-status/provedores.ts` o nomeia. */
export const PROVEDOR_DE_VOZ = 'voz'

/** A chave dele no cofre. */
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/**
 * Quem disca da tela. `viewer` fica de fora: ver o funil e fazer a conta gastar
 * uma ligação são coisas diferentes, e é a segunda que esta função faz.
 */
export const PAPEIS_QUE_DISCAM: ReadonlySet<string> = new Set(['owner', 'admin', 'operator'])

/** A fonte que uma sessão de usuário pode usar, e a única. */
export const FONTE_DE_GENTE: FonteDeDiscagem = 'manual'

/**
 * A variável de identificação que o disparo leva sempre (T-25): é por ela que
 * `call-init` e as ferramentas acham a chamada. As variáveis do prompt vão ao
 * lado dela, de `variaveisDaChamada`.
 */
export const VARIAVEIS_DINAMICAS = ['call_id'] as const

/** O cabeçalho do segredo interno de serviço (T-04). */
export const CABECALHO_INTERNO = 'x-internal-secret'

/** O que `calls` guarda quando a chamada nasce, com as chaves da tabela. */
export interface LinhaDeChamada {
  readonly account_id: string
  readonly lead_id: string | null
  readonly phone_line_id: string | null
  readonly agent_publication_id: string
  readonly playbook_version_id: string
  readonly purpose: Proposito
  readonly direction: 'outbound'
  readonly status: 'queued'
  readonly from_number: string | null
  readonly to_number: string
  readonly campaign_id: string | null
  readonly idempotency_key: string
}

/** A chamada como ela volta do banco, criada agora ou já existente. */
export interface ChamadaGravada {
  readonly id: string
  readonly status: string
  readonly provider_call_sid: string | null
}

/**
 * O resultado da gravação. `criada` é falso quando o único de
 * `(account_id, idempotency_key)` recusou o insert e a porta devolveu a linha
 * que já estava lá — que é o caminho de quem clicou duas vezes.
 */
export interface ResultadoDaGravacao {
  readonly criada: boolean
  readonly chamada: ChamadaGravada
}

/** A conta, no que a discagem precisa dela. */
export interface ContaDaDiscagem {
  readonly id: string
  /** `accounts.timezone`: o fuso de quem vai ler a recusa da guarda. */
  readonly timezone: string
}

/** O lead, no que a discagem precisa dele. */
export interface LeadDaDiscagem {
  readonly id: string
  readonly phone_e164: string | null
  readonly name: string | null
  /** `leads.company` e `leads.city`: as variáveis do prompt que o lead preenche. */
  readonly company?: string | null
  readonly city?: string | null
}

/** A publicação do propósito (T-01). Sem ela não há o que atender. */
export interface PublicacaoDoProposito {
  readonly id: string
  readonly provider_agent_id: string
}

/** A versão publicada do roteiro, que a chamada carimba (RF-308). */
export interface VersaoDoPlaybook {
  readonly id: string
}

/** A linha telefônica que a guarda escolheu, com o registro no provedor de voz. */
export interface LinhaTelefonica {
  readonly id: string
  readonly e164: string
  readonly provider_voice_id: string | null
}

/** O disparo, como o adaptador o manda ao provedor de voz. */
export interface PedidoDeDisparo {
  readonly contaId: string
  readonly chamadaId: string
  readonly providerAgentId: string
  /** O número de origem, como o provedor de voz o conhece. */
  readonly providerPhoneNumberId: string
  readonly paraNumero: string
  /** `call_id` e todas as variáveis que o prompt publicado cita. */
  readonly variaveis: Readonly<Record<string, string>>
  /**
   * A primeira fala com o lead dentro, que sobrepõe a publicada. Nula quando a
   * conta não tem agente legível: aí vale a publicada, que não tem marcador.
   */
  readonly primeiraFala: string | null
  /** A chave do provedor, já resolvida pela cascata. Não sai daqui. */
  readonly credencialDeVoz: string
}

/** O que o disparo devolve. O envelope é de `_shared/provedor/resposta.ts`. */
export interface RespostaDoDisparo extends EnvelopeDoProvedor {
  /** O identificador da chamada na telefonia. Obrigatório quando `ok`. */
  readonly providerCallSid?: string | null
  /** O identificador da conversa no agente de voz, quando o provedor já o dá. */
  readonly providerConversationId?: string | null
}

/** O que a função grava em `calls` depois que o provedor aceitou. */
export interface DisparoGravado {
  readonly contaId: string
  readonly chamadaId: string
  readonly providerCallSid: string
  readonly providerConversationId: string | null
}

/** Uma linha de `audit_log`, com as chaves da tabela. */
export interface LinhaDeAuditoria {
  readonly account_id: string
  readonly actor: AtorDaDiscagem
  readonly actor_id: string | null
  readonly source: string
  readonly action: string
  readonly target_type: string
  readonly target_id: string
  readonly reason: string | null
  readonly payload: Readonly<Record<string, unknown>>
}

/** Uma linha de `integration_events`, com as chaves da tabela. */
export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number | null
  /** O identificador da chamada (RNF-16). Sempre preenchido aqui. */
  readonly correlation_id: string
}

export interface UsuarioDaSessao {
  readonly id: string
}

/**
 * A camada de dados. `index.ts` a implementa sobre o cliente do Supabase com a
 * chave de serviço e sobre a API do provedor de voz; o teste a dubla e conta as
 * chamadas — sem a contagem, uma versão que discasse na recusa passaria verde
 * em qualquer asserção sobre a resposta.
 */
export interface PortaDaDiscagem extends PortaDeGuarda {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  contaDaDiscagem(contaId: string): Promise<ContaDaDiscagem | null>
  leadDaConta(contaId: string, leadId: string): Promise<LeadDaDiscagem | null>
  /** `agents` da conta: nome, empresa e primeira fala. Nulo sem agente. */
  identidadeDaConta(contaId: string): Promise<IdentidadeDaAbertura | null>
  /** A política de gravação (`account_settings`, RF-806). */
  politicaDaConta(contaId: string): Promise<PoliticaDaAbertura>
  publicacaoDoProposito(
    contaId: string,
    proposito: Proposito,
  ): Promise<PublicacaoDoProposito | null>
  versaoPublicadaDoPlaybook(contaId: string, proposito: Proposito): Promise<VersaoDoPlaybook | null>
  linhaTelefonica(contaId: string, linhaId: string): Promise<LinhaTelefonica | null>
  /** Insere em `calls`; conflito de chave devolve a linha que já existe. */
  gravarChamada(linha: LinhaDeChamada): Promise<ResultadoDaGravacao>
  registrarAuditoria(linha: LinhaDeAuditoria): Promise<void>
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  dispararNoProvedor(pedido: PedidoDeDisparo): Promise<RespostaDoDisparo>
  gravarDisparo(disparo: DisparoGravado): Promise<void>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
  /**
   * O número está na lista de teste da conta (`account_test_numbers`). Opcional
   * para os dublês antigos: ausente, nenhum número conta como de teste.
   */
  ehNumeroDeTeste?(contaId: string, telefoneE164: string): Promise<boolean>
}

export interface CorpoDaDiscagem {
  readonly ok: true
  readonly contaId: string
  readonly chamadaId: string
  readonly proposito: Proposito
  readonly fonte: FonteDeDiscagem
  readonly estado: EstadoDaDiscagem
  readonly mensagem: string
  readonly telefone: string
  readonly numeroDeOrigem: string | null
  readonly providerCallSid: string | null
  /** O rastro de integração não foi gravado. Não muda a ligação. */
  readonly semRegistro: boolean
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal | MotivoDoProvedor | string
  readonly mensagem: string
  /** O que dá para fazer a respeito. Só a recusa da guarda a traz (RF-407). */
  readonly alternativa?: string
  /**
   * A chamada que ficou gravada apesar da recusa. Presente só quando o provedor
   * falhou depois do insert: a linha existe, está `queued`, e quem recebe a
   * recusa precisa saber qual é.
   */
  readonly chamadaId?: string
}

export interface RespostaDaDiscagem {
  readonly status: number
  readonly corpo: CorpoDaDiscagem | CorpoDeRecusa
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly contaId: unknown
  readonly proposito: unknown
  readonly fonte: unknown
  /** O identificador que forma a chave: uuid do cliente, lead, reunião. */
  readonly referencia: unknown
  /** O ordinal das fontes compostas (`rescue`, `cad`, `camp`). */
  readonly ordinal: unknown
  /**
   * `dial_queue.attempt`, que `cron-dial` manda (US-189). Ausente é a
   * primeira; da segunda em diante a chave de `calls` ganha o sufixo
   * (`chaveDaTentativa`), senão a retentativa colidiria com a primeira.
   */
  readonly tentativa?: unknown
  readonly telefone: unknown
  readonly leadId: unknown
  readonly campanhaId: unknown
  readonly pular: unknown
  /** O porquê da discagem, que vai para `audit_log.reason`. */
  readonly motivo: unknown
  readonly autorizacao: string | null
  /** O cabeçalho `x-internal-secret`, quando quem chama é rotina. */
  readonly segredoInterno: string | null
}

export interface OpcoesDaDiscagem {
  /**
   * O segredo interno da instalação. Vazio **desliga** o portão das rotinas, em
   * vez de abri-lo: instalação sem a variável não discaria por rotina nenhuma,
   * e é o desfecho seguro — o contrário faria qualquer pedido com o cabeçalho
   * vazio passar como rotina.
   */
  readonly segredoInterno: string
  /** O relógio da decisão, em ISO-8601. Nunca lido aqui dentro. */
  readonly agora: string
}

const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Erro interno com motivo próprio, para a recusa sair com a frase certa. */
class RecusaDoPedido extends Error {
  readonly motivo: MotivoLocal

  constructor(motivo: MotivoLocal) {
    super(motivo)
    this.motivo = motivo
  }
}

/** Recusa que carrega o motivo traduzido do provedor, e a chamada já gravada. */
class RecusaDoProvedor extends Error {
  readonly motivo: MotivoDoProvedor
  readonly frase: string
  readonly chamadaId: string

  constructor(codigo: string | null | undefined, status: number | null | undefined, chamadaId: string) {
    const traduzido = traduzirErroDoProvedor(codigo, status)
    super(traduzido.motivo)
    this.motivo = traduzido.motivo
    this.frase = traduzido.mensagem
    this.chamadaId = chamadaId
  }
}

/** Quem mandou discar, depois dos dois portões de T-04. */
interface Autor {
  readonly ator: AtorDaDiscagem
  readonly atorId: string | null
}

/**
 * Disca. Nunca levanta: exceção da camada de dados vira `falha_interna`, porque
 * quem chama precisa de uma frase e não de um stack trace — e porque um erro
 * que escapasse daqui deixaria o discador sem resposta com a ligação já a
 * caminho.
 */
export async function atenderDiscagem(
  pedido: PedidoDaBorda,
  porta: PortaDaDiscagem,
  opcoes: OpcoesDaDiscagem,
): Promise<RespostaDaDiscagem> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = texto(pedido.contaId)
  if (!contaId) return recusa('conta_ausente')

  const proposito = texto(pedido.proposito)
  if (!proposito || !ehProposito(proposito)) return recusa('proposito_invalido')

  const fonte = texto(pedido.fonte)
  if (!fonte || !ehFonte(fonte)) return recusa('fonte_invalida')

  const pular = lerPular(pedido.pular)
  if (pular === null) return recusa('pulo_invalido')

  const daFonte = montarChave(fonte, pedido.referencia, pedido.ordinal)
  if (!daFonte) return recusa('referencia_invalida')
  const tentativa = pedido.tentativa === undefined || pedido.tentativa === null ? 1 : lerOrdinal(pedido.tentativa)
  if (tentativa === null) return recusa('referencia_invalida')
  const chave = chaveDaTentativa(daFonte, tentativa)

  try {
    const autor = await autenticar(pedido, fonte, porta, opcoes)
    if (autor.ator === 'user' && pular.length > 0) return recusa('pulo_sem_rotina')

    return await conduzir(
      { contaId, proposito, fonte, chave, pular, autor, pedido },
      porta,
      opcoes,
    )
  } catch (erro) {
    if (erro instanceof RecusaDoPedido) return recusa(erro.motivo)
    if (erro instanceof RecusaDoProvedor) {
      return {
        status: eFalhaDoProvedor(erro.motivo)
          ? STATUS_DA_FALHA_DO_PROVEDOR.indisponivel
          : STATUS_DA_FALHA_DO_PROVEDOR.recusou,
        corpo: {
          ok: false,
          motivo: erro.motivo,
          mensagem: erro.frase,
          chamadaId: erro.chamadaId,
        },
      }
    }
    return recusa('falha_interna')
  }
}

/**
 * A discagem com a rede de segurança da seção 8: toda credencial resolvida no
 * caminho é procurada no corpo serializado antes de responder, e um achado
 * transforma o pedido inteiro em `falha_interna`.
 *
 * Fica separada de `atenderDiscagem` porque quem tem a credencial em mão é
 * `conduzir`, e a conferência precisa do corpo já montado — inclusive o corpo
 * das recusas, que é por onde um eco do provedor sairia sem ninguém notar.
 * `index.ts` chama `colocarChamada`, que junta as duas.
 */
export async function colocarChamada(
  pedido: PedidoDaBorda,
  porta: PortaDaDiscagem,
  opcoes: OpcoesDaDiscagem,
): Promise<RespostaDaDiscagem> {
  const vistos: string[] = []
  const portaVigiada: PortaDaDiscagem = {
    ...porta,
    async credencial(contaId, provedor, chave) {
      const resolucao = await porta.credencial(contaId, provedor, chave)
      if (resolucao.ok) vistos.push(resolucao.valor)
      return resolucao
    },
  }

  const resposta = await atenderDiscagem(pedido, portaVigiada, opcoes)
  try {
    conferirQueNaoVazou(resposta.corpo, vistos, 'credencial no corpo de call-place')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}

// Os dois portões de T-04 -------------------------------------------------------

/**
 * Resolve quem está discando. O cabeçalho interno decide qual portão vale: com
 * ele, é rotina, e a sessão nem é lida; sem ele, é gente. Não há caminho em que
 * os dois valham ao mesmo tempo, e é o que impede uma rotina de herdar o papel
 * de quem por acaso mandou um JWT junto.
 */
async function autenticar(
  pedido: PedidoDaBorda,
  fonte: FonteDeDiscagem,
  porta: PortaDaDiscagem,
  opcoes: OpcoesDaDiscagem,
): Promise<Autor> {
  const interno = pedido.segredoInterno?.trim() ?? ''
  if (interno !== '') {
    const esperado = opcoes.segredoInterno.trim()
    if (esperado === '') throw new RecusaDoPedido('segredo_interno_invalido')
    // Os dois lados passam por sha-256 antes da comparação em tempo constante:
    // `hashesIguais` sai cedo quando os comprimentos diferem, e comparar os
    // hashes em vez dos segredos tira o comprimento do segredo da conversa.
    const [recebido, referencia] = await Promise.all([
      hashEmHexadecimal(interno),
      hashEmHexadecimal(esperado),
    ])
    if (!hashesIguais(recebido, referencia)) {
      throw new RecusaDoPedido('segredo_interno_invalido')
    }
    if (fonte === FONTE_DE_GENTE) throw new RecusaDoPedido('fonte_de_gente')
    return { ator: 'system', atorId: null }
  }

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) throw new RecusaDoPedido('sem_sessao')

  const usuario = await porta.usuarioDaSessao(jwt)
  if (!usuario) throw new RecusaDoPedido('sessao_invalida')

  const contaId = texto(pedido.contaId) ?? ''
  const papel = await porta.papelNaConta(contaId, usuario.id)
  if (!papel) throw new RecusaDoPedido('sem_acesso')
  if (!PAPEIS_QUE_DISCAM.has(papel)) throw new RecusaDoPedido('papel_insuficiente')
  if (fonte !== FONTE_DE_GENTE) throw new RecusaDoPedido('fonte_de_rotina')

  return { ator: 'user', atorId: usuario.id }
}

// O caminho ---------------------------------------------------------------------

interface Contexto {
  readonly contaId: string
  readonly proposito: Proposito
  readonly fonte: FonteDeDiscagem
  readonly chave: string
  readonly pular: readonly PassoPulavel[]
  readonly autor: Autor
  readonly pedido: PedidoDaBorda
}

async function conduzir(
  contexto: Contexto,
  porta: PortaDaDiscagem,
  opcoes: OpcoesDaDiscagem,
): Promise<RespostaDaDiscagem> {
  const { contaId, proposito, fonte, chave, pular, autor, pedido } = contexto

  const conta = await porta.contaDaDiscagem(contaId)
  if (!conta) throw new RecusaDoPedido('conta_desconhecida')

  const leadId = texto(pedido.leadId)
  const lead = leadId ? await porta.leadDaConta(contaId, leadId) : null
  if (leadId && !lead) throw new RecusaDoPedido('lead_desconhecido')

  // O número do pedido tem precedência sobre o do lead: é o que permite discar
  // para o segundo telefone de um contato sem alterar o cadastro dele.
  const telefone = texto(pedido.telefone) ?? lead?.phone_e164?.trim() ?? null
  if (!telefone) throw new RecusaDoPedido('destino_ausente')

  // A publicação e o roteiro antes da guarda: ver a divergência declarada no
  // cabeçalho. Os dois são leitura, e nenhum depende do que a guarda decide.
  const publicacao = await porta.publicacaoDoProposito(contaId, proposito)
  if (!publicacao) throw new RecusaDoPedido('sem_publicacao')

  const versao = await porta.versaoPublicadaDoPlaybook(contaId, proposito)
  if (!versao) throw new RecusaDoPedido('sem_playbook')

  // Número de teste da própria conta, ligado à mão, não espera o intervalo
  // mínimo nem o teto por número: ele existe para quem configura ligar de novo
  // logo depois de ajustar a Sarah. Janela, bloqueio, freio e tetos da conta
  // continuam valendo. O pulo pedido pelo cliente segue recusado acima; este é
  // decidido aqui, pelo dado.
  const normalizado = normalizarTelefone(telefone)
  const deTeste =
    autor.ator === 'user' &&
    fonte === 'manual' &&
    normalizado.ok &&
    (await porta.ehNumeroDeTeste?.(contaId, normalizado.e164)) === true

  const decisao = await guardarDiscagem(
    {
      contaId,
      telefone,
      leadId: lead?.id ?? null,
      ator: autor.ator,
      atorId: autor.atorId,
      fonte,
      campanhaId: texto(pedido.campanhaId),
      pular: deTeste ? PASSOS_PULAVEIS : pular,
      instante: opcoes.agora,
      fusoDaConta: conta.timezone,
    },
    porta,
  )

  if (!decisao.ok) return recusaDaGuarda(decisao)

  const linha = await porta.linhaTelefonica(contaId, decisao.linhaTelefonicaId)
  // Linha sem registro no provedor de voz não disca: o número existe na
  // telefonia, mas quem fala é o agente, e o agente só atende por um número
  // importado. Recusar aqui é melhor do que descobrir no 400 do provedor.
  if (!linha?.provider_voice_id) throw new RecusaDoPedido('linha_sem_registro')

  const gravacao = await porta.gravarChamada({
    account_id: contaId,
    lead_id: lead?.id ?? null,
    phone_line_id: decisao.linhaTelefonicaId,
    agent_publication_id: publicacao.id,
    playbook_version_id: versao.id,
    purpose: proposito,
    direction: 'outbound',
    status: 'queued',
    from_number: decisao.numeroDeOrigem ?? linha.e164,
    to_number: decisao.telefone,
    campaign_id: texto(pedido.campanhaId),
    idempotency_key: chave,
  })

  // O conflito de T-07: a chamada já existe, e é ela que volta. Sem discar, sem
  // erro e sem uma segunda linha de auditoria — o fato já foi registrado quando
  // a primeira nasceu.
  if (!gravacao.criada) {
    return {
      status: 200,
      corpo: {
        ok: true,
        contaId,
        chamadaId: gravacao.chamada.id,
        proposito,
        fonte,
        estado: 'ja_existia',
        mensagem: MENSAGENS_DO_ESTADO.ja_existia,
        telefone: decisao.telefone,
        numeroDeOrigem: decisao.numeroDeOrigem ?? linha.e164,
        providerCallSid: gravacao.chamada.provider_call_sid,
        semRegistro: false,
      },
    }
  }

  await registrarNaTrilha(contexto, gravacao.chamada.id, decisao.telefone, porta)

  const credencial = await exigirCredencial(porta, contaId)
  const abertura = await aberturaDaDiscagem(contaId, lead, porta)

  const pedidoDeDisparo: PedidoDeDisparo = {
    contaId,
    chamadaId: gravacao.chamada.id,
    providerAgentId: publicacao.provider_agent_id,
    providerPhoneNumberId: linha.provider_voice_id,
    paraNumero: decisao.telefone,
    variaveis: variaveisDinamicas(gravacao.chamada.id, abertura.variaveis),
    primeiraFala: abertura.primeiraFala,
    credencialDeVoz: credencial,
  }

  const disparo = await porta.dispararNoProvedor(pedidoDeDisparo)

  const semRegistro = !(await registrarIntegracao(
    contaId,
    gravacao.chamada.id,
    pedidoDeDisparo,
    disparo,
    porta,
  ))

  if (!disparo.ok) {
    // A linha continua `queued` e sem `provider_call_sid`, de propósito: ver o
    // cabeçalho. `cron-call-recovery` é quem a fecha.
    throw new RecusaDoProvedor(disparo.codigo, disparo.status, gravacao.chamada.id)
  }

  const sid = disparo.providerCallSid?.trim() ?? ''
  if (sid) {
    await porta.gravarDisparo({
      contaId,
      chamadaId: gravacao.chamada.id,
      providerCallSid: sid,
      providerConversationId: disparo.providerConversationId?.trim() || null,
    })
  }

  const corpo: CorpoDaDiscagem = {
    ok: true,
    contaId,
    chamadaId: gravacao.chamada.id,
    proposito,
    fonte,
    estado: 'discando',
    mensagem: MENSAGENS_DO_ESTADO.discando,
    telefone: decisao.telefone,
    numeroDeOrigem: decisao.numeroDeOrigem ?? linha.e164,
    providerCallSid: sid || null,
    semRegistro,
  }

  return { status: 200, corpo }
}

/**
 * Discar é ação sensível (RF-008), e a linha de auditoria é escrita aqui, e não
 * por gatilho: `calls` não tem gatilho de auditoria, porque a tabela muda o
 * tempo todo durante a ligação e cada mudança de `status` viraria uma linha.
 *
 * **DIVERGÊNCIA DECLARADA do critério de aceite**, que pede o motivo por
 * `set_config('app.audit_reason')`: esse parâmetro existe para
 * `registrar_auditoria()`, a função de gatilho, ler dentro da mesma transação
 * da escrita. Aqui não há gatilho e cada chamada da camada de dados abre a
 * própria transação, então o parâmetro não sobreviveria até o insert. O motivo
 * vai direto na coluna `reason`, que é o mesmo lugar onde o gatilho o poria.
 */
async function registrarNaTrilha(
  contexto: Contexto,
  chamadaId: string,
  telefone: string,
  porta: PortaDaDiscagem,
): Promise<void> {
  await porta.registrarAuditoria({
    account_id: contexto.contaId,
    actor: contexto.autor.ator,
    actor_id: contexto.autor.atorId,
    // O vocabulário de `audit_log.source`: por qual porta a mudança entrou.
    source: 'edge:call-place',
    action: 'call_placed',
    target_type: 'calls',
    target_id: chamadaId,
    reason: texto(contexto.pedido.motivo),
    payload: {
      purpose: contexto.proposito,
      // A fonte é o nome da rotina que discou (T-04), ou `manual` quando foi
      // gente. É o que separa uma ligação de cadência de um clique.
      dial_source: contexto.fonte,
      phone_e164: telefone,
      lead_id: texto(contexto.pedido.leadId),
      campaign_id: texto(contexto.pedido.campanhaId),
      idempotency_key: contexto.chave,
      bypass: contexto.pular,
    },
  })
}

/**
 * O rastro da ida ao provedor, com `correlation_id` igual ao identificador da
 * chamada (RNF-16) — é ele que faz "dado o identificador da chamada, devolva a
 * cadeia completa" ser uma consulta e não uma varredura.
 *
 * Devolve falso quando o registro não foi gravado. Falha aqui **não** derruba a
 * ligação: o rastro é observabilidade, e perder observabilidade é menos grave
 * do que derrubar uma chamada que o provedor já aceitou. O corpo diz que
 * faltou.
 */
async function registrarIntegracao(
  contaId: string,
  chamadaId: string,
  pedido: PedidoDeDisparo,
  disparo: RespostaDoDisparo,
  porta: PortaDaDiscagem,
): Promise<boolean> {
  try {
    await porta.registrarEventoDeIntegracao({
      account_id: contaId,
      direction: 'outbound',
      provider: PROVEDOR_DE_VOZ,
      endpoint: disparo.endpoint ?? 'chamada',
      // O corpo do pedido no rastro é o que foi decidido, sem a credencial: ela
      // é o único campo de `PedidoDeDisparo` que não pode ser guardado.
      // As variáveis vão pelo nome, e só `call_id` com valor: o resto é dado
      // do lead, e o rastro de integração não é lugar de guardá-lo.
      request: {
        agent_id: pedido.providerAgentId,
        agent_phone_number_id: pedido.providerPhoneNumberId,
        to_number: pedido.paraNumero,
        dynamic_variables: rastroDasVariaveis(pedido.variaveis),
        first_message_override: pedido.primeiraFala !== null,
      },
      response: disparo.corpo ?? {},
      status_code: disparo.status ?? null,
      latency_ms: disparo.latenciaMs ?? null,
      correlation_id: chamadaId,
    })
    return true
  } catch {
    return false
  }
}

// As peças ----------------------------------------------------------------------

/**
 * `call_id` e as variáveis do prompt. Sem as do prompt (conta sem agente
 * legível), vão os valores iniciais da publicação: a conversa nunca começa com
 * uma variável citada e ausente.
 */
export function variaveisDinamicas(
  chamadaId: string,
  doPrompt: Readonly<Record<string, string>> = variaveisDaChamada(null),
): Readonly<Record<string, string>> {
  const variaveis: Record<string, string> = { ...doPrompt }
  for (const nome of VARIAVEIS_DINAMICAS) variaveis[nome] = chamadaId
  return variaveis
}

/** As variáveis no rastro: o nome de cada uma, e valor só o de `call_id`. */
function rastroDasVariaveis(variaveis: Readonly<Record<string, string>>): Record<string, string> {
  const ids = new Set<string>(VARIAVEIS_DINAMICAS)
  return Object.fromEntries(
    Object.entries(variaveis).map(([nome, valor]) => [nome, ids.has(nome) ? valor : '[lead]']),
  )
}

/**
 * A abertura da ligação, pela mesma regra de `call-init`. Conta sem agente
 * legível não impede a ligação — a guarda e a publicação já passaram —: vão
 * as variáveis com o lead e a primeira fala publicada, que não tem marcador.
 */
async function aberturaDaDiscagem(
  contaId: string,
  lead: LeadDaDiscagem | null,
  porta: PortaDaDiscagem,
): Promise<{ variaveis: Readonly<Record<string, string>>; primeiraFala: string | null }> {
  const doLead = lead ? { nome: lead.name, empresa: lead.company ?? null, cidade: lead.city ?? null } : null
  const identidade = await porta.identidadeDaConta(contaId)
  if (!identidade) return { variaveis: variaveisDaChamada(doLead), primeiraFala: null }
  const politica = await porta.politicaDaConta(contaId)
  const abertura = montarAbertura({ identidade, politica, lead: doLead })
  return { variaveis: abertura.variaveis, primeiraFala: abertura.primeiraFala }
}

/**
 * A chave de idempotência da fonte (US-057). Devolve nulo em vez de levantar:
 * referência torta é pedido malformado, e pedido malformado vira 400 com
 * frase — o gerador de `_shared/chamada/idempotencia.ts` levanta porque lá
 * quem chama é servidor, e aqui quem chama pode ser um formulário.
 */
export function montarChave(
  fonte: FonteDeDiscagem,
  referencia: unknown,
  ordinal: unknown,
): string | null {
  const id = texto(referencia)
  if (!id) return null

  const n = lerOrdinal(ordinal)
  let pedido: PedidoDeChave
  switch (fonte) {
    case 'manual':
      pedido = { fonte, uuidDoCliente: id }
      break
    case 'stl':
      pedido = { fonte, leadId: id }
      break
    case 'rem':
      pedido = { fonte, meetingId: id }
      break
    case 'rescue':
      if (n === null) return null
      pedido = { fonte, meetingId: id, ordinal: n }
      break
    case 'cad':
      if (n === null) return null
      pedido = { fonte, enrollmentId: id, passo: n }
      break
    case 'camp':
      if (n === null) return null
      pedido = { fonte, targetId: id, tentativa: n }
      break
  }

  try {
    return chaveDeDiscagem(pedido)
  } catch {
    return null
  }
}

/**
 * Os passos a pular, ou nulo quando algum nome não é da lista fechada. Nome
 * desconhecido é recusa, e não descarte silencioso: `guard_dial` ignora o que
 * não conhece, então uma campanha que escrevesse `daily_per_acount` acharia
 * estar pulando um teto que continuou valendo.
 */
export function lerPular(valor: unknown): readonly PassoPulavel[] | null {
  if (valor === undefined || valor === null) return []
  if (!Array.isArray(valor)) return null

  const passos: PassoPulavel[] = []
  for (const item of valor) {
    if (typeof item !== 'string') return null
    const passo = (PASSOS_PULAVEIS as readonly string[]).includes(item)
      ? (item as PassoPulavel)
      : null
    if (passo === null) return null
    passos.push(passo)
  }
  return passos
}

export function extrairJwt(autorizacao: string | null): string | null {
  const cabecalho = autorizacao?.trim() ?? ''
  if (cabecalho === '') return null
  return PREFIXO_BEARER.exec(cabecalho)?.[1]?.trim() || null
}

async function exigirCredencial(porta: PortaDaDiscagem, contaId: string): Promise<string> {
  const resolucao = await porta.credencial(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  if (resolucao.ok) return resolucao.valor
  throw new RecusaDoPedido(
    resolucao.motivo === 'plataforma_bloqueada' ? 'voz_bloqueada' : 'sem_credencial_de_voz',
  )
}

function ehProposito(valor: string): valor is Proposito {
  return (PROPOSITOS as readonly string[]).includes(valor)
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function lerOrdinal(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isInteger(valor) && valor >= 1) return valor
  if (typeof valor === 'string' && /^[1-9][0-9]*$/.test(valor.trim())) return Number(valor.trim())
  return null
}

function recusa(motivo: MotivoLocal): RespostaDaDiscagem {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}

/**
 * A recusa da guarda sai com a frase e a alternativa que `guarda.ts` montou
 * (RF-407), e **nenhuma ida ao provedor aconteceu** — é a metade de borda do
 * quarto critério de aceite da F2: recusa não consome crédito.
 */
function recusaDaGuarda(decisao: Extract<DecisaoDaGuarda, { ok: false }>): RespostaDaDiscagem {
  return {
    status: STATUS_DA_GUARDA,
    corpo: {
      ok: false,
      motivo: decisao.motivo,
      mensagem: decisao.mensagem,
      alternativa: decisao.alternativa,
    },
  }
}
