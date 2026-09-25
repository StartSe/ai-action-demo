// O envelope de toda rotina agendada (seção 4.6, L-13, RF-613).
//
// O pg_cron acorda a rotina por `net.http_post` e não fica sabendo o que
// aconteceu depois: pg_net é assíncrono e não devolve resposta ao job (T-26).
// Quem responde "esta rotina ainda roda?" é `job_runs`, e este módulo é o único
// lugar que sabe escrever essa linha — a porta de cada rotina só grava o objeto
// que recebe daqui, com as colunas já nomeadas.
//
// As três regras da seção 4.6 valem para todas as rotinas porque moram aqui, e
// não na disciplina de quem escreve cada uma:
//
// 1. **No máximo 25 itens por execução.** O número tem razão: depois de uma
//    queda do banco o pg_cron volta junto, e todos os jobs disparam no mesmo
//    minuto (R-02). Com teto por execução, o atraso acumulado sai em ondas de
//    25 a cada cadência, em vez de uma rajada que derruba o provedor e o
//    próprio banco que acabou de voltar. O envelope passa o teto à
//    reivindicação e recusa a execução inteira se ela devolver mais — item
//    além do teto já foi tirado da fila, e processá-lo calado desfaz a regra.
// 2. **`for update skip locked` na reivindicação.** Isso vive no SQL da
//    reivindicação de cada rotina, que é o único lugar onde pode viver; o
//    contrato de `TrabalhoDaRotina.reivindicar` diz o que ela deve fazer. É o
//    que faz dois disparos sobrepostos (P-09: job que demora mais que o
//    intervalo) pegarem itens diferentes em vez dos mesmos.
// 3. **Idempotência (RNF-06).** Rodar duas vezes em sequência não duplica
//    efeito: a reivindicação tira o item do estado pendente na mesma
//    transação em que o trava, então a segunda execução não o vê; e dentro da
//    mesma execução o envelope processa cada `chave` uma vez só, mesmo que a
//    reivindicação a devolva repetida.
//
// **Erro não deixa `finished_at` nulo.** A linha ganha o fim também no caminho
// de erro, com a mensagem em `error`. Sem isso, rotina que quebra fica
// indistinguível de rotina que ainda está rodando, que é o defeito que L-13
// existe para evitar. O início é gravado ANTES de qualquer trabalho: se a
// gravação do início falha, nada é processado, porque trabalho sem linha é
// trabalho invisível.
//
// **Alarme de volume (R-09).** Os itens desta execução se comparam com a média
// móvel das últimas execuções bem-sucedidas da mesma rotina; acima de três
// vezes, a linha sai com `volume_alert`. Laço de automação (cadência que
// reinscreve, intake duplicado) aparece primeiro como volume. O item na fila
// de exceções é F4 (`exception_items`, L-24): em F2 o registro é a marca na
// linha, e é ali que a F4 vai ler.
//
// Módulo portável (`_shared/`): sem Deno, sem rede e sem banco. O relógio entra
// por parâmetro.

/** Teto de itens por execução (seção 4.6, R-02). */
export const TETO_DE_ITENS = 25

/** Acima de quantas vezes a média móvel a execução dispara o alarme (R-09). */
export const MULTIPLO_DO_ALARME = 3

/** Quantas execuções anteriores entram na média móvel. */
export const EXECUCOES_DA_MEDIA = 10

/** Tamanho máximo da mensagem de erro gravada: a tela de saúde mostra uma linha. */
const TAMANHO_DO_ERRO = 1_000

/** A linha de início, com as colunas de `job_runs`. */
export interface LinhaDeInicio {
  readonly routine: string
  readonly started_at: string
  /** A linha do envelope é a da instalação: a execução atravessa contas. */
  readonly account_id: null
}

/** O que a linha ganha no fim, sucesso ou erro. */
export interface LinhaDeFim {
  readonly finished_at: string
  readonly items: number
  readonly error: string | null
  readonly volume_alert: boolean
  readonly volume_baseline: number | null
}

/** A camada de dados de `job_runs`. Grava o que recebe, sem decidir coluna. */
export interface PortaDeExecucao {
  /** Insere a linha de início e devolve o id. */
  inserirExecucao(linha: LinhaDeInicio): Promise<string>
  /** Completa a linha do id com o fim. */
  concluirExecucao(id: string, linha: LinhaDeFim): Promise<void>
  /**
   * `items` das últimas `quantas` execuções da rotina, da instalação (conta
   * nula), concluídas e sem erro, iniciadas antes de `antesDe` — a atual fica
   * de fora. Execução com erro não entra: parou no meio, e o número dela não é
   * o volume da rotina.
   */
  itensDasUltimasExecucoes(rotina: string, quantas: number, antesDe: string): Promise<readonly number[]>
}

/** Todo item de rotina tem uma chave estável, que é o que o envelope deduplica. */
export interface ItemDaRotina {
  readonly chave: string
}

