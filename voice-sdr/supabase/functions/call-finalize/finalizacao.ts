// call-finalize: a finalização canônica da chamada (T-15, T-20, L-18, L-23,
// RF-412, RF-420, RF-912).
//
// **É A ÚNICA QUE ESCREVE O DESFECHO.** Transcrição, duração, quem atendeu, por
// que terminou, o áudio, o aviso de gravação, o custo que o provedor já
// devolveu e as invocações das ferramentas de sistema: tudo isso nasce aqui e
// em nenhum outro lugar. Ela é acionada por dois caminhos — o aviso de
// `call-events` e a varredura de recuperação —, e os dois chegam aqui como o
// mesmo pedido: `{ call_id }` com o segredo interno.
//
// **A REIVINDICAÇÃO É ATÔMICA, E É A CORREÇÃO DE T-15 AO PÉ DA LETRA:**
//
//   update calls set finalize_started_at = now()
//    where id = $1
//      and finalized_at is null
//      and (finalize_started_at is null
//           or finalize_started_at < now() - interval '5 minutes')
//   returning ...
//
// Só quem recebe a linha continua; quem não recebe devolve 409 e sai. É um
// comando só, e não uma leitura seguida de escrita: dois acionamentos no mesmo
// segundo disputam a mesma linha dentro do Postgres, e um deles recebe zero
// linhas. Verificar-e-agir ("já foi finalizada? então sai") é o defeito exato
// que isto substitui, e a porta desta função não tem método que pergunte.
//
// `finalized_at is null` entra na mesma condição, e não como leitura antes:
// sem ele, um reenvio do provedor seis minutos depois de uma finalização bem
// sucedida reivindicaria a chamada de novo e classificaria duas vezes.
//
// **`finalized_at` é gravado no fim**, depois de tudo. Falha no meio do caminho
// — provedor fora do ar, transcrição ainda em processamento, banco caído —
// deixa a reivindicação de pé sem `finalized_at`; ela expira em 5 minutos e a
// varredura tenta de novo. É o que impede a chamada de ficar travada sem que
// duas passagens finalizem juntas. As escritas que podem se repetir numa
// segunda passagem são idempotentes pelo banco: `call_costs` e
// `call_tool_invocations` têm único e são gravadas com `on conflict do nothing`.
//
// **GRAVAÇÃO DESLIGADA PULA O ÁUDIO** (L-18). Com `recording_enabled` falso,
// nada é baixado e `recording_path` fica nulo. O provedor já recebe a retenção
// desligada na publicação; aqui é a segunda trava, a que garante que o produto
// não guarda o que a conta disse que não queria guardar.
//
// **CUSTO SÓ DO QUE VEIO** (T-20, P-07). O componente que o provedor não
// devolveu não vira linha com valor nulo nem zero: fica para `cron-cost-sync`,
// que é quem busca o preço que chega tarde. Zero inventado faria o custo da
// chamada parecer pago.
//
// **AS INVOCAÇÕES LIDAS DA TRANSCRIÇÃO** (T-02, R-02). O provedor executa por
// conta própria as três ferramentas de sistema — encerrar, transferir,
// detectar caixa postal — e a transcrição é o único lugar onde isso fica
// escrito. Cada uma vira linha em `call_tool_invocations` com o prefixo
// `system:`. A ferramenta que ainda não sabemos ler vira linha também, com o
// nome que veio depois do mesmo prefixo, porque quem a executou foi o
// provedor: perder o registro de algo que ele fez é pior do que guardar um
// nome que ninguém rotula ainda. As nossas sete **não** viram linha quando
// deram certo — quem as registra, com a latência, é a própria ferramenta —, e
// viram quando voltaram com erro, porque aí a ferramenta pode nem ter sido
// alcançada. É dessas que `reaplicacao.ts` refaz o efeito. O bloqueio é o caso
// à parte: toda invocação de `tool-dnc`, com erro ou sem, é refeita por
// `reaplicacao-do-bloqueio.ts`, porque a falha do banco durante a ligação
// chega ao provedor como resposta `ok: false`, e não como erro. A regra mora em
// `leitura-da-transcricao.ts`, e o `at` de cada linha é o instante lido da
// transcrição, estritamente crescente na ordem dela.
//
// **A CAIXA POSTAL FECHA AQUI, E NÃO NA TELEFONIA** (T-03, RF-418). A chamada
// sai pela API do provedor de voz, onde o parâmetro de detecção de máquina da
// telefonia não existe: a detecção é a ferramenta de sistema
// `voicemail_detection`, publicada com o agente, e o que ela decidiu só chega
// ao nosso dado por esta leitura. Configuração morta é pior que ausência — por
// isso `answered_by = 'machine'` e `end_reason = 'voicemail'` saem daqui, e a
// chamada atendida por máquina não aciona a classificação nem o portão da
// primeira chamada de teste: o roteiro não foi executado com ninguém.
//
// **AS DUAS FALAS DA PESSOA ERRADA** (RF-422). A medição de
// `encerramento-da-pessoa-errada.ts` conta as falas da Sarah entre `tool-dnc`
// com `wrong_number` e `end_call`; passou do limite, a divergência vai para
// `calls.evaluation.medicoes` por RPC que mescla, e não sobrescreve, o que a
// classificação escreveu. É passo acessório: avaliação perdida não segura o
// desfecho. O ensaio também é medido, porque é nele que a desobediência à
// camada 1 aparece primeiro.
//
// **A RETAGUARDA, PRIMEIRA VIA** (US-140, RF-410). Ao fim, a finalização lê
// as invocações da chamada: houve `tool-qualify`, nada; faltou a qualificação
// (`faltouQualificar`, US-138), aciona `call-classify` na mesma passagem. A
// segunda via é `cron-call-recovery`, e quem impede as duas de classificarem
// a mesma chamada é a reivindicação de `call-classify`, não esta decisão
// (`retaguarda.ts`).
//
// **O SENTIMENTO E A FILA** (US-141, RF-909, RF-915). Depois da retaguarda,
// porque o sentimento do modelo só existe quando ela volta: a finalização
// grava `calls.sentiment` com a fonte e `leads.last_sentiment`, lê os limiares
// da conta, calcula os itens pelo módulo puro da fila e os registra pela chave
// da causa (`sentimento-e-fila.ts`). A sequência de falhas ao mesmo número sai
// de `call_attempts`, e por isso o passo vem depois de `gravarDesfecho`: o
// `answered_by` desta chamada só existe dali em diante. Passo acessório; o
// ensaio não toca a porta.
//
// **A PRIMEIRA CHAMADA DE TESTE** (L-03, RF-912) é medição do servidor, e sai
// por RPC: quem decide se a chamada é de teste e se é a primeira é o banco.
// Aqui só se aciona quando houve transcrição — ligação que caiu sem conversa
// não prova configuração nenhuma. Falha do RPC não derruba a finalização: o
// portão fica fechado, que é o lado seguro.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados, o provedor
// e o Storage entram por `PortaDaFinalizacao`, implementada em `index.ts`.

