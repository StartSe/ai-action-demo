// call-cancel: cancelar a discagem que está na fila ou a chamada em curso
// (RF-008, RF-011).
//
// Dois alvos, e o pedido diz qual: `itemDaFilaId` para o que ainda não virou
// chamada, `chamadaId` para o que já virou. Item de fila que já virou chamada
// segue para o caminho da chamada que ele abriu.
//
// **TODA ESCRITA É CONDICIONADA AO ESTADO, NUM COMANDO SÓ**, pela mesma razão da
// reivindicação de `call-finalize` (T-15). Ler "está em curso" e depois
// escrever é verificar-e-agir: entre as duas coisas a finalização pode ter
// fechado a chamada, e o cancelamento a reabriria. Aqui cada escrita é um
// `update ... where <estado esperado> returning`, e quem não recebe a linha lê
// de novo e responde o estado que encontrou. Nenhum update desta função escreve
// `in_progress`, e nenhum casa com chamada que tenha `finalized_at`: chamada
// finalizada não volta atrás em hipótese nenhuma.
//
// **A CHAMADA EM CURSO NÃO É FECHADA AQUI.** Quem escreve o desfecho é
// `call-finalize`, e só ela. O cancelamento marca `end_reason = 'canceled'` na
// chamada viva e pede o encerramento à telefonia; o provedor avisa o fim,
// `call-events` aciona a finalização, e ela preserva o motivo marcado. O
// `status` continua `ringing` ou `in_progress` até lá, de propósito: é o que
// mantém a chamada na varredura de `cron-call-recovery` se o aviso de fim se
// perder.
//
// **A CHAMADA QUE AINDA NÃO DISCOU é fechada aqui**, porque não há conversa que
// finalizar: `queued` sem `provider_call_sid` vira `failed` com `canceled`. Há
// uma janela declarada: `call-place` grava a linha `queued` e dispara em
// seguida, e um cancelamento que caia entre as duas coisas não segura o
// disparo já no ar — a ligação toca, e o fim dela chega à finalização com o
// motivo `canceled` preservado.
//
// **IDEMPOTENTE, E O PROVEDOR NÃO É TOCADO DUAS VEZES.** Chamada encerrada, já
// marcada como cancelada ou item fora da fila devolvem o estado atual, sem
// escrita, sem trilha e sem ida à telefonia. A marca só é posta onde ainda não
// havia marca (`end_reason is null`), e é isso que faz o segundo pedido não
// encerrar de novo.
//
// **A TRILHA É DA DECISÃO** (RF-008), como a de `call-place`: autor, hora (o
// `default now()` da coluna) e alvo, gravados depois de a escrita condicionada
// vencer e antes do efeito externo. Trilha que falha desfaz a marca e o pedido
// é recusado — não há cancelamento sem autor. Telefonia que recusa o
// encerramento desfaz a marca e a linha de trilha fica, porque a decisão foi
// tomada; o segundo pedido escreve a segunda.
//
// **A CONTA SAI DO DADO.** O pedido não traz conta: ela é a do alvo, lida com
// a chave de serviço, e o papel de quem pediu é conferido contra ela. Não ser
// membro responde o mesmo 404 do alvo que não existe.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e a
// telefonia entram por `PortaDoCancelamento`, implementada em `index.ts`.

import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  MENSAGENS,
  MENSAGENS_DO_ESTADO,
  STATUS,
  type EstadoDoCancelamento,
  type MotivoDoCancelamento,
} from './respostas.ts'

/** Quem cancela. `viewer` fica de fora, como fica de fora de discar. */
export const PAPEIS_QUE_CANCELAM: ReadonlySet<string> = new Set(['owner', 'admin', 'operator'])

/** A telefonia e as duas chaves no cofre, as mesmas de `phone-register`. */
export const PROVEDOR_DE_TELEFONIA = 'telefonia'
export const CHAVE_DO_IDENTIFICADOR = 'account_sid'
export const CHAVE_DO_TOKEN = 'auth_token'

/** `audit_log.source`: por qual porta a mudança entrou. */
export const FONTE_DA_TRILHA = 'edge:call-cancel'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIXO_BEARER = /^bearer\s+(.+)$/i

/** Os estados de `calls` em que ainda há ligação no ar ou por sair. */
const VIVOS: ReadonlySet<string> = new Set(['queued', 'ringing', 'in_progress'])

export interface ItemDaFila {
  readonly id: string
  readonly account_id: string
  readonly status: 'queued' | 'claimed' | 'done' | 'failed' | 'canceled'
  readonly call_id: string | null
}

export interface ChamadaDoCancelamento {
  readonly id: string
  readonly account_id: string
  readonly status: 'queued' | 'ringing' | 'in_progress' | 'ended' | 'failed'
  readonly end_reason: string | null
  readonly provider_call_sid: string | null
  readonly finalized_at: string | null
}

