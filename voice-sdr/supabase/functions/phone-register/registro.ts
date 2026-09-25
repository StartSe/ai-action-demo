// phone-register: o número passa a atender do jeito que a conta configurou
// (T-14, RF-409, RF-709).
//
// `phone_lines.inbound_behavior` tem três valores e dois destinos. Em `agent`, o
// número é importado na integração nativa do provedor de voz, e é ele quem
// atende, com o agente publicado. Em `forward` e `voicemail`, o webhook de voz
// da telefonia passa a apontar para `inbound-twiml`, porque encaminhar e dar
// recado não existem dentro do provedor de voz — o número registrado lá manda
// tudo para o agente.
//
// **SEGREDO QUE SAI POR NECESSIDADE** (docs/PRD-implementacao.md seção 8,
// repetida aqui porque este é o módulo que o faz sair): importar o número na
// integração nativa **entrega o identificador e o token da telefonia ao
// provedor de voz**. Não há como não entregar: é com eles que o provedor de voz
// assume os webhooks do número e passa a atender a ligação. "O valor nunca sai"
// vale para o navegador, e continua valendo — `conferirQueNaoVazou` varre o
// corpo da resposta atrás dos três valores resolvidos antes de responder. Para
// o provedor de voz, o par da telefonia sai, está escrito, e quem liga a
// integração está ligando as duas contas uma na outra. Esconder isso no código
// não o tornaria menos verdadeiro; tornaria só mais difícil de descobrir.
//
// Três decisões que o módulo carrega:
//
// 1. **O registro é idempotente, e a idempotência é por destino.** Número já
//    registrado no destino que o comportamento pede não vai ao provedor e não é
//    gravado de novo. O destino se lê da própria linha: com `provider_voice_id`
//    preenchido, quem atende é o provedor de voz; sem ele e com
//    `provider_number_id`, quem atende é o webhook apontado para
//    `inbound-twiml`. Trocar o comportamento muda o destino e **reconfigura**,
//    em vez de criar um segundo registro.
// 2. **`forward` e `voicemail` são o mesmo registro.** Os dois apontam o mesmo
//    webhook para o mesmo endereço; quem decide entre encaminhar e dar o recado
//    é `inbound-twiml`, lendo a linha a cada ligação. Por isso trocar um pelo
//    outro é `inalterado`, e isso é correto: a configuração no provedor não
//    mudou mesmo. Registrar de novo a cada troca gastaria uma ida ao provedor
//    para reescrever o valor que já estava lá.
// 3. **`aguardando aprovação da operadora` é resultado normal** (P-04). Número
//    brasileiro passa por aprovação que leva dias, e tratá-la como erro faria a
//    tela de números mandar tentar de novo todo dia. O estado sai na resposta,
//    a linha é gravada com o que já existe, e o checklist da configuração
//    inicial mostra a espera em vez de uma falha.
//
// **O que o registro não consegue tornar atômico, ele torna ordenado.**
// Configurar no provedor e gravar a linha são dois sistemas sem transação entre
// eles. A ordem é provedor primeiro, banco depois, e a escrita que falhar vira
// `falha_ao_gravar` — que é o desfecho honesto: o número já atende, e o que
// falta é a linha saber disso. O contrário (gravar antes) diria que atende um
// número que ninguém configurou.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoRegistro`, implementada em `index.ts` e dublada no teste.

import {
  eFalhaDoProvedor,
  traduzirErroDoProvedor,
  type MotivoDoProvedor,
} from '../_shared/provedor/erros.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'
import { enderecoComConta } from '../_shared/telefonia/conta-no-endereco.ts'

import {
  MENSAGENS,
  MENSAGENS_DO_ESTADO,
  STATUS,
  STATUS_DA_FALHA_DO_PROVEDOR,
  type EstadoDoRegistro,
  type MotivoLocal,
} from './respostas.ts'

/** Os provedores, como `integrations-status/provedores.ts` os nomeia. */
export const PROVEDOR_DE_TELEFONIA = 'telefonia'
export const PROVEDOR_DE_VOZ = 'voz'

/** As chaves de cada um no cofre. */
export const CHAVE_DO_IDENTIFICADOR = 'account_sid'
export const CHAVE_DO_TOKEN = 'auth_token'
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/**
 * Quem registra. A mesma hierarquia de `agent-publish`: registrar um número
 * mexe na configuração da conta e tem custo no provedor, e o Operador trabalha
 * o funil dentro dela.
 */