import { resultadoDoFim, type ResultadoDaLigacao } from '../_shared/automacao/politica-de-retentativa.ts'
import { hashEmHexadecimal, hashesIguais } from '../_shared/hash-de-segredo.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'
import { CHAVE_DO_AVISO_DE_GRAVACAO } from '../_shared/qualificacao/avaliacao.ts'
import type { InvocacaoRegistrada } from '../_shared/qualificacao/obrigatoriedade.ts'
import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'

import {
  aplicarAvaliacao,
  avisoDeGravacaoEm,
  criteriosAplicados,
  itensRegistrados,
  turnosParaAvaliacao,
  type DesfechoDaAvaliacao,
  type PortaDaAvaliacaoAutomatica,
} from './avaliacao-automatica.ts'
import { lerAvisoDeGravacao } from './consentimento.ts'
import {
  CRITERIO_DO_ENCERRAMENTO,
  FALA_DA_SARAH,
  divergenciaGravada,
  medirEncerramentoDaPessoaErrada,
} from './encerramento-da-pessoa-errada.ts'
import { caminhoDaConversa, lerConversa, type ConversaDoProvedor } from './formato-do-provedor.ts'
import {
  lerFim,
  linhasDeInvocacao,
  type AtendidaPor,
  type LeituraDoFim,
  type LinhaDeInvocacao,
  type MotivoDoFim,
} from './leitura-da-transcricao.ts'
import {
  REAPLICADORES,
  reaplicarFalhas,
  type ChaveDeInvocacao,
  type InvocacaoParaReaplicar,
  type RegistroDeReaplicadores,
  type ResultadoDaReaplicacao,
} from './reaplicacao.ts'
import {
  pedidosDeBloqueio,
  reaplicarBloqueios,
  type PortaDoBloqueio,
  type ResultadoDosBloqueios,
} from './reaplicacao-do-bloqueio.ts'
import { MENSAGENS, STATUS, type MotivoDaFinalizacao } from './respostas.ts'
import { acionaRetaguarda, decidirRetaguarda, type MotivoDaRetaguarda } from './retaguarda.ts'
import {
  aplicarSentimentoEFila,
  type DesfechoDaFila,
  type DesfechoDoSentimento,
  type PortaDaFila,
} from './sentimento-e-fila.ts'