/** Uma linha de `audit_log`, com as chaves da tabela. */
export interface LinhaDeAuditoria {
  readonly account_id: string
  readonly actor: 'user'
  readonly actor_id: string
  readonly source: string
  readonly action: 'dial_queue_canceled' | 'call_canceled'
  readonly target_type: 'dial_queue' | 'calls'
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
  readonly correlation_id: string
}

export interface PedidoDeEncerramento {
  readonly providerCallSid: string
  /** O par da telefonia, já resolvido pela cascata. Não sai daqui. */
  readonly identificador: string
  readonly token: string
}

export interface UsuarioDaSessao {
  readonly id: string
}

export interface PortaDoCancelamento {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  itemDaFila(itemId: string): Promise<ItemDaFila | null>
  chamada(chamadaId: string): Promise<ChamadaDoCancelamento | null>
  /** `status = 'canceled' where status = 'queued'`. Falso: outro chegou antes. */
  retirarDaFila(itemId: string): Promise<boolean>
  /** Desfaz `retirarDaFila`: `status = 'queued' where status = 'canceled'`. */
  devolverAFila(itemId: string): Promise<void>
  /**
   * `status = 'failed', end_reason = 'canceled', ended_at = agora where status =
   * 'queued' and provider_call_sid is null and finalized_at is null`.
   */
  fecharAntesDeDiscar(chamadaId: string, agora: string): Promise<boolean>
  /** Desfaz `fecharAntesDeDiscar`, condicionado ao estado que ele deixou. */
  reabrirAntesDeDiscar(chamadaId: string): Promise<void>
  /**
   * `end_reason = 'canceled' where status in ('ringing', 'in_progress') and
   * finalized_at is null and end_reason is null`. Não muda `status`.
   */
  marcarCancelamento(chamadaId: string): Promise<boolean>
  /** `end_reason = null where end_reason = 'canceled' and finalized_at is null`. */
  desmarcarCancelamento(chamadaId: string): Promise<void>
  registrarAuditoria(linha: LinhaDeAuditoria): Promise<void>
  /** Cascata de `_shared/secrets.ts`. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  encerrarNoProvedor(pedido: PedidoDeEncerramento): Promise<EnvelopeDoProvedor>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly chamadaId: unknown
  readonly itemDaFilaId: unknown
  /** O porquê, que vai para `audit_log.reason`. */
  readonly motivo: unknown
  readonly autorizacao: string | null
}

export interface OpcoesDoCancelamento {
  /** O relógio do pedido, em ISO-8601. */
  readonly agora: string
}

export interface CorpoDoCancelamento {
  readonly ok: true
  readonly alvo: 'fila' | 'chamada'
  readonly id: string
  readonly estado: EstadoDoCancelamento
  readonly mensagem: string
  /** O `status` da linha depois do pedido. */
  readonly status: string
}

export interface RecusaDoCancelamento {
  readonly ok: false
  readonly motivo: MotivoDoCancelamento
  readonly mensagem: string
}

export interface RespostaDoCancelamento {
  readonly status: number
  readonly corpo: CorpoDoCancelamento | RecusaDoCancelamento
}

class RecusaDoPedido extends Error {
  readonly motivo: MotivoDoCancelamento

  constructor(motivo: MotivoDoCancelamento) {
    super(motivo)
    this.motivo = motivo
  }
}

interface Contexto {
  readonly usuarioId: string
  readonly motivo: string | null
  readonly agora: string
  readonly porta: PortaDoCancelamento
  /** Toda credencial resolvida no caminho, para a conferência antes de responder. */
  readonly credenciais: string[]
}

/** Nunca levanta: exceção da porta vira `falha_interna`. */
export async function cancelar(
  pedido: PedidoDaBorda,
  porta: PortaDoCancelamento,
  opcoes: OpcoesDoCancelamento,
): Promise<RespostaDoCancelamento> {
  const credenciais: string[] = []

  let resposta: RespostaDoCancelamento
  try {
    resposta = await conduzir(pedido, porta, opcoes, credenciais)
  } catch (erro) {
    resposta = recusa(erro instanceof RecusaDoPedido ? erro.motivo : 'falha_interna')
  }

  try {
    conferirQueNaoVazou(resposta.corpo, credenciais, 'credencial no corpo de call-cancel')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}

async function conduzir(
  pedido: PedidoDaBorda,
  porta: PortaDoCancelamento,
  opcoes: OpcoesDoCancelamento,
  credenciais: string[],
): Promise<RespostaDoCancelamento> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  const chamadaId = uuid(pedido.chamadaId)
  const itemId = uuid(pedido.itemDaFilaId)
  const informados = [pedido.chamadaId, pedido.itemDaFilaId].filter((v) => v !== null && v !== undefined)
  if (informados.length !== 1 || (chamadaId === null && itemId === null)) return recusa('alvo_invalido')

  const usuario = await porta.usuarioDaSessao(jwt)
  if (!usuario) return recusa('sessao_invalida')

  const contexto: Contexto = {
    usuarioId: usuario.id,
    motivo: texto(pedido.motivo),
    agora: opcoes.agora,
    porta,
    credenciais,
  }

  if (itemId !== null) return cancelarItem(itemId, contexto)
  return cancelarChamada(chamadaId ?? '', contexto)
}