export const PAPEIS_QUE_REGISTRAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/**
 * O propósito que atende a ligação recebida.
 *
 * São quatro agentes publicados, um por propósito (T-01), e quem liga para a
 * empresa não declara propósito nenhum. Descoberta é o único que serve a quem
 * chega pela primeira vez: lembrete, resgate e acompanhamento pressupõem uma
 * conversa anterior que quem ligou pode não ter tido.
 */
export const PROPOSITO_DA_ENTRADA = 'discovery'

/** Uma linha de `phone_lines`, com as chaves da tabela. */
export interface LinhaTelefonica {
  readonly id: string
  readonly account_id: string
  readonly e164: string
  readonly label: string
  readonly inbound_behavior: string
  readonly forward_to: string | null
  readonly provider_number_id: string | null
  readonly provider_voice_id: string | null
}

/** A publicação que o número aponta, quando o comportamento é `agent`. */
export interface PublicacaoDeEntrada {
  readonly provider_agent_id: string
}

/**
 * Onde a ligação recebida cai depois de registrada.
 *
 * `voz` é a integração nativa; `webhook` é o número na telefonia apontando para
 * `inbound-twiml`. É por este valor que a idempotência decide, e não pelo
 * comportamento: `forward` e `voicemail` produzem o mesmo `webhook`.
 */
export type DestinoDaEntrada = 'voz' | 'webhook'

/**
 * O que o provedor respondeu. O envelope é de `_shared/provedor/resposta.ts`,
 * que três bordas compartilham; esta não acrescenta campo nenhum ao caso geral,
 * e as duas respostas de baixo trazem o que é delas.
 */
export type RespostaDoProvedor = EnvelopeDoProvedor

/** O que a busca do número na telefonia devolve. */
export interface RespostaDaBusca extends RespostaDoProvedor {
  /** O identificador do número lá dentro. Null quando a conta não o tem. */
  readonly providerNumberId?: string | null
}

/** O que a importação no provedor de voz devolve. */
export interface RespostaDaImportacao extends RespostaDoProvedor {
  readonly providerVoiceId?: string | null
  /**
   * O provedor aceitou e o registro depende de aprovação da operadora (P-04).
   * Não é erro, e a linha é gravada com o que já veio.
   */
  readonly pendente?: boolean
}

export interface PedidoDeBusca {
  readonly contaId: string
  readonly e164: string
  /** O par da telefonia, já resolvido pela cascata. Não sai daqui. */
  readonly identificador: string
  readonly token: string
}

export interface PedidoDeImportacao extends PedidoDeBusca {
  readonly providerNumberId: string
  readonly rotulo: string
  readonly providerAgentId: string
  /** A chave do provedor de voz, já resolvida. Não sai daqui. */
  readonly credencialDeVoz: string
  /**
   * O identificador que a importação anterior deixou, quando há um. Presente,
   * é atualização; ausente, é criação.
   */
  readonly providerVoiceId: string | null
}

export interface PedidoDeApontamento extends PedidoDeBusca {
  readonly providerNumberId: string
  /** O endereço de `inbound-twiml`. Quem o conhece é o `index.ts`. */
  readonly webhookDeVoz: string
}

export interface PedidoDeRemocao {
  readonly contaId: string
  readonly providerVoiceId: string
  readonly credencialDeVoz: string
}

/** O que a função grava em `phone_lines`. */
export interface LinhaDeRegistro {
  readonly linhaId: string
  readonly contaId: string
  readonly providerNumberId: string | null
  readonly providerVoiceId: string | null
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
  /** Nulo: registrar um número não nasce de ligação nenhuma. */
  readonly correlation_id: string | null
}

export interface UsuarioDaSessao {
  readonly id: string
}

/**
 * A camada de dados. `index.ts` a implementa sobre o cliente do Supabase e
 * sobre as APIs dos dois provedores; o teste a dubla.
 */
export interface PortaDoRegistro {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  linhaDaConta(contaId: string, linhaId: string): Promise<LinhaTelefonica | null>
  /** A publicação de `PROPOSITO_DA_ENTRADA`, só se estiver no ar. */
  publicacaoDeEntrada(contaId: string): Promise<PublicacaoDeEntrada | null>
  /** Cascata de `_shared/secrets.ts`. Nunca resolvida à mão nesta função. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  numeroNaTelefonia(pedido: PedidoDeBusca): Promise<RespostaDaBusca>
  importarNoProvedorDeVoz(pedido: PedidoDeImportacao): Promise<RespostaDaImportacao>
  apontarWebhookDeVoz(pedido: PedidoDeApontamento): Promise<RespostaDoProvedor>
  removerDoProvedorDeVoz(pedido: PedidoDeRemocao): Promise<RespostaDoProvedor>
  gravarRegistro(linha: LinhaDeRegistro): Promise<void>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface CorpoDoRegistro {
  readonly ok: true
  readonly contaId: string
  readonly linhaId: string
  readonly e164: string
  readonly comportamento: string
  readonly destino: DestinoDaEntrada
  readonly estado: EstadoDoRegistro
  readonly mensagem: string
  readonly providerNumberId: string | null
  readonly providerVoiceId: string | null
  /**
   * A importação anterior no provedor de voz não foi desfeita ao trocar o
   * comportamento. Não muda o atendimento — quem atende agora é o webhook —,
   * muda o que sobrou lá dentro para alguém limpar.
   */
  readonly sobrouNoProvedorDeVoz: boolean
  /** O rastro de integração não foi gravado. Não muda o registro. */
  readonly semRegistro: boolean
}