export { NOME_DE_SISTEMA } from './leitura-da-transcricao.ts'
export type { LinhaDeInvocacao, MotivoDoFim } from './leitura-da-transcricao.ts'

/** O cabeçalho do segredo interno, o mesmo que `call-place` confere. */
export const CABECALHO_INTERNO = 'x-internal-secret'

/** O provedor e a chave no cofre, os mesmos de `call-place`. */
export const PROVEDOR_DE_VOZ = 'voz'
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/** Quanto dura uma reivindicação antes de outra passagem poder tomá-la (T-15). */
export const VALIDADE_DA_REIVINDICACAO_MS = 5 * 60 * 1000

/** Quem informou o custo, em `call_costs.source`. */
export const FONTE_DO_CUSTO = 'call-finalize'

/** O balde do Storage onde mora o áudio. O caminho em `calls` é relativo a ele. */
export const BALDE_DAS_GRAVACOES = 'recordings'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UM_DIA_MS = 24 * 60 * 60 * 1000

/** A chamada que a reivindicação devolveu, no que a finalização precisa dela. */
export interface ChamadaReivindicada {
  readonly id: string
  readonly account_id: string
  readonly lead_id: string | null
  readonly direction: 'outbound' | 'inbound' | 'rehearsal'
  /** O propósito: é por ele que a qualificação é obrigatória ou não (US-138). */
  readonly purpose: string
  readonly provider_conversation_id: string | null
  readonly started_at: string
  /** Preenchida quando `tool-qualify` já classificou durante a conversa. */
  readonly classification_source: string | null
  /**
   * `canceled` quando `call-cancel` marcou a chamada antes de pedir o
   * encerramento, `max_duration` quando o vigia de `cron-call-recovery` a
   * marcou antes de pedir o fim à telefonia (L-12). São os dois motivos que a
   * finalização não recalcula (`MOTIVOS_MARCADOS`): a conversa terminou porque
   * alguém a encerrou, e o que ela diz sobre o fim é efeito.
   */
  readonly end_reason: string | null
}

/** Os motivos marcados antes do encerramento, que a finalização preserva. */
export const MOTIVOS_MARCADOS = ['canceled', 'max_duration'] as const satisfies readonly MotivoDoFim[]

/** O recorte de `account_settings` que a finalização lê. */
export interface PoliticaDaFinalizacao {
  readonly gravacaoLigada: boolean
  readonly retencaoEmDias: number
  /** `recording_notice_text`. Nulo é a frase da camada 1. */
  readonly avisoDeGravacao: string | null
  readonly duracaoMaximaEmSegundos: number
}

/** O desfecho gravado em `calls`, com as chaves da tabela. Sem `finalized_at`. */
export interface DesfechoDaChamada {
  readonly status: 'ended' | 'failed'
  readonly transcript: { readonly turns: readonly TurnoGravado[] }
  readonly duration_sec: number | null
  readonly answered_at: string | null
  readonly ended_at: string
  readonly answered_by: AtendidaPor
  readonly end_reason: MotivoDoFim
  readonly recording_path: string | null
  readonly recording_expires_at: string | null
  readonly consent_notice_at: string | null
}

/** Um turno em `calls.transcript`, com quem falou (RF-412). */
export interface TurnoGravado {
  readonly role: 'agent' | 'lead'
  readonly text: string
  readonly at: string
}

/** Uma linha de `call_costs`. */
export interface LinhaDeCusto {
  readonly account_id: string
  readonly call_id: string
  readonly component: 'voice' | 'model'
  readonly amount_cents: number
  readonly currency: 'USD'
  readonly source: string
}

