// cron-retention: o expurgo da gravação e da transcrição no prazo (seção 4.6,
// RF-611, RF-807, RNF-09, P-10).
//
// Roda uma vez por dia, dentro do envelope das rotinas, e apaga o conteúdo das
// chamadas cujo prazo de `account_settings.retention_days` (padrão 90) venceu.
// A régua de "fora do prazo" é a de `chamadas_fora_do_prazo`, a mesma que a
// tela de privacidade usa para dizer quantas o prazo alcança, e mora no SQL de
// `reivindicar_expurgo`: chamada em curso e chamada dentro do prazo nunca
// chegam a este módulo.
//
// **OS DOIS LADOS (P-10).** O provedor de voz guarda o áudio e a transcrição
// de cada conversa. Apagar só o arquivo do balde deixa o dado lá e faz a conta
// acreditar no contrário, então cada chamada tem até dois lados a apagar: o
// arquivo no Storage (quando há `recording_path`) e a conversa no provedor
// (quando há `provider_conversation_id`). Cada lado que confirma ganha a sua
// data (`purge_storage_at`, `purge_provider_at`), e a execução seguinte só
// pede o lado que falta.
//
// **A MARCA SÓ DEPOIS DO 2xx DUPLO.** É o erro de R-05 aplicado aqui: marcar
// antes de confirmar é perder o registro do que falta apagar e manter o dado no
// provedor. `content_purged_at` é gravada no mesmo update que zera
// `recording_path` e esvazia `transcript`, e só quando os dois lados
// confirmaram. Um lado que falha deixa o conteúdo inteiro no registro, soma uma
// tentativa e a chamada volta na execução seguinte.
//
// **O QUE EXPIRA É O CONTEÚDO, NÃO O FATO.** A chamada continua com duração,
// custo, classificação e o identificador da conversa. `recording_expires_at`
// fica preenchida: é por ela que `call-audio` responde "expurgada" em vez de
// "nunca houve gravação".
//
// **IDEMPOTENTE.** A chamada marcada não volta à reivindicação, e o lado
// confirmado não é pedido de novo. Rodar duas vezes no mesmo dia não chama o
// Storage nem o provedor na segunda passagem.
//
// **CINCO FALHAS E A ROTINA DESISTE.** Na quinta passagem com falha a chamada
// ganha `purge_gave_up_at`, sai da reivindicação e deixa uma linha da conta em
// `job_runs` com a razão, para apuração manual. Sem o teto, uma conversa que o
// provedor sempre recusa ocuparia uma das 25 vagas do dia para sempre.
//
// **O QUE O EXPURGO ALCANÇOU fica em `job_runs`**, numa linha por conta, com a
// contagem de chamadas expurgadas em `items`. A linha da instalação é a do
// envelope e conta as chamadas examinadas.
//
// **SÓ 2xx CONFIRMA, E 404 NÃO É 2xx.** `DELETE convai/conversations/{id}`
// responde 404 tanto para a conversa que alguém já apagou quanto para a que
// está noutro espaço do provedor — a conta que trocou de chave deixa as
// conversas antigas na credencial anterior, e a nova não as enxerga. Tomar o
// 404 por "já não está lá" marcaria como expurgado o dado que continua no
// provedor, que é exatamente o defeito de P-10. O 404 é falha com a razão, e
// depois de cinco vira apuração manual. O formato da resposta é suposição
// declarada; a conferência com a API real é do degrau 3.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados, o Storage
// e o provedor entram por `PortaDoExpurgo`, implementada em `index.ts` e
// dublada no teste.

import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-retention'

/** Como o provedor de voz aparece em `integration_events.provider` e no cofre. */
export const PROVEDOR_DE_VOZ = 'voz'
export const CHAVE_DO_PROVEDOR_DE_VOZ = 'api_key'

/** O balde das gravações, o mesmo de `call-finalize`. */
export const BALDE_DAS_GRAVACOES = 'recordings'

/** Na quinta passagem com falha a rotina desiste da chamada. */
export const LIMITE_DE_FALHAS = 5

/** Uma linha de `reivindicar_expurgo`. */
export interface ChamadaVencida {
  readonly id: string
  readonly account_id: string
  readonly recording_path: string | null
  readonly recording_expires_at: string | null
  readonly provider_conversation_id: string | null
  readonly purge_storage_at: string | null
  readonly purge_provider_at: string | null
  readonly purge_attempts: number
  readonly retention_days: number
}

/** O que o Storage respondeu à remoção. */
export type RespostaDoArmazenamento = { readonly ok: true } | { readonly ok: false; readonly razao: string }

/** O que o provedor de voz respondeu. Nula quando a credencial não resolve. */
export interface RespostaDoProvedor {
  /** Nulo é "sem resposta": tempo esgotado ou conexão recusada. */
  readonly status_code: number | null
  readonly latency_ms: number
}

