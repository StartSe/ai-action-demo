// cron-call-recovery: a segunda via da finalização, o vigia da duração e o
// disjuntor (seção 4.6, T-07, T-15, L-12, R-01, RF-417, RF-421).
//
// Roda a cada 2 minutos, dentro do envelope das rotinas, e cuida do que o
// aviso do provedor não fechou. São quatro ramos por chamada, mais a
// classificação pendente e o disjuntor por conta:
//
// 1. **A via dupla.** Chamada sem `finalized_at` cuja conversa terminou é
//    finalizada chamando `call-finalize`. A chamada viva é consultada no
//    provedor antes: acionar a finalização de uma conversa em curso
//    reivindicaria a chamada por 5 minutos (T-15) e o aviso de fim, chegando
//    nesse meio-tempo, receberia 409 — a ficha atrasaria justamente no caso
//    normal. **Nada aqui garante uma finalização só**: quem garante é a
//    reivindicação de `call-finalize` (US-069). O aviso e a varredura no mesmo
//    segundo disputam a mesma linha lá dentro, e a varredura que perde lê 409
//    como resposta certa.
// 2. **A linha órfã** (T-07). `queued` ou `ringing` há mais de 3 minutos sem
//    `provider_call_sid` é a linha que `call-place` deixa de propósito quando o
//    provedor falha depois do insert. Vira `failed` com `dial_lost` e é
//    reprogramada.
// 3. **O vigia da duração** (L-12, RF-421). Conversa que o provedor diz estar
//    em curso além de `max_duration_seconds + 60 s` é encerrada pela telefonia,
//    com `end_reason = 'max_duration'` marcado antes — a finalização preserva a
//    marca. Sem o vigia, a regra dependeria só do provedor.
// 4. **A idade máxima** (R-01). Conversa sem resposta do provedor além de
//    `max_duration + 10 min` vira `ended` com `provider_lost` e é reprogramada.
//    A transcrição fica pendente: a chamada continua sem `finalized_at`, e o
//    ramo 1 tenta buscá-la por 24 horas, depois desiste com registro.
//
// **A classificação pendente** (US-071), que é a segunda via da retaguarda
// (US-140): chamada finalizada há mais de um minuto, atendida por gente, sem
// `classification_source` nem `classified_at`, volta a `call-classify` até
// `TETO_DE_CLASSIFICACOES`. É o que sustenta a classificação em até 2 min
// quando o aviso do provedor falha (RF-410). A finalização aciona a mesma
// borda na primeira via, e quem impede as duas de classificarem juntas é a
// reivindicação de `call-classify` (`reivindicar_classificacao`): a via que
// perde lê 409. Recusa definitiva (400, 404, 422) desiste na hora.
//
// **O disjuntor** (R-01): N falhas consecutivas de provedor em M minutos, com N
// e M de `account_settings`, pausam a discagem da conta com
// `dialing_paused_reason = 'disjuntor'` e deixam uma linha da conta em
// `job_runs`. **A retomada é manual**, pelo mesmo caminho do freio de
// emergência: disjuntor que se rearma sozinho volta a discar contra um
// provedor que ainda está fora. `dialing_paused_by` é `AUTOR_DO_DISJUNTOR`, o
// uuid nulo, porque o check do freio exige autor e quem puxou foi a rotina.
//
// **Nenhum ramo tenta para sempre.** A reivindicação espaça a volta da mesma
// chamada em 2^tentativas minutos (até 30); o encerramento pela telefonia
// desiste em `TETO_DE_ENCERRAMENTOS`, a finalização em `JANELA_DA_TRANSCRICAO_MS`
// e a classificação em `TETO_DE_CLASSIFICACOES`. Quem esgota ganha a marca de
// desistência e a razão em `recovery_note`, e sai da varredura.
//
// **Esta rotina não disca.** A reprogramação enfileira em `dial_queue` e para
// ali; quem disca é `cron-dial`.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados, o
// provedor e as outras funções entram por `PortaDaRecuperacao`, implementada em
// `index.ts` e dublada no teste.