/** Uma linha de `consent_records`. */
export interface LinhaDeConsentimento {
  readonly account_id: string
  readonly lead_id: string | null
  readonly call_id: string
  readonly kind: 'recording'
  readonly granted: boolean
  readonly evidence: Readonly<Record<string, unknown>>
  readonly at: string
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

export interface RespostaDaConversa extends EnvelopeDoProvedor {
  /** O corpo da conversa, quando `ok`. */
  readonly conversa?: unknown
}

export interface RespostaDoAudio extends EnvelopeDoProvedor {
  readonly audio?: Uint8Array | null
  readonly tipo?: string | null
}

export interface PortaDaFinalizacao extends PortaDoBloqueio, PortaDaFila, PortaDaAvaliacaoAutomatica {
  /**
   * O update condicionado do cabeçalho, com `agora` gravado e a reivindicação
   * vencida antes de `vencidaAntesDe`. Nulo é outra passagem com a chamada.
   */
  reivindicar(chamadaId: string, agora: string, vencidaAntesDe: string): Promise<ChamadaReivindicada | null>
  politicaDaConta(contaId: string): Promise<PoliticaDaFinalizacao>
  credencial(contaId: string, provedor: string, chave: string): Promise<ResolucaoDeSegredo>
  buscarConversa(conversaId: string, credencial: string): Promise<RespostaDaConversa>
  baixarAudio(conversaId: string, credencial: string): Promise<RespostaDoAudio>
  /** Grava no balde. Levanta quando o Storage recusou. */
  guardarGravacao(caminho: string, audio: Uint8Array, tipo: string): Promise<void>
  gravarDesfecho(contaId: string, chamadaId: string, desfecho: DesfechoDaChamada): Promise<void>
  /** `on conflict (call_id, component, source) do nothing`. */
  gravarCustos(linhas: readonly LinhaDeCusto[]): Promise<void>
  /**
   * `on conflict (call_id, tool, at) do nothing returning tool, at`: devolve só
   * o que acabou de entrar, e é isso que impede a reaplicação de rodar duas
   * vezes para a mesma invocação.
   */
  gravarInvocacoes(linhas: readonly LinhaDeInvocacao[]): Promise<readonly ChaveDeInvocacao[]>
  registrarConsentimento(linha: LinhaDeConsentimento): Promise<void>
  /** O RPC do portão (RF-912). Quem decide se é teste e se é a primeira é o banco. */
  registrarPrimeiraChamadaDeTeste(chamadaId: string): Promise<void>
  /**
   * `call_tool_invocations` da chamada, depois de `gravarInvocacoes`: as que
   * as ferramentas gravaram durante a conversa e as que a transcrição trouxe.
   * É daqui que a retaguarda sabe se houve `tool-qualify` (US-140).
   */
  invocacoesDaChamada(chamadaId: string): Promise<readonly InvocacaoRegistrada[]>
  acionarClassificacao(chamadaId: string): Promise<void>
  /**
   * Mescla `{ [criterio]: medicao }` em `calls.evaluation.medicoes`
   * (`registrar_medicao_da_avaliacao`), sem tocar no resto da avaliação.
   */
  registrarMedicaoDaAvaliacao(
    contaId: string,
    chamadaId: string,
    criterio: string,
    medicao: Readonly<Record<string, unknown>>,
  ): Promise<void>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
  /**
   * `reprogramar_tentativa` (US-189, RF-417): a ligação sem conversa vira a
   * próxima tentativa na fila, pela política da conta. Quem decide se entra, e
   * quando, é o banco; aqui só se passa o resultado.
   */
  reprogramarTentativa(chamadaId: string, resultado: ResultadoDaLigacao, agora: string): Promise<void>
  concluirFinalizacao(contaId: string, chamadaId: string, agora: string): Promise<void>
}

export interface PedidoDaBorda {
  readonly metodo: string
  readonly chamadaId: unknown
  readonly segredoInterno: string | null
}

export interface OpcoesDaFinalizacao {
  /** Vazio fecha o portão: nenhum pedido passa. */
  readonly segredoInterno: string
  /** O relógio da finalização, em ISO-8601. */
  readonly agora: string
  /** Os reaplicadores por ferramenta (R-02). Ausente é o registro da produção. */
  readonly reaplicadores?: RegistroDeReaplicadores
}

export type DesfechoDoAudio = 'gravado' | 'desligado' | 'sem_audio' | 'falhou'
export type DesfechoDoAviso = 'encontrado' | 'ausente' | 'desligado'
export type DesfechoAcessorio = 'acionado' | 'dispensado' | 'falhou'
/** A conferência das duas falas (RF-422). `divergente` é a que foi gravada. */
export type DesfechoDoEncerramento = 'nao_se_aplica' | 'conforme' | 'divergente' | 'falhou'

export interface CorpoDaFinalizacao {
  readonly ok: true
  readonly chamadaId: string
  readonly desfecho: 'finalizada'
  readonly status: DesfechoDaChamada['status']
  readonly motivoDoFim: MotivoDoFim
  readonly audio: DesfechoDoAudio
  readonly avisoDeGravacao: DesfechoDoAviso
  readonly custos: number
  readonly invocacoes: number
  /** O que voltou com erro na transcrição e teve o efeito refeito (R-02). */
  readonly reaplicacoes: ResultadoDaReaplicacao
  /** Os pedidos de `tool-dnc` da transcrição, refeitos (R-02). */
  readonly bloqueios: ResultadoDosBloqueios
  readonly encerramentoDaPessoaErrada: DesfechoDoEncerramento
  readonly primeiraChamadaDeTeste: DesfechoAcessorio
  /** Por que a retaguarda foi acionada ou não (US-140). */
  readonly retaguarda: MotivoDaRetaguarda
  readonly classificacao: DesfechoAcessorio
  /** De onde veio o sentimento gravado, ou por que não houve (US-141). */
  readonly sentimento: DesfechoDoSentimento
  /** Os itens que esta passagem criou e os que já estavam abertos (RF-909). */
  readonly fila: DesfechoDaFila
  /** A avaliação automática pelos critérios da conta (US-142, RF-314). */
  readonly avaliacao: DesfechoDaAvaliacao
  /** A próxima tentativa pela política de retentativa (US-189), quando a ligação não virou conversa. */
  readonly retentativa: DesfechoAcessorio
}

export interface RecusaDaFinalizacao {
  readonly ok: false
  readonly motivo: MotivoDaFinalizacao
  readonly mensagem: string
}

export interface RespostaDaFinalizacao {
  readonly status: number
  readonly corpo: CorpoDaFinalizacao | RecusaDaFinalizacao
}

class RecusaDoPedido extends Error {
  readonly motivo: MotivoDaFinalizacao