/** O trabalho de uma rotina: reivindicar e processar. */
export interface TrabalhoDaRotina<T extends ItemDaRotina> {
  /**
   * Reivindica até `limite` itens prontos em `instante`. A implementação é SQL
   * com `for update skip locked` e tira o item do estado pendente na mesma
   * transação, senão dois disparos sobrepostos pegam o mesmo item e a
   * execução seguinte o pega de novo.
   */
  reivindicar(limite: number, instante: string): Promise<readonly T[]>
  /** Processa um item. Erro aqui encerra a execução com o erro gravado. */
  processar(item: T, instante: string): Promise<void>
}

export interface PedidoDeExecucao<T extends ItemDaRotina> {
  /** O nome da rotina como está na seção 4.6 (`cron-dial`). */
  readonly nome: string
  readonly porta: PortaDeExecucao
  readonly trabalho: TrabalhoDaRotina<T>
  readonly agora?: () => number
  /**
   * Teto desta rotina, de 1 a `TETO_DE_ITENS`. Rotina cujo item custa mais
   * (uma ligação de lembrete, um e-mail com anexo) pode pedir menos; nenhuma
   * pode pedir mais, porque os 25 da seção 4.6 são o que espalha a retomada
   * depois de uma queda (R-02).
   */
  readonly teto?: number
}

export type ResultadoDaExecucao =
  | {
      readonly ok: true
      readonly execucaoId: string
      readonly itens: number
      readonly alarme: boolean
      readonly media: number | null
    }
  | {
      readonly ok: false
      readonly execucaoId: string
      readonly itens: number
      readonly erro: string
    }

/** A decisão do alarme de volume, pura. */
export interface AvaliacaoDeVolume {
  readonly alarme: boolean
  /** Nula quando não há histórico para comparar. */
  readonly media: number | null
}

/**
 * Compara os itens desta execução com a média do histórico. Sem histórico não
 * há alarme: a primeira execução de uma rotina não tem com o que se comparar.
 * Média zero também não alarma — a rotina que vinha ociosa e acorda com um
 * lead novo não é laço, e "três vezes zero" alarmaria no primeiro item.
 */
export function avaliarVolume(itens: number, historico: readonly number[]): AvaliacaoDeVolume {
  if (historico.length === 0) return { alarme: false, media: null }
  const media = historico.reduce((soma, valor) => soma + valor, 0) / historico.length
  return { alarme: media > 0 && itens > MULTIPLO_DO_ALARME * media, media }
}

/** Envelopa uma execução de rotina: início, trabalho, fim — no erro também. */
export async function executarRotina<T extends ItemDaRotina>(
  pedido: PedidoDeExecucao<T>,
): Promise<ResultadoDaExecucao> {
  const { nome, porta, trabalho } = pedido
  const agora = pedido.agora ?? Date.now
  const teto = pedido.teto ?? TETO_DE_ITENS
  // Teto fora da faixa é erro de quem escreveu a rotina, e morre antes do
  // início gravado: não há execução para registrar, há uma rotina errada.
  if (!Number.isInteger(teto) || teto < 1 || teto > TETO_DE_ITENS) {
    throw new RangeError(`teto de ${teto} itens fora da faixa de 1 a ${TETO_DE_ITENS} (${nome})`)
  }
  const instante = () => new Date(agora()).toISOString()

  const iniciadaEm = instante()
  const execucaoId = await porta.inserirExecucao({
    routine: nome,
    started_at: iniciadaEm,
    account_id: null,
  })

  let itens = 0
  let volume: AvaliacaoDeVolume
  try {
    const reivindicados = await trabalho.reivindicar(teto, iniciadaEm)
    if (reivindicados.length > teto) {
      throw new Error(
        `a reivindicação devolveu ${reivindicados.length} itens com teto de ${teto}; nenhum foi processado`,
      )
    }

    const vistas = new Set<string>()
    for (const item of reivindicados) {
      if (vistas.has(item.chave)) continue
      vistas.add(item.chave)
      await trabalho.processar(item, iniciadaEm)
      itens += 1
    }

    // Dentro do `try` também: a leitura do histórico que falha é erro da
    // execução, e não motivo para a linha ficar sem fim.
    const historico = await porta.itensDasUltimasExecucoes(nome, EXECUCOES_DA_MEDIA, iniciadaEm)
    volume = avaliarVolume(itens, historico)
  } catch (erro) {
    const mensagem = mensagemDe(erro)
    await porta.concluirExecucao(execucaoId, {
      finished_at: instante(),
      items: itens,
      error: mensagem,
      volume_alert: false,
      volume_baseline: null,
    })
    return { ok: false, execucaoId, itens, erro: mensagem }
  }

  await porta.concluirExecucao(execucaoId, {
    finished_at: instante(),
    items: itens,
    error: null,
    volume_alert: volume.alarme,
    volume_baseline: volume.media,
  })
  return { ok: true, execucaoId, itens, alarme: volume.alarme, media: volume.media }
}

function mensagemDe(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  const limpo = texto.trim() === '' ? 'erro sem mensagem' : texto
  return limpo.slice(0, TAMANHO_DO_ERRO)
}