import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-call-recovery'

/** Linha sem `provider_call_sid` há mais que isto é órfã (T-07). */
export const ORFA_APOS_MS = 3 * 60_000

/** Folga do vigia além da duração máxima da conta (L-12). */
export const FOLGA_DA_DURACAO_MS = 60_000

/** Sem resposta do provedor além da duração máxima mais isto, a chamada se perdeu (R-01). */
export const IDADE_MAXIMA_ALEM_DA_DURACAO_MS = 10 * 60_000

/** Por quanto tempo depois do fim a varredura tenta buscar a transcrição (R-01). */
export const JANELA_DA_TRANSCRICAO_MS = 24 * 60 * 60_000

/** Encerramentos pela telefonia que falharam antes de desistir. */
export const TETO_DE_ENCERRAMENTOS = 5

/** Classificações que falharam antes de desistir. */
export const TETO_DE_CLASSIFICACOES = 5

/** `dialing_paused_by` do disjuntor: o check do freio exige autor, e o autor é a rotina. */
export const AUTOR_DO_DISJUNTOR = '00000000-0000-0000-0000-000000000000'

/** `dialing_paused_reason` do disjuntor. */
export const MOTIVO_DO_DISJUNTOR = 'disjuntor'

/** Tamanho máximo de `recovery_note`. */
const TAMANHO_DA_NOTA = 500

/** Uma linha de `reivindicar_recuperacao`. */
export interface ChamadaEmRecuperacao {
  readonly id: string
  readonly account_id: string
  readonly status: 'queued' | 'ringing' | 'in_progress' | 'ended' | 'failed'
  readonly provider_call_sid: string | null
  readonly provider_conversation_id: string | null
  readonly started_at: string
  readonly answered_at: string | null
  readonly ended_at: string | null
  readonly end_reason: string | null
  readonly finalized_at: string | null
  readonly answered_by: string | null
  readonly classification_source: string | null
  readonly recovery_attempts: number
  readonly classify_attempts: number
  readonly max_duration_seconds: number
}

/** Um evento de provedor da conta, o mais recente primeiro. */
export interface EventoDoProvedor {
  readonly at: string
  /** Nulo é "sem resposta": tempo esgotado ou conexão recusada. */
  readonly status_code: number | null
}

/** Uma linha de `contas_para_o_disjuntor`. */
export interface ContaDoDisjuntor {
  readonly account_id: string
  /** O N, `breaker_failures`. */
  readonly falhas: number
  /** O M, `breaker_window_minutes`. */
  readonly janela_em_minutos: number
  readonly eventos: readonly EventoDoProvedor[]
}

/** O que o provedor de voz diz da conversa agora. */
export type EstadoDaConversa = 'em_curso' | 'encerrada' | 'sem_resposta'

/** O que volta de `call-finalize` ou de `call-classify`: só o status importa. */
export interface RespostaDaBorda {
  readonly status: number
}

/** O fim que a varredura escreve, e só nos ramos 2 e 4. */
export interface FimDaPerda {
  /** O update só vale se a chamada ainda estiver num destes estados. */
  readonly de: readonly ChamadaEmRecuperacao['status'][]
  readonly status: 'failed' | 'ended'
  readonly end_reason: 'dial_lost' | 'provider_lost'
  readonly ended_at: string
}

/** O que a varredura anota na chamada. Chave ausente é "não mexi". */
export interface NotaDaRecuperacao {
  readonly recovery_attempts?: number
  readonly recovery_note?: string
  readonly recovery_gave_up_at?: string
  readonly classify_attempts?: number
  readonly classify_gave_up_at?: string
}

/** O freio que o disjuntor puxa, nas três colunas do check. */
export interface FreioDoDisjuntor {
  readonly dialing_paused_at: string
  readonly dialing_paused_by: string
  readonly dialing_paused_reason: string
}

