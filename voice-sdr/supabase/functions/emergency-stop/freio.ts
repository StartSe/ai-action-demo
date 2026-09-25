// emergency-stop: o freio de emergência (RF-011, L-04, RF-008).
//
// Duas ações no mesmo endereço, separadas por `acao`: `parar` puxa o freio e
// encerra o que está no ar; `retomar` solta o freio. Retomar é sempre um ato
// explícito de alguém, com motivo: não há retomada por tempo em lugar nenhum.
//
// **A GRAVAÇÃO VEM PRIMEIRO, e a ordem é o critério.** A primeira escrita do
// pedido é `dialing_paused_at`, `dialing_paused_by` e `dialing_paused_reason`
// na conta, num `update ... where dialing_paused_at is null returning`. Assim
// que ela volta, o passo 0 de `guard_dial` já recusa toda discagem nova — a do
// painel, a de `cron-dial` e a de qualquer rotina, porque todas passam por
// `call-place` e pela guarda. Os encerramentos vêm depois, e nenhum deles é
// condição para a conta estar parada: o freio não depende da telefonia estar de
// pé. Nada lê o estado antes dessa escrita, porque uma leitura a mais é tempo a
// mais com a conta discando.
//
// **Idempotente.** Puxar o freio de uma conta já parada não move
// `dialing_paused_at` (a condição do update não casa) e não escreve trilha de
// freio. A varredura das chamadas em curso roda de novo, e é de propósito: pega
// a chamada que passou pela guarda um instante antes da pausa e ainda não
// estava no ar na primeira varredura. O que impede encerrar a mesma chamada duas
// vezes é a marca: só entra na varredura chamada com `end_reason` nulo, e a
// marca `canceled` é posta por update condicionado a isso, antes da ida à
// telefonia.
//
// **Chamada em curso é marcada e o encerramento é pedido; quem fecha é
// `call-finalize`**, como em `call-cancel`. A marca `end_reason = 'canceled'`
// vai com o motivo da parada na trilha da chamada (`calls` não tem coluna de
// motivo livre, e `audit_log.reason` é onde o porquê de um ato mora).
//
// **Chamada que a telefonia recusou encerrar não é esquecida.** A marca fica —
// ao contrário de `call-cancel`, que a desfaz para o operador tentar de novo —,
// porque aqui a decisão já foi tomada para a conta inteira e o `status`
// continua vivo: `cron-call-recovery` a alcança pela idade máxima (R-01) e a
// finalização preserva o `canceled`. A falha fica escrita em três lugares: no
// corpo da resposta, chamada por chamada; na trilha da chamada, com o motivo;
// e em `integration_events`, com o status que a telefonia devolveu.
//
// **Encerramentos em paralelo com teto declarado**
// (`CONCORRENCIA_DOS_ENCERRAMENTOS`). Um por vez, dez chamadas somariam dez
// idas à telefonia; todas de uma vez, uma conta com duzentas chamadas abriria
// duzentas conexões de uma função de borda.
//
// **A trilha do freio é do ato** (RF-008): autor, hora (`default now()` da
// coluna) e motivo, escrita logo depois da gravação. Trilha que falha NÃO solta
// o freio — conta discando por causa de um registro perdido é o pior desfecho
// possível —, e o autor não se perde: `dialing_paused_by` está na própria linha,
// e o gatilho `accounts_auditoria` registra a mudança das três colunas. O corpo
// diz `semRegistro: true`. Na retomada é o contrário: trilha que falha devolve o
// freio, porque o lado seguro de uma retomada sem autor é continuar parado.
//
// **A PAUSA DE CAMPANHA (L-04) NÃO ENTRA.** `campaigns` é da F7 e a tabela não
// existe; pausar uma coisa que não existe seria um update que sempre afeta zero
// linhas e passa verde em qualquer teste. O ponto de extensão nasce declarado:
// `PortaDoFreio.pausarCampanhas` é opcional, é chamado logo depois da trilha do
// freio e antes dos encerramentos, e a F7 só precisa implementá-lo em
// `index.ts`. Até lá, campanha nenhuma disca de conta parada de qualquer jeito:
// `cron-campaign-dispatch` escreve em `dial_queue`, e quem consome a fila é
// `cron-dial`, que recusa conta parada (`_shared/discagem/pausa.ts`).
//
// **A conta vem no pedido e o vínculo é conferido contra ela.** Quem não é
// membro recebe o mesmo 404 da conta que não existe; membro abaixo de `admin`
// recebe 403.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e a
// telefonia entram por `PortaDoFreio`, implementada em `index.ts`.