  constructor(motivo: MotivoDaFinalizacao) {
    super(motivo)
    this.motivo = motivo
  }
}

/**
 * Finaliza. Nunca levanta: exceção da porta vira 503, e a reivindicação que
 * ficou de pé expira em 5 minutos para a varredura tentar de novo.
 */
export async function finalizarChamada(
  pedido: PedidoDaBorda,
  porta: PortaDaFinalizacao,
  opcoes: OpcoesDaFinalizacao,
): Promise<RespostaDaFinalizacao> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  if (!(await segredoConfere(pedido.segredoInterno, opcoes.segredoInterno))) {
    return recusa('segredo_interno_invalido')
  }

  const chamadaId = typeof pedido.chamadaId === 'string' ? pedido.chamadaId.trim() : ''
  if (!UUID.test(chamadaId)) return recusa('chamada_invalida')

  // Toda credencial resolvida no caminho é procurada no corpo antes de
  // responder, pela rede de segurança de `call-place`.
  const credenciais: string[] = []

  let resposta: RespostaDaFinalizacao
  try {
    resposta = await conduzir(chamadaId, porta, opcoes, credenciais)
  } catch (erro) {
    resposta = recusa(erro instanceof RecusaDoPedido ? erro.motivo : 'falha_interna')
  }

  try {
    conferirQueNaoVazou(resposta.corpo, credenciais, 'credencial no corpo de call-finalize')
  } catch {
    return recusa('falha_interna')
  }
  return resposta
}