// A fila -------------------------------------------------------------------------

async function cancelarItem(itemId: string, contexto: Contexto): Promise<RespostaDoCancelamento> {
  const { porta } = contexto
  const item = await porta.itemDaFila(itemId)
  if (!item) return recusa('alvo_desconhecido')
  await exigirPapel(item.account_id, contexto)

  // Item que já virou chamada: o que se cancela é ela.
  if (item.call_id !== null && (item.status === 'claimed' || item.status === 'done')) {
    return cancelarChamada(item.call_id, contexto, true)
  }
  if (item.status === 'claimed') return recusa('em_discagem')
  if (item.status !== 'queued') return atendido('fila', item.id, 'ja_retirado', item.status)

  if (!(await porta.retirarDaFila(item.id))) {
    const atual = await porta.itemDaFila(item.id)
    if (atual?.status === 'canceled' || atual?.status === 'failed') {
      return atendido('fila', item.id, 'ja_retirado', atual.status)
    }
    return recusa(atual?.status === 'claimed' ? 'em_discagem' : 'em_transicao')
  }

  await trilhaOuDesfaz(
    {
      account_id: item.account_id,
      actor: 'user',
      actor_id: contexto.usuarioId,
      source: FONTE_DA_TRILHA,
      action: 'dial_queue_canceled',
      target_type: 'dial_queue',
      target_id: item.id,
      reason: contexto.motivo,
      payload: { estado_anterior: 'queued' },
    },
    () => porta.devolverAFila(item.id),
    contexto,
  )

  return atendido('fila', item.id, 'retirado_da_fila', 'canceled')
}

// A chamada ----------------------------------------------------------------------

async function cancelarChamada(
  chamadaId: string,
  contexto: Contexto,
  papelJaConferido = false,
): Promise<RespostaDoCancelamento> {
  const { porta } = contexto
  const chamada = await porta.chamada(chamadaId)
  if (!chamada) return recusa('alvo_desconhecido')
  if (!papelJaConferido) await exigirPapel(chamada.account_id, contexto)

  const parada = estadoParado(chamada)
  if (parada) return atendido('chamada', chamada.id, parada, chamada.status)

  const sid = chamada.provider_call_sid?.trim() ?? ''
  if (chamada.status === 'queued' && sid === '') return fecharAntesDeDiscar(chamada, contexto)
  if (sid === '') return recusa('sem_identificador_no_provedor')

  return encerrarEmCurso(chamada, sid, contexto)
}

/** Chamada que ainda não saiu: fecha aqui, porque não há conversa a finalizar. */
async function fecharAntesDeDiscar(
  chamada: ChamadaDoCancelamento,
  contexto: Contexto,
): Promise<RespostaDoCancelamento> {
  const { porta } = contexto
  if (!(await porta.fecharAntesDeDiscar(chamada.id, contexto.agora))) {
    return releitura(chamada.id, contexto)
  }

  await trilhaOuDesfaz(
    linhaDaChamada(chamada, contexto, 'antes_de_discar'),
    () => porta.reabrirAntesDeDiscar(chamada.id),
    contexto,
  )

  return atendido('chamada', chamada.id, 'cancelada_antes_de_discar', 'failed')
}