import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  FRASES_DAS_FALHAS,
  MENSAGENS,
  MENSAGENS_DO_ESTADO,
  STATUS,
  type EstadoDoFreio,
  type FalhaDoEncerramento,
  type MotivoDoFreio,
} from './respostas.ts'

/** Quem puxa e quem solta o freio: `has_role(conta, 'admin')`, que inclui o dono. */
export const PAPEIS_QUE_PARAM: ReadonlySet<string> = new Set(['owner', 'admin'])

/** Quantos encerramentos vão à telefonia ao mesmo tempo. */
export const CONCORRENCIA_DOS_ENCERRAMENTOS = 5

/** A telefonia e as duas chaves no cofre, as mesmas de `call-cancel`. */
export const PROVEDOR_DE_TELEFONIA = 'telefonia'
export const CHAVE_DO_IDENTIFICADOR = 'account_sid'
export const CHAVE_DO_TOKEN = 'auth_token'

/** `audit_log.source`: por qual porta a mudança entrou. */
export const FONTE_DA_TRILHA = 'edge:emergency-stop'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIXO_BEARER = /^bearer\s+(.+)$/i

export type AcaoDoFreio = 'parar' | 'retomar'

/** As três colunas do freio, que um `check` faz andarem juntas. */
export interface FreioDaConta {
  readonly dialing_paused_at: string | null
  readonly dialing_paused_by: string | null
  readonly dialing_paused_reason: string | null
}

/**
 * Chamada que `chamadasEmCurso` devolve: `status in ('queued', 'ringing',
 * 'in_progress')`, `provider_call_sid` preenchido, `finalized_at` nulo e
 * `end_reason` nulo. `queued` sem identificador fica de fora: ainda não há o
 * que encerrar na telefonia, e `cron-call-recovery` a fecha como `dial_lost`.
 */
export interface ChamadaEmCurso {
  readonly id: string
  readonly status: 'queued' | 'ringing' | 'in_progress'
  readonly provider_call_sid: string
}