/** A linha da conta em `job_runs` quando o disjuntor dispara. */
export interface LinhaDoDisjuntor {
  readonly routine: string
  readonly account_id: string
  readonly started_at: string
  readonly finished_at: string
  readonly items: number
  readonly error: string
}

export interface PortaDaRecuperacao {
  /** `reivindicar_recuperacao`: `for update skip locked`, grava `recovery_claimed_at`. */
  reivindicarChamadas(limite: number, instante: string): Promise<readonly ChamadaEmRecuperacao[]>
  /** `contas_para_o_disjuntor`. */
  contasParaODisjuntor(instante: string): Promise<readonly ContaDoDisjuntor[]>
  /** Consulta a conversa no provedor de voz, com o rastro em `integration_events`. */
  estadoDaConversa(contaId: string, conversaId: string): Promise<EstadoDaConversa>
  /** Aciona `call-finalize` com o segredo interno. */
  finalizar(chamadaId: string): Promise<RespostaDaBorda>
  /** Aciona `call-classify` com o segredo interno. */
  classificar(chamadaId: string): Promise<RespostaDaBorda>
  /** `end_reason = 'max_duration'` onde ainda não há motivo e não há finalização. */
  marcarDuracaoMaxima(chamadaId: string): Promise<void>
  /** Pede o encerramento à telefonia. Verdadeiro quando ela aceitou. */
  encerrarNaTelefonia(contaId: string, providerCallSid: string): Promise<boolean>
  /** O update condicionado dos ramos 2 e 4. Verdadeiro quando esta passagem venceu. */
  fecharComoPerdida(chamadaId: string, fim: FimDaPerda): Promise<boolean>
  /** `reprogramar_chamada_perdida`: devolve o código. */
  reprogramar(chamadaId: string, instante: string): Promise<string>
  anotar(chamadaId: string, nota: NotaDaRecuperacao): Promise<void>
  /** Puxa o freio só onde não há freio. Verdadeiro quando esta passagem puxou. */
  acionarDisjuntor(contaId: string, freio: FreioDoDisjuntor): Promise<boolean>
  registrarDisjuntor(linha: LinhaDoDisjuntor): Promise<void>
}

/** O primeiro passo de cada chamada reivindicada. */
export type RamoDaChamada =
  | { readonly ramo: 'orfa' }
  | { readonly ramo: 'consultar' }
  | { readonly ramo: 'finalizar' }
  | { readonly ramo: 'classificar' }
  | { readonly ramo: 'nenhum' }

/** O que fazer com a chamada viva depois de ouvir o provedor. */
export type DecisaoDaConsulta =
  | { readonly decisao: 'finalizar' }
  | { readonly decisao: 'encerrar_por_duracao' }
  | { readonly decisao: 'perdida' }
  | { readonly decisao: 'aguardar' }

const VIVAS: ReadonlySet<string> = new Set(['queued', 'ringing', 'in_progress'])

/** Desde quando a conversa corre: o atendimento, ou o nascimento da linha. */
function inicioDaConversa(chamada: ChamadaEmRecuperacao): number {
  return Date.parse(chamada.answered_at ?? chamada.started_at)
}

/** As situações do provedor em que a conversa ainda está no ar. */
const SITUACOES_NO_AR: ReadonlySet<string> = new Set(['initiated', 'in-progress'])

/**
 * O estado da conversa a partir do corpo de `GET convai/conversations/{id}`
 * (o formato é a suposição declarada em `call-finalize/formato-do-provedor.ts`).
 * `processing` é conversa encerrada com a transcrição a caminho: é ali que a
 * finalização entra, e quem espera a transcrição é ela. Situação que não se
 * reconhece é tratada como no ar — o lado que espera, e o vigia da duração
 * ainda a alcança.
 */
export function lerEstadoDaConversa(corpo: unknown): EstadoDaConversa {
  if (typeof corpo !== 'object' || corpo === null) return 'sem_resposta'
  const situacao = (corpo as Record<string, unknown>).status
  if (typeof situacao !== 'string') return 'em_curso'
  if (SITUACOES_NO_AR.has(situacao)) return 'em_curso'
  return situacao === 'processing' || situacao === 'done' || situacao === 'failed' ? 'encerrada' : 'em_curso'
}