export interface CorpoDeRecusa {
  readonly ok: false
  readonly motivo: MotivoLocal | MotivoDoProvedor
  readonly mensagem: string
}

export interface RespostaDoRegistro {
  readonly status: number
  readonly corpo: CorpoDoRegistro | CorpoDeRecusa
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly contaId: unknown
  readonly linhaId: unknown
  /** Cabeçalho Authorization, quando houver. */
  readonly autorizacao: string | null
}

export interface OpcoesDoRegistro {
  /** O endereço de `inbound-twiml`. Quem o conhece é o `index.ts`. */
  readonly enderecoDoAtendimento: string
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

/** Recusa que carrega o motivo traduzido do provedor. */
class RecusaDoProvedor extends Error {
  readonly motivo: MotivoDoProvedor
  readonly frase: string

  constructor(codigo: string | null | undefined, status: number | null | undefined) {
    const traduzido = traduzirErroDoProvedor(codigo, status)
    super(traduzido.motivo)
    this.motivo = traduzido.motivo
    this.frase = traduzido.mensagem
  }
}

/**
 * Registra o número conforme o comportamento da linha. Nunca levanta: exceção
 * da camada de dados vira `falha_interna`, porque quem registra precisa de uma
 * frase e não de um stack trace.
 */
export async function atenderRegistro(
  pedido: PedidoDaBorda,
  porta: PortaDoRegistro,
  opcoes: OpcoesDoRegistro,
): Promise<RespostaDoRegistro> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const contaId = typeof pedido.contaId === 'string' ? pedido.contaId.trim() : ''
  if (!contaId) return recusa('conta_ausente')

  const linhaId = typeof pedido.linhaId === 'string' ? pedido.linhaId.trim() : ''
  if (!linhaId) return recusa('linha_ausente')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  try {
    const usuario = await porta.usuarioDaSessao(jwt)
    if (!usuario) return recusa('sessao_invalida')

    const papel = await porta.papelNaConta(contaId, usuario.id)
    if (!papel) return recusa('sem_acesso')
    if (!PAPEIS_QUE_REGISTRAM.has(papel)) return recusa('papel_insuficiente')

    return await registrar(contaId, linhaId, porta, opcoes)
  } catch (erro) {
    if (erro instanceof RecusaDoPedido) return recusa(erro.motivo)
    if (erro instanceof RecusaDoProvedor) {
      return {
        status: eFalhaDoProvedor(erro.motivo)
          ? STATUS_DA_FALHA_DO_PROVEDOR.indisponivel
          : STATUS_DA_FALHA_DO_PROVEDOR.recusou,
        corpo: { ok: false, motivo: erro.motivo, mensagem: erro.frase },
      }
    }
    return recusa('falha_interna')
  }
}