/** Uma linha de `audit_log`, com as chaves da tabela. */
export interface LinhaDeAuditoria {
  readonly account_id: string
  readonly actor: 'user'
  readonly actor_id: string
  readonly source: string
  readonly action: 'dialing_paused' | 'dialing_resumed' | 'call_canceled'
  readonly target_type: 'accounts' | 'calls'
  readonly target_id: string
  readonly reason: string
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

export interface PortaDoFreio {
  usuarioDaSessao(jwt: string): Promise<UsuarioDaSessao | null>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /**
   * `update accounts set dialing_paused_at, dialing_paused_by,
   * dialing_paused_reason where id = conta and dialing_paused_at is null
   * returning dialing_paused_at`. Nulo: a conta já estava parada.
   */
  puxarFreio(contaId: string, freio: { em: string; por: string; motivo: string }): Promise<string | null>
  estadoDoFreio(contaId: string): Promise<FreioDaConta | null>
  /** As três colunas nulas `where dialing_paused_at is not null`. Falso: já operava. */
  soltarFreio(contaId: string): Promise<boolean>
  /** Desfaz `soltarFreio` com os valores de antes, `where dialing_paused_at is null`. */
  repuxarFreio(contaId: string, anterior: FreioDaConta): Promise<void>
  /**
   * Ponto de extensão da F7 (L-04): pausar as campanhas ativas da conta.
   * `campaigns` não existe na F2, e por isso `index.ts` não o implementa.
   */
  pausarCampanhas?(contaId: string, motivo: string): Promise<void>
  chamadasEmCurso(contaId: string): Promise<readonly ChamadaEmCurso[]>
  /**
   * `end_reason = 'canceled' where id = chamada and status in ('queued',
   * 'ringing', 'in_progress') and finalized_at is null and end_reason is null`.
   * Não muda `status`. Falso: outro caminho chegou antes.
   */
  marcarCancelamento(chamadaId: string): Promise<boolean>
  registrarAuditoria(linha: LinhaDeAuditoria): Promise<void>
  /** Cascata de `_shared/secrets.ts`. */
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  encerrarNoProvedor(pedido: PedidoDeEncerramento): Promise<EnvelopeDoProvedor>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly acao: unknown
  readonly contaId: unknown
  /** O porquê, que vai para `dialing_paused_reason` e `audit_log.reason`. */
  readonly motivo: unknown
  readonly autorizacao: string | null
}

export interface OpcoesDoFreio {
  /** O relógio do pedido, em ISO-8601. É o `dialing_paused_at` gravado. */
  readonly agora: string
}

export interface FalhaDeEncerramento {
  readonly chamadaId: string
  readonly motivo: FalhaDoEncerramento
  readonly mensagem: string
}

export interface RelatorioDosEncerramentos {
  /** Chamadas marcadas e com o encerramento confirmado pela telefonia. */
  readonly pedidos: number
  /** Chamadas que outro caminho fechou ou marcou entre a leitura e a marca. */
  readonly jaEmEncerramento: number
  /** Chamadas marcadas cujo encerramento não saiu: a recuperação as alcança. */
  readonly falhas: readonly FalhaDeEncerramento[]
}

export interface CorpoDoFreio {
  readonly ok: true
  readonly estado: EstadoDoFreio
  readonly mensagem: string
  /** O `dialing_paused_at` que vale, na parada; nulo na retomada. */
  readonly pausadaEm: string | null
  readonly encerramentos?: RelatorioDosEncerramentos
  /** A trilha do freio não foi gravada. O freio continua puxado. */
  readonly semRegistro?: true
}

export interface RecusaDoFreio {
  readonly ok: false
  readonly motivo: MotivoDoFreio
  readonly mensagem: string
}

export interface RespostaDoFreio {
  readonly status: number
  readonly corpo: CorpoDoFreio | RecusaDoFreio
}

interface Contexto {
  readonly contaId: string
  readonly usuarioId: string
  readonly motivo: string
  readonly agora: string
  readonly porta: PortaDoFreio
  /** Toda credencial resolvida no caminho, para a conferência antes de responder. */
  readonly credenciais: string[]
}

/** Nunca levanta: exceção da porta vira `falha_interna`. */
export async function atenderFreio(
  pedido: PedidoDaBorda,
  porta: PortaDoFreio,
  opcoes: OpcoesDoFreio,
): Promise<RespostaDoFreio> {
  const credenciais: string[] = []

  let resposta: RespostaDoFreio
  try {
    resposta = await conduzir(pedido, porta, opcoes, credenciais)
  } catch {
    resposta = recusa('falha_interna')
  }

  try {
    conferirQueNaoVazou(resposta.corpo, credenciais, 'credencial no corpo de emergency-stop')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}

async function conduzir(
  pedido: PedidoDaBorda,
  porta: PortaDoFreio,
  opcoes: OpcoesDoFreio,
  credenciais: string[],
): Promise<RespostaDoFreio> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  const jwt = extrairJwt(pedido.autorizacao)
  if (!jwt) return recusa('sem_sessao')

  const acao = pedido.acao
  if (acao !== 'parar' && acao !== 'retomar') return recusa('acao_invalida')

  const contaId = uuid(pedido.contaId)
  if (contaId === null) return recusa('conta_invalida')

  const motivo = texto(pedido.motivo)
  if (motivo === null) return recusa('motivo_obrigatorio')

  const usuario = await porta.usuarioDaSessao(jwt)
  if (!usuario) return recusa('sessao_invalida')

  const papel = await porta.papelNaConta(contaId, usuario.id)
  if (!papel) return recusa('conta_desconhecida')
  if (!PAPEIS_QUE_PARAM.has(papel)) return recusa('papel_insuficiente')

  const contexto: Contexto = { contaId, usuarioId: usuario.id, motivo, agora: opcoes.agora, porta, credenciais }
  return acao === 'parar' ? parar(contexto) : retomar(contexto)
}

// Parar ---------------------------------------------------------------------------

async function parar(contexto: Contexto): Promise<RespostaDoFreio> {
  const { porta, contaId } = contexto

  // A primeira escrita do pedido. Daqui em diante a guarda já recusa.
  const puxadoEm = await porta.puxarFreio(contaId, {
    em: contexto.agora,
    por: contexto.usuarioId,
    motivo: contexto.motivo,
  })

  let pausadaEm = puxadoEm
  let semRegistro = false
  if (puxadoEm === null) {
    pausadaEm = (await porta.estadoDoFreio(contaId))?.dialing_paused_at ?? null
  } else {
    try {
      await porta.registrarAuditoria({
        account_id: contaId,
        actor: 'user',
        actor_id: contexto.usuarioId,
        source: FONTE_DA_TRILHA,
        action: 'dialing_paused',
        target_type: 'accounts',
        target_id: contaId,
        reason: contexto.motivo,
        payload: { pausada_em: puxadoEm },
      })
    } catch {
      semRegistro = true
    }
    if (porta.pausarCampanhas) {
      try {
        await porta.pausarCampanhas(contaId, contexto.motivo)
      } catch {
        // A fila já está parada pela conta; campanha que não pausou não disca.
      }
    }
  }

  const encerramentos = await encerrarEmCurso(contexto)
  const estado: EstadoDoFreio = puxadoEm === null ? 'ja_parada' : 'parada'

  return {
    status: 200,
    corpo: {
      ok: true,
      estado,
      mensagem: MENSAGENS_DO_ESTADO[estado],
      pausadaEm,
      encerramentos,
      ...(semRegistro ? { semRegistro: true as const } : {}),
    },
  }
}

type Desfecho = { tipo: 'pedido' } | { tipo: 'ja_em_encerramento' } | { tipo: 'falha'; motivo: FalhaDoEncerramento }

async function encerrarEmCurso(contexto: Contexto): Promise<RelatorioDosEncerramentos> {
  const chamadas = await contexto.porta.chamadasEmCurso(contexto.contaId)
  if (chamadas.length === 0) return { pedidos: 0, jaEmEncerramento: 0, falhas: [] }

  // Uma resolução para a conta inteira: as chamadas são todas da mesma conta.
  const par = await resolverPar(contexto)

  const desfechos = await emParalelo(chamadas, CONCORRENCIA_DOS_ENCERRAMENTOS, (chamada) =>
    encerrarUma(chamada, par, contexto).catch((): Desfecho => ({ tipo: 'falha', motivo: 'falha_interna' })),
  )

  let pedidos = 0
  let jaEmEncerramento = 0
  const falhas: FalhaDeEncerramento[] = []
  desfechos.forEach((desfecho, indice) => {
    if (desfecho.tipo === 'pedido') pedidos += 1
    else if (desfecho.tipo === 'ja_em_encerramento') jaEmEncerramento += 1
    else {
      falhas.push({
        chamadaId: chamadas[indice]?.id ?? '',
        motivo: desfecho.motivo,
        mensagem: FRASES_DAS_FALHAS[desfecho.motivo],
      })
    }
  })
  return { pedidos, jaEmEncerramento, falhas }
}

async function encerrarUma(
  chamada: ChamadaEmCurso,
  par: { identificador: string; token: string } | null,
  contexto: Contexto,
): Promise<Desfecho> {
  const { porta } = contexto
  if (!(await porta.marcarCancelamento(chamada.id))) return { tipo: 'ja_em_encerramento' }

  let falha: FalhaDoEncerramento | null = null
  if (par === null) {
    falha = 'credencial_indisponivel'
  } else {
    const resposta = await porta.encerrarNoProvedor({ providerCallSid: chamada.provider_call_sid, ...par })
    await registrarEvento(chamada, resposta, contexto)
    if (!resposta.ok) falha = 'provedor_nao_encerrou'
  }

  try {
    await porta.registrarAuditoria({
      account_id: contexto.contaId,
      actor: 'user',
      actor_id: contexto.usuarioId,
      source: FONTE_DA_TRILHA,
      action: 'call_canceled',
      target_type: 'calls',
      target_id: chamada.id,
      reason: contexto.motivo,
      payload: {
        origem: 'freio_de_emergencia',
        estado_anterior: chamada.status,
        efeito: falha === null ? 'encerramento_pedido' : 'encerramento_falhou',
        ...(falha === null ? {} : { falha }),
      },
    })
  } catch {
    // A marca já está na chamada e a falha, se houve, vai no corpo.
  }

  return falha === null ? { tipo: 'pedido' } : { tipo: 'falha', motivo: falha }
}

async function resolverPar(contexto: Contexto): Promise<{ identificador: string; token: string } | null> {
  try {
    const identificador = await contexto.porta.credencial(contexto.contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_IDENTIFICADOR)
    const token = await contexto.porta.credencial(contexto.contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_TOKEN)
    if (!identificador.ok || !token.ok) return null
    contexto.credenciais.push(identificador.valor, token.valor)
    return { identificador: identificador.valor, token: token.valor }
  } catch {
    return null
  }
}

async function registrarEvento(
  chamada: ChamadaEmCurso,
  resposta: EnvelopeDoProvedor,
  contexto: Contexto,
): Promise<void> {
  try {
    await contexto.porta.registrarEventoDeIntegracao({
      account_id: contexto.contaId,
      direction: 'outbound',
      provider: PROVEDOR_DE_TELEFONIA,
      endpoint: resposta.endpoint ?? 'calls',
      request: { call_sid: chamada.provider_call_sid, status: 'completed', origem: 'freio_de_emergencia' },
      response: { ok: resposta.ok },
      status_code: resposta.status ?? null,
      latency_ms: resposta.latenciaMs ?? null,
      correlation_id: chamada.id,
    })
  } catch {
    // Observabilidade perdida não muda o encerramento.
  }
}

/** Aplica `tarefa` a cada item com no máximo `limite` no ar, preservando a ordem. */
async function emParalelo<T, R>(
  itens: readonly T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length)
  let proximo = 0
  async function trabalhador(): Promise<void> {
    while (proximo < itens.length) {
      const indice = proximo
      proximo += 1
      resultados[indice] = await tarefa(itens[indice] as T)
    }
  }
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador())
  await Promise.all(trabalhadores)
  return resultados
}