/** Qual ramo a chamada toma, pelo que está gravado nela. */
export function ramoDaChamada(chamada: ChamadaEmRecuperacao, instanteMs: number): RamoDaChamada {
  if (chamada.finalized_at !== null) {
    return chamada.answered_by === 'human' && chamada.classification_source === null
      ? { ramo: 'classificar' }
      : { ramo: 'nenhum' }
  }

  if (
    (chamada.status === 'queued' || chamada.status === 'ringing') &&
    chamada.provider_call_sid === null &&
    instanteMs - Date.parse(chamada.started_at) > ORFA_APOS_MS
  ) {
    return { ramo: 'orfa' }
  }

  if (chamada.provider_conversation_id === null) return { ramo: 'nenhum' }
  return VIVAS.has(chamada.status) ? { ramo: 'consultar' } : { ramo: 'finalizar' }
}

/** A chamada viva, depois de ouvir o provedor. */
export function decisaoDaConsulta(
  chamada: ChamadaEmRecuperacao,
  estado: EstadoDaConversa,
  instanteMs: number,
): DecisaoDaConsulta {
  if (estado === 'encerrada') return { decisao: 'finalizar' }

  const decorrido = instanteMs - inicioDaConversa(chamada)
  const duracaoMaxima = chamada.max_duration_seconds * 1000
  if (estado === 'em_curso') {
    return decorrido > duracaoMaxima + FOLGA_DA_DURACAO_MS
      ? { decisao: 'encerrar_por_duracao' }
      : { decisao: 'aguardar' }
  }
  return decorrido > duracaoMaxima + IDADE_MAXIMA_ALEM_DA_DURACAO_MS
    ? { decisao: 'perdida' }
    : { decisao: 'aguardar' }
}

/** Falha de provedor para o disjuntor: sem resposta ou 5xx. 4xx é pedido nosso. */
export function eventoFalhou(evento: EventoDoProvedor): boolean {
  return evento.status_code === null || evento.status_code >= 500
}

/**
 * O disjuntor dispara quando os N eventos de provedor mais recentes da janela
 * de M minutos são todos falha. "Consecutivas" é isto: um sucesso entre eles
 * zera a contagem, porque o provedor respondeu.
 */