async function registrar(
  contaId: string,
  linhaId: string,
  porta: PortaDoRegistro,
  opcoes: OpcoesDoRegistro,
): Promise<RespostaDoRegistro> {
  const linha = await porta.linhaDaConta(contaId, linhaId)
  if (!linha) throw new RecusaDoPedido('linha_desconhecida')

  const destino = destinoDoComportamento(linha.inbound_behavior)
  const vigente = destinoVigente(linha)

  // A idempotência, antes de qualquer credencial: o caminho feliz de quem abre
  // a tela de números duas vezes não gasta leitura de cofre nem ida a provedor.
  if (vigente === destino) {
    return pronto(linha, destino, 'inalterado', {
      providerNumberId: linha.provider_number_id,
      providerVoiceId: linha.provider_voice_id,
      sobrouNoProvedorDeVoz: false,
      semRegistro: false,
    })
  }

  const identificador = await exigirCredencial(
    porta,
    contaId,
    PROVEDOR_DE_TELEFONIA,
    CHAVE_DO_IDENTIFICADOR,
    'sem_credencial_de_telefonia',
    'telefonia_bloqueada',
  )
  const token = await exigirCredencial(
    porta,
    contaId,
    PROVEDOR_DE_TELEFONIA,
    CHAVE_DO_TOKEN,
    'sem_credencial_de_telefonia',
    'telefonia_bloqueada',
  )

  const eventos: EventoDeIntegracao[] = []

  const busca = await porta.numeroNaTelefonia({
    contaId,
    e164: linha.e164,
    identificador,
    token,
  })
  eventos.push(evento(contaId, PROVEDOR_DE_TELEFONIA, 'numeros', { e164: linha.e164 }, busca))
  if (!busca.ok) throw new RecusaDoProvedor(busca.codigo, busca.status)

  const providerNumberId = busca.providerNumberId?.trim() ?? ''
  if (!providerNumberId) throw new RecusaDoPedido('numero_nao_encontrado')

  let providerVoiceId: string | null = null
  let estado: EstadoDoRegistro = 'registrado'
  let sobrouNoProvedorDeVoz = false

  if (destino === 'voz') {
    const credencialDeVoz = await exigirCredencial(
      porta,
      contaId,
      PROVEDOR_DE_VOZ,
      CHAVE_DO_PROVEDOR_DE_VOZ,
      'sem_credencial_de_voz',
      'voz_bloqueada',
    )
    // Número apontado para um agente que não existe atende e fica mudo. A
    // ordem é publicar e depois registrar, e a recusa aqui é o que a ensina.
    const publicacao = await porta.publicacaoDeEntrada(contaId)
    if (!publicacao) throw new RecusaDoPedido('sem_publicacao')

    // Aqui é onde o par da telefonia sai para o provedor de voz. Veja o
    // cabeçalho: é a integração nativa, e não há como não entregá-lo.
    const importacao = await porta.importarNoProvedorDeVoz({
      contaId,
      e164: linha.e164,
      identificador,
      token,
      providerNumberId,
      rotulo: linha.label,
      providerAgentId: publicacao.provider_agent_id,
      credencialDeVoz,
      providerVoiceId: linha.provider_voice_id,
    })
    eventos.push(
      evento(contaId, PROVEDOR_DE_VOZ, 'telefones', { e164: linha.e164 }, importacao),
    )
    if (!importacao.ok) throw new RecusaDoProvedor(importacao.codigo, importacao.status)

    providerVoiceId = importacao.providerVoiceId?.trim() || null
    if (importacao.pendente) estado = 'aguardando_aprovacao'
  } else {
    // Saindo de `voz`: o webhook que vamos apontar já tira o provedor de voz do
    // caminho, então a remoção lá dentro é limpeza e não correção — e por isso
    // ela não derruba o registro. O que sobrou vai na resposta, para alguém
    // limpar em vez de descobrir meses depois.
    if (vigente === 'voz' && linha.provider_voice_id) {
      const credencialDeVoz = await porta.credencial(
        contaId,
        PROVEDOR_DE_VOZ,
        CHAVE_DO_PROVEDOR_DE_VOZ,
      )
      if (credencialDeVoz.ok) {
        const remocao = await porta.removerDoProvedorDeVoz({
          contaId,
          providerVoiceId: linha.provider_voice_id,
          credencialDeVoz: credencialDeVoz.valor,
        })
        eventos.push(
          evento(contaId, PROVEDOR_DE_VOZ, 'telefones', { remover: true }, remocao),
        )
        sobrouNoProvedorDeVoz = !remocao.ok
      } else {
        sobrouNoProvedorDeVoz = true
      }
    }

    // O endereço leva a conta: é por ela que `inbound-twiml` sabe qual token
    // do cofre confere a assinatura, sem consultar o número antes de validar.
    const webhookDeVoz = enderecoComConta(opcoes.enderecoDoAtendimento, contaId)
    const apontamento = await porta.apontarWebhookDeVoz({
      contaId,
      e164: linha.e164,
      identificador,
      token,
      providerNumberId,
      webhookDeVoz,
    })
    eventos.push(
      evento(
        contaId,
        PROVEDOR_DE_TELEFONIA,
        'numeros',
        { providerNumberId, webhookDeVoz },
        apontamento,
      ),
    )
    if (!apontamento.ok) throw new RecusaDoProvedor(apontamento.codigo, apontamento.status)
  }

  let semRegistro = false
  try {
    await porta.gravarRegistro({ linhaId, contaId, providerNumberId, providerVoiceId })
  } catch {
    // O provedor já está configurado, e o número já atende. O que falta é a
    // linha saber disso, e é exatamente o que a frase diz.
    throw new RecusaDoPedido('falha_ao_gravar')
  }

  for (const item of eventos) {
    try {
      await porta.registrarEventoDeIntegracao(item)
    } catch {
      semRegistro = true
    }
  }

  return pronto(linha, destino, estado, {
    providerNumberId,
    providerVoiceId,
    sobrouNoProvedorDeVoz,
    semRegistro,
  })
}