async function conduzir(
  chamadaId: string,
  porta: PortaDaFinalizacao,
  opcoes: OpcoesDaFinalizacao,
  credenciais: string[],
): Promise<RespostaDaFinalizacao> {
  const agoraMs = Date.parse(opcoes.agora)
  const vencidaAntesDe = new Date(agoraMs - VALIDADE_DA_REIVINDICACAO_MS).toISOString()

  const chamada = await porta.reivindicar(chamadaId, opcoes.agora, vencidaAntesDe)
  if (!chamada) return recusa('ja_reivindicada')

  const conversaId = chamada.provider_conversation_id
  if (!conversaId) return recusa('sem_conversa')

  const politica = await porta.politicaDaConta(chamada.account_id)

  const resolucao = await porta.credencial(chamada.account_id, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  if (!resolucao.ok) return recusa('credencial_indisponivel')
  const credencial = resolucao.valor
  credenciais.push(credencial)

  const conversa = await puxarConversa(chamada, conversaId, credencial, porta)

  const inicioMs = conversa.inicioEmSegundos !== null
    ? conversa.inicioEmSegundos * 1000
    : Date.parse(chamada.started_at)
  const instante = (segundo: number): string => new Date(inicioMs + segundo * 1000).toISOString()

  const lido = lerFim(conversa, politica.duracaoMaximaEmSegundos)
  const marcado = MOTIVOS_MARCADOS.find((motivo) => motivo === chamada.end_reason)
  const fim: LeituraDoFim = marcado ? { ...lido, motivo: marcado } : lido
  const endedAt = conversa.duracaoEmSegundos !== null ? instante(conversa.duracaoEmSegundos) : opcoes.agora

  // O áudio primeiro, porque o caminho vai no desfecho. Falha do áudio não
  // segura a transcrição: a ficha sem áudio é melhor do que ficha nenhuma.
  let audio: DesfechoDoAudio = 'desligado'
  let caminho: string | null = null
  if (politica.gravacaoLigada) {
    audio = conversa.temAudio ? 'falhou' : 'sem_audio'
    if (conversa.temAudio) {
      caminho = await guardarAudio(chamada, conversaId, credencial, porta)
      if (caminho) audio = 'gravado'
    }
  }

  // Os critérios da chamada, lidos antes do desfecho: é o critério do aviso de
  // gravação aprovado que dá `consent_notice_at` (L-23, US-142).
  const criterios = criteriosAplicados(chamada.purpose, await porta.criteriosDaConta(chamada.account_id), {
    ligada: politica.gravacaoLigada,
    aviso: politica.avisoDeGravacao,
  })
  const turnosDaAvaliacao = turnosParaAvaliacao(conversa.turnos, instante)
  const trechosDoAviso = criterios.find((c) => c.key === CHAVE_DO_AVISO_DE_GRAVACAO)?.trechos ?? []
  const aviso = politica.gravacaoLigada
    ? lerAvisoDeGravacao(conversa.turnos, politica.avisoDeGravacao, trechosDoAviso)
    : null
  const consentNoticeAt = politica.gravacaoLigada ? await avisoDeGravacaoEm(turnosDaAvaliacao, criterios) : null
  const houveConversa = conversa.turnos.length > 0
  const status = houveConversa ? 'ended' : 'failed'

  await porta.gravarDesfecho(chamada.account_id, chamada.id, {
    status,
    transcript: {
      turns: conversa.turnos.map((turno) => ({
        role: turno.quem,
        text: turno.texto,
        at: instante(turno.segundo),
      })),
    },
    duration_sec: conversa.duracaoEmSegundos === null ? null : Math.round(conversa.duracaoEmSegundos),
    answered_at: fim.atendidaPor === 'unknown' ? null : instante(0),
    ended_at: endedAt,
    answered_by: fim.atendidaPor,
    end_reason: fim.motivo,
    recording_path: caminho,
    recording_expires_at: caminho
      ? new Date(Date.parse(endedAt) + politica.retencaoEmDias * UM_DIA_MS).toISOString()
      : null,
    consent_notice_at: consentNoticeAt,
  })

  const custos: LinhaDeCusto[] = conversa.custos.map((custo) => ({
    account_id: chamada.account_id,
    call_id: chamada.id,
    component: custo.componente,
    amount_cents: Math.round(custo.valorEmDolares * 100),
    currency: 'USD',
    source: FONTE_DO_CUSTO,
  }))
  if (custos.length > 0) await porta.gravarCustos(custos)

  const invocacoes = linhasDeInvocacao(chamada, conversa.invocacoes, inicioMs)
  const inseridas = invocacoes.length > 0 ? await porta.gravarInvocacoes(invocacoes) : []
  const comErro: InvocacaoParaReaplicar[] = invocacoes.flatMap((linha) =>
    linha.error === null
      ? []
      : [{
          account_id: linha.account_id,
          call_id: linha.call_id,
          lead_id: chamada.lead_id,
          tool: linha.tool,
          request: linha.request,
          error: linha.error,
          at: linha.at,
        }],
  )
  const reaplicacoes = await reaplicarFalhas(comErro, inseridas, opcoes.reaplicadores ?? REAPLICADORES)
  // Levanta quando o bloqueio não pôde ser gravado: a finalização cai com a
  // reivindicação de pé, e a varredura volta para cumprir a promessa.
  const bloqueios = await reaplicarBloqueios(chamada, pedidosDeBloqueio(conversa.invocacoes, inicioMs), porta)

  const encerramentoDaPessoaErrada = await conferirEncerramento(chamada, conversa, porta)

  if (aviso) {
    await porta.registrarConsentimento({
      account_id: chamada.account_id,
      lead_id: chamada.lead_id,
      call_id: chamada.id,
      kind: 'recording',
      granted: aviso.concedido,
      evidence: aviso.evidencia,
      // Sem o turno, o instante do registro é o da finalização: `at` é not
      // null, e a ausência já está dita em `granted` e na evidência.
      at: consentNoticeAt ?? opcoes.agora,
    })
  }

  const atendidaPorGente = fim.atendidaPor !== 'machine'
  const primeiraChamadaDeTeste = await acessorio(
    houveConversa && atendidaPorGente && chamada.direction !== 'rehearsal',
    () => porta.registrarPrimeiraChamadaDeTeste(chamada.id),
  )
  // A primeira via da retaguarda (US-140). Máquina nem pergunta pelas
  // invocações: a decisão já é `dispensada`.
  const paraQualificacao = {
    purpose: chamada.purpose,
    direction: chamada.direction,
    answered_at: fim.atendidaPor === 'unknown' ? null : instante(0),
  }
  const registradas = atendidaPorGente ? await porta.invocacoesDaChamada(chamada.id) : []
  const retaguarda = decidirRetaguarda(
    { ...paraQualificacao, classification_source: chamada.classification_source },
    { atendidaPorGente, leadFalou: conversa.turnos.some((turno) => turno.quem === 'lead') },
    registradas,
  )
  const classificacao = await acessorio(acionaRetaguarda(retaguarda), () => porta.acionarClassificacao(chamada.id))
  // Depois da retaguarda, porque o juízo do modelo só existe quando ela volta;
  // antes da fila, porque o critério reprovado é gatilho dela (US-142).
  const avaliacao = await aplicarAvaliacao(
    chamada,
    {
      // O ensaio não é avaliado: não entra em métrica nem em fila (T-16).
      aplica: houveConversa && atendidaPorGente && chamada.direction !== 'rehearsal',
      turnos: turnosDaAvaliacao,
      criterios,
      registrados: itensRegistrados(criterios, paraQualificacao, registradas),
    },
    porta,
  )
  const { sentimento, fila } = await aplicarSentimentoEFila(
    chamada,
    { atendidaPor: fim.atendidaPor, instante: instante(0) },
    porta,
  )

  // A retentativa por resultado (US-189): sem atendimento, ocupado, caixa
  // postal e número inválido. Antes de `finalized_at`, e acessória: a falha
  // fica escrita no corpo e a finalização segue; a varredura que refizer a
  // finalização chama de novo, e o único da fila faz a segunda ser
  // `ja_reprogramada`.
  const resultadoDaLigacao = chamada.direction === 'outbound' ? resultadoDoFim(fim.motivo) : null
  const retentativa = await acessorio(resultadoDaLigacao !== null, () =>
    porta.reprogramarTentativa(chamada.id, resultadoDaLigacao!, opcoes.agora),
  )

  await porta.concluirFinalizacao(chamada.account_id, chamada.id, opcoes.agora)

  return {
    status: 200,
    corpo: {
      ok: true,
      chamadaId: chamada.id,
      desfecho: 'finalizada',
      status,
      motivoDoFim: fim.motivo,
      audio,
      avisoDeGravacao: aviso ? (aviso.segundo === null ? 'ausente' : 'encontrado') : 'desligado',
      custos: custos.length,
      invocacoes: invocacoes.length,
      reaplicacoes,
      bloqueios,
      encerramentoDaPessoaErrada,
      primeiraChamadaDeTeste,
      retaguarda,
      classificacao,
      sentimento,
      fila,
      avaliacao,
      retentativa,
    },
  }
}

/**
 * Mede as duas falas e grava só a divergência. Conforme não escreve nada: a
 * ausência da chave é o estado normal, e escrever "conforme" em toda chamada
 * de pessoa errada não diria nada que a transcrição já não diga.
 */
async function conferirEncerramento(
  chamada: ChamadaReivindicada,
  conversa: ConversaDoProvedor,
  porta: PortaDaFinalizacao,
): Promise<DesfechoDoEncerramento> {
  const medicao = medirEncerramentoDaPessoaErrada(conversa, FALA_DA_SARAH)
  if (!medicao.aplica) return 'nao_se_aplica'
  if (medicao.conforme) return 'conforme'
  // Quando a F4 ligar avaliação reprovada como gatilho da fila (RF-909,
  // RF-915), o item nasce aqui, depois da gravação.
  const gravada = await acessorio(true, () =>
    porta.registrarMedicaoDaAvaliacao(
      chamada.account_id,
      chamada.id,
      CRITERIO_DO_ENCERRAMENTO,
      divergenciaGravada(medicao),
    ),
  )
  return gravada === 'acionado' ? 'divergente' : 'falhou'
}

/** Puxa a conversa e registra o rastro. Levanta recusa quando ela não está pronta. */
async function puxarConversa(
  chamada: ChamadaReivindicada,
  conversaId: string,
  credencial: string,
  porta: PortaDaFinalizacao,
): Promise<ConversaDoProvedor> {
  const resposta = await porta.buscarConversa(conversaId, credencial)
  const conversa = resposta.ok ? lerConversa(resposta.conversa) : null

  await rastrear(porta, {
    account_id: chamada.account_id,
    direction: 'outbound',
    provider: PROVEDOR_DE_VOZ,
    endpoint: resposta.endpoint ?? caminhoDaConversa(conversaId),
    request: { conversation_id: conversaId },
    // O resumo, e não a conversa: a transcrição não mora em tabela de
    // observabilidade.
    response: {
      ok: resposta.ok,
      pronta: conversa?.pronta ?? false,
      turnos: conversa?.turnos.length ?? 0,
    },
    status_code: resposta.status ?? null,
    latency_ms: resposta.latenciaMs ?? null,
    correlation_id: chamada.id,
  })

  if (!conversa) throw new RecusaDoPedido('transcricao_indisponivel')
  if (!conversa.pronta) throw new RecusaDoPedido('transcricao_pendente')
  return conversa
}

/** Baixa e guarda o áudio. Devolve o caminho, ou nulo quando algum passo falhou. */
async function guardarAudio(
  chamada: ChamadaReivindicada,
  conversaId: string,
  credencial: string,
  porta: PortaDaFinalizacao,
): Promise<string | null> {
  const resposta = await porta.baixarAudio(conversaId, credencial)
  if (!resposta.ok || !resposta.audio || resposta.audio.byteLength === 0) return null

  const caminho = caminhoDaGravacao(chamada.account_id, chamada.id)
  try {
    await porta.guardarGravacao(caminho, resposta.audio, resposta.tipo ?? 'audio/mpeg')
  } catch {
    return null
  }
  return caminho
}

/** O caminho no balde: a conta primeiro, para o expurgo e a política do Storage. */
export function caminhoDaGravacao(contaId: string, chamadaId: string): string {
  return `${contaId}/${chamadaId}.mp3`
}

/** Passo que não derruba a finalização: falhou fica escrito e ela segue. */
async function acessorio(aplica: boolean, passo: () => Promise<void>): Promise<DesfechoAcessorio> {
  if (!aplica) return 'dispensado'
  try {
    await passo()
    return 'acionado'
  } catch {
    return 'falhou'
  }
}

async function rastrear(porta: PortaDaFinalizacao, evento: EventoDeIntegracao): Promise<void> {
  try {
    await porta.registrarEventoDeIntegracao(evento)
  } catch {
    // Observabilidade perdida não derruba a finalização.
  }
}

/**
 * O segredo interno em tempo constante, pela receita de `call-place`: os dois
 * lados passam por sha-256 antes, para o comprimento não entrar na conversa.
 * Instalação sem o segredo recusa todo pedido, em vez de aceitar o vazio.
 */
async function segredoConfere(recebido: string | null, esperado: string): Promise<boolean> {
  const dado = recebido?.trim() ?? ''
  const referencia = esperado.trim()
  if (dado === '' || referencia === '') return false
  const [a, b] = await Promise.all([hashEmHexadecimal(dado), hashEmHexadecimal(referencia)])
  return hashesIguais(a, b)
}

function recusa(motivo: MotivoDaFinalizacao): RespostaDaFinalizacao {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