// Retomar -------------------------------------------------------------------------

async function retomar(contexto: Contexto): Promise<RespostaDoFreio> {
  const { porta, contaId } = contexto

  const anterior = await porta.estadoDoFreio(contaId)
  if (!anterior || anterior.dialing_paused_at === null) return atendido('ja_operando', null)
  if (!(await porta.soltarFreio(contaId))) return atendido('ja_operando', null)

  try {
    await porta.registrarAuditoria({
      account_id: contaId,
      actor: 'user',
      actor_id: contexto.usuarioId,
      source: FONTE_DA_TRILHA,
      action: 'dialing_resumed',
      target_type: 'accounts',
      target_id: contaId,
      reason: contexto.motivo,
      payload: {
        pausada_em: anterior.dialing_paused_at,
        pausada_por: anterior.dialing_paused_by,
        motivo_da_parada: anterior.dialing_paused_reason,
      },
    })
  } catch {
    // Retomada sem autor não fica de pé: o lado seguro é a conta parada.
    await porta.repuxarFreio(contaId, anterior)
    return recusa('falha_interna')
  }

  return atendido('retomada', null)
}

// Apoio --------------------------------------------------------------------------

function atendido(estado: EstadoDoFreio, pausadaEm: string | null): RespostaDoFreio {
  return { status: 200, corpo: { ok: true, estado, mensagem: MENSAGENS_DO_ESTADO[estado], pausadaEm } }
}

function recusa(motivo: MotivoDoFreio): RespostaDoFreio {
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