interface Desfecho {
  readonly providerNumberId: string | null
  readonly providerVoiceId: string | null
  readonly sobrouNoProvedorDeVoz: boolean
  readonly semRegistro: boolean
}

function pronto(
  linha: LinhaTelefonica,
  destino: DestinoDaEntrada,
  estado: EstadoDoRegistro,
  desfecho: Desfecho,
): RespostaDoRegistro {
  return {
    status: 200,
    corpo: {
      ok: true,
      contaId: linha.account_id,
      linhaId: linha.id,
      e164: linha.e164,
      comportamento: linha.inbound_behavior,
      destino,
      estado,
      mensagem: MENSAGENS_DO_ESTADO[estado],
      ...desfecho,
    },
  }
}

/**
 * Onde a ligação cai depois de registrada, pelo comportamento da linha.
 *
 * Comportamento desconhecido vai para o webhook, e é a escolha segura: o
 * `check` do banco fecha a lista em três, e se um quarto valor aparecer um dia,
 * quem o atende é `inbound-twiml`, que sabe dizer uma frase e encerrar. Mandar
 * o desconhecido para o agente faria a Sarah atender uma linha que alguém
 * configurou para outra coisa.
 */
export function destinoDoComportamento(comportamento: string): DestinoDaEntrada {
  return comportamento === 'agent' ? 'voz' : 'webhook'
}

/**
 * Onde a ligação cai hoje, lido da própria linha. Null é "nunca registrada".
 *
 * A leitura é do estado gravado, e não de uma coluna que diga o destino: a
 * coluna existiria para ser esquecida num update. `provider_voice_id`
 * preenchido só acontece quando a importação nativa passou.
 */
export function destinoVigente(linha: LinhaTelefonica): DestinoDaEntrada | null {
  if (!linha.provider_number_id?.trim()) return null
  return linha.provider_voice_id?.trim() ? 'voz' : 'webhook'
}

async function exigirCredencial(
  porta: PortaDoRegistro,
  contaId: string,
  provedor: string,
  chave: string,
  semChave: MotivoLocal,
  bloqueada: MotivoLocal,
): Promise<string> {
  const resolucao = await porta.credencial(contaId, provedor, chave)
  if (resolucao.ok) return resolucao.valor
  throw new RecusaDoPedido(resolucao.motivo === 'plataforma_bloqueada' ? bloqueada : semChave)
}

function evento(
  contaId: string,
  provedor: string,
  endpointPadrao: string,
  request: Readonly<Record<string, unknown>>,
  resposta: RespostaDoProvedor,
): EventoDeIntegracao {
  return {
    account_id: contaId,
    direction: 'outbound',
    provider: provedor,
    endpoint: resposta.endpoint ?? endpointPadrao,
    request,
    response: resposta.corpo ?? {},
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: null,
  }
}

function recusa(motivo: MotivoLocal): RespostaDoRegistro {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}

export function extrairJwt(autorizacao: string | null): string | null {
  const achado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  return achado?.[1]?.trim() || null
}

/**
 * A rede de segurança de "o valor nunca sai" para o navegador: os valores
 * resolvidos são procurados no corpo serializado antes de responder, e um
 * achado transforma o pedido inteiro em `falha_interna`.
 *
 * Fica separada de `atenderRegistro` porque quem tem os segredos em mão é
 * `registrar`, e a conferência precisa do corpo já montado. `index.ts` chama
 * `registrarNumero`, que junta as duas.
 */
export async function registrarNumero(
  pedido: PedidoDaBorda,
  porta: PortaDoRegistro,
  opcoes: OpcoesDoRegistro,
): Promise<RespostaDoRegistro> {
  const vistos: string[] = []
  const portaVigiada: PortaDoRegistro = {
    ...porta,
    async credencial(contaId, provedor, chave) {
      const resolucao = await porta.credencial(contaId, provedor, chave)
      if (resolucao.ok) vistos.push(resolucao.valor)
      return resolucao
    },
  }

  const resposta = await atenderRegistro(pedido, portaVigiada, opcoes)
  try {
    conferirQueNaoVazou(resposta.corpo, vistos, 'credencial no corpo de phone-register')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}