/** Uma linha de `integration_events`. */
export interface RastroDoExpurgo {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number
  /** O `call_id`, para a cadeia da ligação (RNF-16). */
  readonly correlation_id: string
}

/** O que a rotina anota na chamada que ainda não terminou de sair. */
export interface NotaDoExpurgo {
  readonly purge_storage_at?: string
  readonly purge_provider_at?: string
  readonly purge_attempts: number
  readonly purge_note: string
  readonly purge_gave_up_at?: string
}

/** O update que zera o conteúdo, com a marca. Só depois do 2xx dos dois lados. */
export interface ConclusaoDoExpurgo {
  readonly recording_path: null
  readonly transcript: Readonly<Record<string, never>>
  readonly content_purged_at: string
  readonly recording_expires_at: string | null
  readonly purge_storage_at: string | null
  readonly purge_provider_at: string | null
  readonly purge_note: null
}

/** Uma linha da conta em `job_runs`: a contagem, ou a desistência com a razão. */
export interface LinhaDaConta {
  readonly routine: string
  readonly account_id: string
  readonly started_at: string
  readonly finished_at: string
  readonly items: number
  readonly error: string | null
}

export interface PortaDoExpurgo {
  /** `reivindicar_expurgo`: `for update skip locked`, grava `purge_claimed_at`. */
  reivindicarChamadas(limite: number, instante: string): Promise<readonly ChamadaVencida[]>
  /** Remove o arquivo do balde. Arquivo que já não existe responde `ok`. */
  apagarGravacao(caminho: string): Promise<RespostaDoArmazenamento>
  /** `DELETE convai/conversations/{id}` na conta. Nulo quando a credencial não resolve. */
  apagarConversa(contaId: string, conversaId: string): Promise<RespostaDoProvedor | null>
  rastrear(rastro: RastroDoExpurgo): Promise<void>
  anotar(chamadaId: string, nota: NotaDoExpurgo): Promise<void>
  /** Condicionado a `content_purged_at is null`. */
  concluir(chamadaId: string, conclusao: ConclusaoDoExpurgo): Promise<void>
  registrarNaConta(linha: LinhaDaConta): Promise<void>
}

/** O caminho do provedor, sem o endereço base. */
export function caminhoDaConversa(conversaId: string): string {
  return `convai/conversations/${encodeURIComponent(conversaId)}`
}

/** Só 2xx confirma. A razão de o 404 não confirmar está no cabeçalho. */
export function provedorConfirmou(resposta: RespostaDoProvedor | null): boolean {
  if (resposta === null || resposta.status_code === null) return false
  return resposta.status_code >= 200 && resposta.status_code < 300
}

function razaoDoProvedor(resposta: RespostaDoProvedor | null): string {
  if (resposta === null) return 'credencial do provedor de voz indisponível'
  if (resposta.status_code === null) return 'provedor de voz sem resposta'
  if (resposta.status_code === 404) {
    return 'o provedor de voz não encontrou a conversa (404); ela pode estar sob outra credencial'
  }
  return `provedor de voz respondeu ${resposta.status_code}`
}

/** O que a passagem fez com uma chamada. */
export type DesfechoDoExpurgo = 'expurgada' | 'pendente' | 'desistencia'

type ItemDoExpurgo = ItemDaRotina & { readonly chamada: ChamadaVencida }