/** Chamada no ar: marca, registra e pede o encerramento. Quem fecha é a finalização. */
async function encerrarEmCurso(
  chamada: ChamadaDoCancelamento,
  sid: string,
  contexto: Contexto,
): Promise<RespostaDoCancelamento> {
  const { porta } = contexto

  // A credencial antes da marca: sem ela não há como encerrar, e a marca posta
  // à toa faria o pedido seguinte responder "já cancelada" sem ter encerrado.
  const identificador = await exigirCredencial(chamada.account_id, CHAVE_DO_IDENTIFICADOR, contexto)
  const token = await exigirCredencial(chamada.account_id, CHAVE_DO_TOKEN, contexto)

  if (!(await porta.marcarCancelamento(chamada.id))) return releitura(chamada.id, contexto)

  await trilhaOuDesfaz(
    linhaDaChamada(chamada, contexto, 'encerramento_pedido'),
    () => porta.desmarcarCancelamento(chamada.id),
    contexto,
  )

  const resposta = await porta.encerrarNoProvedor({ providerCallSid: sid, identificador, token })

  try {
    await porta.registrarEventoDeIntegracao({
      account_id: chamada.account_id,
      direction: 'outbound',
      provider: PROVEDOR_DE_TELEFONIA,
      endpoint: resposta.endpoint ?? 'calls',
      request: { call_sid: sid, status: 'completed' },
      response: { ok: resposta.ok },
      status_code: resposta.status ?? null,
      latency_ms: resposta.latenciaMs ?? null,
      correlation_id: chamada.id,
    })
  } catch {
    // Observabilidade perdida não muda o cancelamento.
  }

  if (!resposta.ok) {
    await porta.desmarcarCancelamento(chamada.id)
    return recusa('provedor_nao_encerrou')
  }

  return atendido('chamada', chamada.id, 'encerrando', chamada.status)
}

/**
 * A escrita condicionada não voltou linha: outro caminho mudou a chamada entre
 * a leitura e o update. Lê de novo e responde o que encontrou, sem tentar outra
 * vez — laço de retentativa contra a finalização é justamente a corrida.
 */
async function releitura(chamadaId: string, contexto: Contexto): Promise<RespostaDoCancelamento> {
  const atual = await contexto.porta.chamada(chamadaId)
  if (!atual) return recusa('alvo_desconhecido')
  const parada = estadoParado(atual)
  if (parada) return atendido('chamada', atual.id, parada, atual.status)
  return recusa('em_transicao')
}

/** O estado em que não há nada a fazer, ou nulo quando ainda há ligação viva. */
function estadoParado(chamada: ChamadaDoCancelamento): EstadoDoCancelamento | null {
  if (chamada.finalized_at !== null || !VIVOS.has(chamada.status)) {
    return chamada.end_reason === 'canceled' ? 'ja_cancelada' : 'ja_encerrada'
  }
  if (chamada.end_reason === 'canceled') return 'ja_cancelada'
  return null
}

function linhaDaChamada(
  chamada: ChamadaDoCancelamento,
  contexto: Contexto,
  efeito: 'antes_de_discar' | 'encerramento_pedido',
): LinhaDeAuditoria {
  return {
    account_id: chamada.account_id,
    actor: 'user',
    actor_id: contexto.usuarioId,
    source: FONTE_DA_TRILHA,
    action: 'call_canceled',
    target_type: 'calls',
    target_id: chamada.id,
    reason: contexto.motivo,
    payload: { estado_anterior: chamada.status, efeito },
  }
}

// Apoio --------------------------------------------------------------------------

async function exigirPapel(contaId: string, contexto: Contexto): Promise<void> {
  const papel = await contexto.porta.papelNaConta(contaId, contexto.usuarioId)
  if (!papel) throw new RecusaDoPedido('alvo_desconhecido')
  if (!PAPEIS_QUE_CANCELAM.has(papel)) throw new RecusaDoPedido('papel_insuficiente')
}

async function exigirCredencial(contaId: string, chave: string, contexto: Contexto): Promise<string> {
  const resolucao = await contexto.porta.credencial(contaId, PROVEDOR_DE_TELEFONIA, chave)
  if (!resolucao.ok) throw new RecusaDoPedido('credencial_indisponivel')
  contexto.credenciais.push(resolucao.valor)
  return resolucao.valor
}

/** Sem trilha não há cancelamento: a falha desfaz a escrita e recusa o pedido. */
async function trilhaOuDesfaz(
  linha: LinhaDeAuditoria,
  desfazer: () => Promise<void>,
  contexto: Contexto,
): Promise<void> {
  try {
    await contexto.porta.registrarAuditoria(linha)
  } catch {
    await desfazer()
    throw new RecusaDoPedido('falha_interna')
  }
}

function atendido(
  alvo: CorpoDoCancelamento['alvo'],
  id: string,
  estado: EstadoDoCancelamento,
  status: string,
): RespostaDoCancelamento {
  return {
    status: 200,
    corpo: { ok: true, alvo, id, estado, mensagem: MENSAGENS_DO_ESTADO[estado], status },
  }
}

function recusa(motivo: MotivoDoCancelamento): RespostaDoCancelamento {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}

function uuid(valor: unknown): string | null {
  const dado = typeof valor === 'string' ? valor.trim() : ''
  return UUID.test(dado) ? dado : null
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const dado = valor.trim()
  return dado === '' ? null : dado
}

function extrairJwt(autorizacao: string | null): string | null {
  const casado = PREFIXO_BEARER.exec(autorizacao?.trim() ?? '')
  const jwt = casado?.[1]?.trim() ?? ''
  return jwt === '' ? null : jwt
}