export function disjuntorDispara(conta: ContaDoDisjuntor, instanteMs: number): boolean {
  const desde = instanteMs - conta.janela_em_minutos * 60_000
  const naJanela = [...conta.eventos]
    .filter((evento) => {
      const em = Date.parse(evento.at)
      return em > desde && em <= instanteMs
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, conta.falhas)
  return naJanela.length >= conta.falhas && naJanela.every(eventoFalhou)
}

type ItemDaRecuperacao =
  | (ItemDaRotina & { readonly tipo: 'disjuntor'; readonly conta: ContaDoDisjuntor })
  | (ItemDaRotina & { readonly tipo: 'chamada'; readonly chamada: ChamadaEmRecuperacao })

export interface PedidoDeRecuperacao {
  readonly porta: PortaDaRecuperacao
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-call-recovery`, dentro do envelope das rotinas. */
export function recuperarChamadas(pedido: PedidoDeRecuperacao): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  const agora = pedido.agora ?? Date.now

  return executarRotina<ItemDaRecuperacao>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const instanteMs = Date.parse(instante)
        // O disjuntor antes: conta cujo provedor caiu não pode esperar a
        // varredura das chamadas para parar de discar.
        const contas = (await porta.contasParaODisjuntor(instante))
          .filter((conta) => disjuntorDispara(conta, instanteMs))
          .slice(0, limite)
        const itens: ItemDaRecuperacao[] = contas.map((conta) => ({
          chave: `disjuntor:${conta.account_id}`,
          tipo: 'disjuntor',
          conta,
        }))

        const restante = limite - itens.length
        if (restante > 0) {
          for (const chamada of await porta.reivindicarChamadas(restante, instante)) {
            itens.push({ chave: `chamada:${chamada.id}`, tipo: 'chamada', chamada })
          }
        }
        return itens
      },

      async processar(item, instante) {
        if (item.tipo === 'disjuntor') {
          await dispararDisjuntor(porta, item.conta, instante)
          return
        }
        await recuperarChamada(porta, item.chamada, instante)
      },
    },
  })
}

async function dispararDisjuntor(porta: PortaDaRecuperacao, conta: ContaDoDisjuntor, instante: string) {
  const puxou = await porta.acionarDisjuntor(conta.account_id, {
    dialing_paused_at: instante,
    dialing_paused_by: AUTOR_DO_DISJUNTOR,
    dialing_paused_reason: MOTIVO_DO_DISJUNTOR,
  })
  if (!puxou) return
  await porta.registrarDisjuntor({
    routine: NOME_DA_ROTINA,
    account_id: conta.account_id,
    started_at: instante,
    finished_at: instante,
    items: conta.falhas,
    error: `disjuntor: ${conta.falhas} falhas consecutivas de provedor em ${conta.janela_em_minutos} min; discagem pausada, retomada manual`,
  })
}

async function recuperarChamada(porta: PortaDaRecuperacao, chamada: ChamadaEmRecuperacao, instante: string) {
  const instanteMs = Date.parse(instante)
  const ramo = ramoDaChamada(chamada, instanteMs)

  switch (ramo.ramo) {
    case 'nenhum':
      return
    case 'orfa':
      await fecharPerdida(porta, chamada, instante, {
        de: ['queued', 'ringing'],
        status: 'failed',
        end_reason: 'dial_lost',
        ended_at: instante,
      })
      return
    case 'finalizar':
      await finalizar(porta, chamada, instanteMs)
      return
    case 'classificar':
      await classificar(porta, chamada, instante)
      return
    case 'consultar':
      break
  }

  const estado = await porta.estadoDaConversa(chamada.account_id, chamada.provider_conversation_id as string)
  const decisao = decisaoDaConsulta(chamada, estado, instanteMs)
  switch (decisao.decisao) {
    case 'aguardar':
      return
    case 'finalizar':
      await finalizar(porta, chamada, instanteMs)
      return
    case 'encerrar_por_duracao':
      await encerrarPorDuracao(porta, chamada, instante)
      return
    case 'perdida':
      await fecharPerdida(porta, chamada, instante, {
        de: ['ringing', 'in_progress'],
        status: 'ended',
        end_reason: 'provider_lost',
        ended_at: instante,
      })
      return
  }
}

/** Ramos 2 e 4: o fim condicionado, e a reprogramação só para quem venceu. */
async function fecharPerdida(
  porta: PortaDaRecuperacao,
  chamada: ChamadaEmRecuperacao,
  instante: string,
  fim: FimDaPerda,
) {
  if (!(await porta.fecharComoPerdida(chamada.id, fim))) return
  const codigo = await porta.reprogramar(chamada.id, instante)
  await porta.anotar(chamada.id, { recovery_note: nota(`${fim.end_reason}; reprogramação: ${codigo}`) })
}

/** Ramo 1: aciona `call-finalize` e lê a resposta. */
async function finalizar(porta: PortaDaRecuperacao, chamada: ChamadaEmRecuperacao, instanteMs: number) {
  const fimMs = Date.parse(chamada.ended_at ?? chamada.started_at)
  if (instanteMs - fimMs > JANELA_DA_TRANSCRICAO_MS) {
    await porta.anotar(chamada.id, {
      recovery_gave_up_at: new Date(instanteMs).toISOString(),
      recovery_note: nota(
        `desistência: a transcrição não chegou em 24 h (${chamada.recovery_attempts} tentativas)`,
      ),
    })
    return
  }

  let status: number | null
  try {
    status = (await porta.finalizar(chamada.id)).status
  } catch {
    status = null
  }

  // 200 finalizou; 409 é outra passagem com a chamada, que é a via dupla
  // funcionando.
  if (status === 200 || status === 409) return

  if (status === 422 || status === 400) {
    await porta.anotar(chamada.id, {
      recovery_gave_up_at: new Date(instanteMs).toISOString(),
      recovery_note: nota(`desistência: call-finalize recusou em definitivo (${status})`),
    })
    return
  }

  const tentativas = chamada.recovery_attempts + 1
  await porta.anotar(chamada.id, {
    recovery_attempts: tentativas,
    recovery_note: nota(`finalização ${tentativas}: call-finalize ${status === null ? 'não respondeu' : `respondeu ${status}`}`),
  })
}

/** Ramo 3: marca o motivo e pede o fim à telefonia. */
async function encerrarPorDuracao(porta: PortaDaRecuperacao, chamada: ChamadaEmRecuperacao, instante: string) {
  const tentativas = chamada.recovery_attempts + 1
  const sid = chamada.provider_call_sid

  let aceitou = false
  if (sid !== null) {
    await porta.marcarDuracaoMaxima(chamada.id)
    try {
      aceitou = await porta.encerrarNaTelefonia(chamada.account_id, sid)
    } catch {
      aceitou = false
    }
  }
  if (aceitou) {
    await porta.anotar(chamada.id, { recovery_note: nota('max_duration: encerramento pedido à telefonia') })
    return
  }

  const razao = sid === null ? 'sem provider_call_sid' : 'a telefonia recusou'
  if (tentativas >= TETO_DE_ENCERRAMENTOS) {
    await porta.anotar(chamada.id, {
      recovery_attempts: tentativas,
      recovery_gave_up_at: instante,
      recovery_note: nota(`desistência: encerramento por duração falhou ${tentativas} vezes (${razao})`),
    })
    return
  }
  await porta.anotar(chamada.id, {
    recovery_attempts: tentativas,
    recovery_note: nota(`encerramento por duração ${tentativas}: ${razao}`),
  })
}

/** A classificação pendente (US-071), com teto. */
async function classificar(porta: PortaDaRecuperacao, chamada: ChamadaEmRecuperacao, instante: string) {
  let status: number | null
  try {
    status = (await porta.classificar(chamada.id)).status
  } catch {
    status = null
  }

  if (status === 200 || status === 409) return

  // 422 é `sem_transcricao`: sem conversa gravada, a nova tentativa leria o mesmo nada.
  if (status === 400 || status === 404 || status === 422) {
    await porta.anotar(chamada.id, {
      classify_gave_up_at: instante,
      recovery_note: nota(`classificação: recusa definitiva (${status})`),
    })
    return
  }

  const tentativas = chamada.classify_attempts + 1
  const resposta = status === null ? 'não respondeu' : `respondeu ${status}`
  if (tentativas >= TETO_DE_CLASSIFICACOES) {
    await porta.anotar(chamada.id, {
      classify_attempts: tentativas,
      classify_gave_up_at: instante,
      recovery_note: nota(`desistência: classificação falhou ${tentativas} vezes (call-classify ${resposta})`),
    })
    return
  }
  await porta.anotar(chamada.id, {
    classify_attempts: tentativas,
    recovery_note: nota(`classificação ${tentativas}: call-classify ${resposta}`),
  })
}

function nota(texto: string): string {
  return texto.slice(0, TAMANHO_DA_NOTA)
}

// A borda --------------------------------------------------------------------

export interface PedidoDaRotina {
  readonly metodo: string
  /** O cabeçalho `x-internal-secret`. */
  readonly segredo: string | null
}

export interface RespostaDaRotina {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
}

/**
 * O que o `index.ts` chama. O segredo é conferido antes de tocar em qualquer
 * porta: sem ele, nem `job_runs` recebe linha.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  recuperacao: PedidoDeRecuperacao,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await recuperarChamadas(recuperacao)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