export interface PedidoDoExpurgo {
  readonly porta: PortaDoExpurgo
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-retention`, dentro do envelope das rotinas. */
export async function expurgarConteudo(pedido: PedidoDoExpurgo): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  const agora = pedido.agora ?? Date.now

  const expurgadasPorConta = new Map<string, number>()
  // Objeto, e não `let`: a atribuição acontece dentro do closure, e o
  // estreitamento do TypeScript não a enxergaria.
  const passagem: { iniciadaEm: string | null } = { iniciadaEm: null }

  const resultado = await executarRotina<ItemDoExpurgo>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora,
    trabalho: {
      async reivindicar(limite, instante) {
        passagem.iniciadaEm = instante
        const chamadas = await porta.reivindicarChamadas(limite, instante)
        return chamadas.map((chamada) => ({ chave: chamada.id, chamada }))
      },
      async processar(item, instante) {
        const desfecho = await expurgarChamada(porta, item.chamada, instante)
        if (desfecho === 'expurgada') {
          const conta = item.chamada.account_id
          expurgadasPorConta.set(conta, (expurgadasPorConta.get(conta) ?? 0) + 1)
        }
      },
    },
  })

  // Depois do envelope, e também quando ele terminou em erro: o que foi
  // expurgado antes do erro foi expurgado, e a conta precisa ver a contagem.
  const { iniciadaEm } = passagem
  if (iniciadaEm !== null) {
    const fim = new Date(agora()).toISOString()
    for (const [conta, quantas] of expurgadasPorConta) {
      await porta.registrarNaConta({
        routine: NOME_DA_ROTINA,
        account_id: conta,
        started_at: iniciadaEm,
        finished_at: fim,
        items: quantas,
        error: null,
      })
    }
  }
  return resultado
}

/** Os dois lados de uma chamada, a marca ou a tentativa. Exportada para o teste. */
export async function expurgarChamada(
  porta: PortaDoExpurgo,
  chamada: ChamadaVencida,
  instante: string,
): Promise<DesfechoDoExpurgo> {
  const falhas: string[] = []
  let storageEm = chamada.purge_storage_at
  let provedorEm = chamada.purge_provider_at

  const caminho = chamada.recording_path?.trim() ?? ''
  if (caminho !== '' && storageEm === null) {
    let resposta: RespostaDoArmazenamento
    try {
      resposta = await porta.apagarGravacao(caminho)
    } catch (erro) {
      resposta = { ok: false, razao: erro instanceof Error ? erro.message : 'erro sem mensagem' }
    }
    if (resposta.ok) storageEm = instante
    else falhas.push(`Storage recusou a remoção: ${resposta.razao}`)
  }

  const conversa = chamada.provider_conversation_id?.trim() ?? ''
  if (conversa !== '' && provedorEm === null) {
    let resposta: RespostaDoProvedor | null
    try {
      resposta = await porta.apagarConversa(chamada.account_id, conversa)
    } catch {
      resposta = { status_code: null, latency_ms: 0 }
    }
    const confirmou = provedorConfirmou(resposta)

    // Sem credencial não houve pedido, e rastro de chamada externa que não
    // aconteceu confundiria a cadeia da ligação.
    if (resposta !== null) {
      await porta.rastrear({
        account_id: chamada.account_id,
        direction: 'outbound',
        provider: PROVEDOR_DE_VOZ,
        endpoint: caminhoDaConversa(conversa),
        request: { metodo: 'DELETE', motivo: 'expurgo' },
        response: { expurgo: confirmou ? 'confirmado' : 'recusado' },
        status_code: resposta.status_code,
        latency_ms: Math.max(0, Math.round(resposta.latency_ms)),
        correlation_id: chamada.id,
      })
    }

    if (confirmou) provedorEm = instante
    else falhas.push(razaoDoProvedor(resposta))
  }

  if (falhas.length === 0) {
    await porta.concluir(chamada.id, {
      recording_path: null,
      transcript: {},
      content_purged_at: instante,
      recording_expires_at: validadeDaGravacao(chamada, instante),
      purge_storage_at: storageEm,
      purge_provider_at: provedorEm,
      purge_note: null,
    })
    return 'expurgada'
  }

  const tentativas = chamada.purge_attempts + 1
  const razao = falhas.join('; ')
  const desiste = tentativas >= LIMITE_DE_FALHAS
  await porta.anotar(chamada.id, {
    // O lado que confirmou nesta passagem fica anotado: a próxima só pede o outro.
    ...(chamada.purge_storage_at === null && storageEm !== null ? { purge_storage_at: storageEm } : {}),
    ...(chamada.purge_provider_at === null && provedorEm !== null ? { purge_provider_at: provedorEm } : {}),
    purge_attempts: tentativas,
    purge_note: razao,
    ...(desiste ? { purge_gave_up_at: instante } : {}),
  })
  if (!desiste) return 'pendente'

  await porta.registrarNaConta({
    routine: NOME_DA_ROTINA,
    account_id: chamada.account_id,
    started_at: instante,
    finished_at: instante,
    items: 1,
    error: `desistência do expurgo da chamada ${chamada.id} depois de ${tentativas} falhas: ${razao}; o conteúdo continua guardado e precisa de apuração manual`,
  })
  return 'desistencia'
}

/**
 * A data que `call-audio` lê para responder "expurgada". Quem tinha gravação e
 * não tinha data, ou tinha data adiante (o prazo encurtou depois da chamada),
 * passa a ter o instante do expurgo; quem nunca teve gravação continua nulo,
 * porque dizer "expurgada" para a conta que desligou a gravação seria afirmar
 * que se guardou o que ela pediu para não guardar.
 */
function validadeDaGravacao(chamada: ChamadaVencida, instante: string): string | null {
  const atual = chamada.recording_expires_at
  const tinhaGravacao = (chamada.recording_path?.trim() ?? '') !== ''
  if (!tinhaGravacao) return atual
  if (atual === null || Date.parse(atual) > Date.parse(instante)) return instante
  return atual
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
  expurgo: PedidoDoExpurgo,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await expurgarConteudo(expurgo)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
