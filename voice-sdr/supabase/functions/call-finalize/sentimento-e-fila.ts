// O sentimento da chamada e os itens da fila, no fim da finalização (US-141,
// RF-909, RF-915, T-16).
//
// **O SENTIMENTO VEM DE QUEM CLASSIFICOU, COM A FONTE.** Quando `tool-qualify`
// gravou durante a conversa, o valor é o que a ferramenta mandou, e mora em
// `calls.classification.sentiment`; quando foi a retaguarda, o modelo de
// `call-classify` já o escreveu em `calls.sentiment`, e a leitura acontece
// depois do acionamento da retaguarda, que a finalização espera. Os dois
// chegam aqui pela mesma leitura, e a finalização grava `calls.sentiment`,
// `calls.sentiment_source` e `leads.last_sentiment` na mesma passagem. Chamada
// corrigida por humano não é reescrita: a trava do banco devolveria o valor
// antigo de qualquer jeito, e a porta nem é chamada.
//
// **OS LIMIARES VÊM DA CONTA, NUNCA DE CONSTANTE.** Leitura dos limiares de
// `account_settings`, cálculo puro por `itensDaChamada`
// (`_shared/fila/gatilhos.ts`) e gravação idempotente por
// `registrar_item_de_fila`: a chave é por causa, e rodar a finalização duas
// vezes sobre a mesma chamada não cria segundo item. Este módulo não compara
// nada com limiar; quem compara é o módulo da fila.
//
// **MUDAR O LIMIAR NÃO REESCREVE A FILA.** O item nasce com o limiar vigente
// em `threshold_snapshot`, e o que já está aberto continua aberto: a fila é o
// que as chamadas passadas mereceram pela regra do dia delas, e o limiar novo
// vale da chamada seguinte em diante. Reavaliar os itens abertos a cada mudança
// apagaria justamente o que o operador ainda não viu.
//
// **A SEQUÊNCIA DE FALHAS É CONSULTA** (`falhas_consecutivas`, em
// `call_attempts`, que é da F2). Contador próprio divergiria dela.
//
// **ENSAIO NÃO TOCA NADA** (T-16): nem sentimento no lead, nem item, nem a
// porta.
//
// Passo acessório: falha aqui não derruba a finalização. O item é aviso para o
// operador, e não promessa feita ao lead.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  itensDaChamada,
  type GeneroDoGatilho,
  type ItemDeFila,
  type LimiaresDaFila,
} from '../_shared/fila/gatilhos.ts'
import { sentimentoNaFaixa } from '../_shared/qualificacao/resultado.ts'

import type { AtendidaPor } from './leitura-da-transcricao.ts'

export type FonteDoSentimento = 'tool' | 'backfill'

/** O que a chamada tem gravado depois da classificação. */
export interface ResultadoGravado {
  readonly classification_source: string | null
  readonly classification: unknown
  readonly sentiment: number | null
  readonly evaluation: unknown
}

export interface LimiaresDaConta {
  readonly limiares: LimiaresDaFila
  /** `accounts.timezone`: o dia da chave de falha é o dia da conta. */
  readonly fuso: string
}

export interface SequenciaDeFalhas {
  readonly telefone: string
  readonly falhas: number
}

export interface PortaDaFila {
  lerResultadoDaChamada(chamadaId: string): Promise<ResultadoGravado>
  /** `calls.sentiment` e `sentiment_source`; com lead, `leads.last_sentiment` junto. */
  gravarSentimento(
    contaId: string,
    chamadaId: string,
    leadId: string | null,
    valor: number,
    fonte: FonteDoSentimento,
  ): Promise<void>
  limiaresDaFila(contaId: string): Promise<LimiaresDaConta>
  /** `falhas_consecutivas`. Nulo quando a chamada não nasceu de tentativa. */
  falhasConsecutivas(contaId: string, chamadaId: string): Promise<SequenciaDeFalhas | null>
  /** `registrar_item_de_fila`. */
  registrarItemDeFila(contaId: string, item: ItemDeFila): Promise<'criado' | 'ja_aberto'>
}

export interface ChamadaDaFila {
  readonly id: string
  readonly account_id: string
  readonly lead_id: string | null
  readonly direction: 'outbound' | 'inbound' | 'rehearsal'
}

export type DesfechoDoSentimento = 'nao_se_aplica' | 'sem_sentimento' | 'corrigido_por_humano' | FonteDoSentimento | 'falhou'

export type DesfechoDaFila =
  | { readonly situacao: 'nao_se_aplica' }
  | { readonly situacao: 'falhou' }
  | {
      readonly situacao: 'avaliada'
      readonly criados: readonly GeneroDoGatilho[]
      readonly jaAbertos: readonly GeneroDoGatilho[]
    }

export interface DesfechoDoSentimentoEDaFila {
  readonly sentimento: DesfechoDoSentimento
  readonly fila: DesfechoDaFila
}

/**
 * O sentimento e a fonte, pelo que está gravado. `tool` lê o que a ferramenta
 * mandou; `backfill` lê o que o modelo escreveu na coluna. Sem classificação,
 * não há sentimento: inventar zero poria a chamada no meio da escala.
 */
export function sentimentoDaChamada(
  resultado: ResultadoGravado,
): { readonly valor: number; readonly fonte: FonteDoSentimento } | null {
  if (resultado.classification_source === 'tool') {
    const classificacao = resultado.classification
    const bruto =
      classificacao && typeof classificacao === 'object' && !Array.isArray(classificacao)
        ? (classificacao as Record<string, unknown>).sentiment
        : null
    const valor = sentimentoNaFaixa(bruto)
    return valor === null ? null : { valor, fonte: 'tool' }
  }
  if (resultado.classification_source === 'backfill') {
    const valor = sentimentoNaFaixa(resultado.sentiment)
    return valor === null ? null : { valor, fonte: 'backfill' }
  }
  return null
}

/**
 * As chaves reprovadas de `calls.evaluation`: o juízo do modelo
 * (`criterios.<chave>.aprovado === false`, ou `itens[]` com `aprovado: false`)
 * e toda medição gravada (`medicoes.<chave>`), porque a finalização só grava a
 * medição quando ela diverge. Forma inesperada é lista vazia.
 */
export function criteriosReprovados(evaluation: unknown): string[] {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) return []
  const avaliacao = evaluation as Record<string, unknown>
  const reprovados = new Set<string>()

  const criterios = avaliacao.criterios
  if (criterios && typeof criterios === 'object' && !Array.isArray(criterios)) {
    for (const [chave, item] of Object.entries(criterios as Record<string, unknown>)) {
      if (item && typeof item === 'object' && (item as { aprovado?: unknown }).aprovado === false) {
        reprovados.add(chave)
      }
    }
  }

  const itens = avaliacao.itens
  if (Array.isArray(itens)) {
    for (const item of itens) {
      if (!item || typeof item !== 'object') continue
      const { criterio, aprovado } = item as { criterio?: unknown; aprovado?: unknown }
      if (typeof criterio === 'string' && aprovado === false) reprovados.add(criterio)
    }
  }

  const medicoes = avaliacao.medicoes
  if (medicoes && typeof medicoes === 'object' && !Array.isArray(medicoes)) {
    for (const chave of Object.keys(medicoes as Record<string, unknown>)) reprovados.add(chave)
  }

  return [...reprovados]
}

/** AAAA-MM-DD do instante no fuso dado. Fuso inválido cai em UTC. */
export function diaNoFuso(instante: string, fuso: string): string {
  const data = new Date(instante)
  let formato: Intl.DateTimeFormat
  try {
    formato = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' })
  } catch {
    formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  return formato.format(data)
}

export async function aplicarSentimentoEFila(
  chamada: ChamadaDaFila,
  fim: { readonly atendidaPor: AtendidaPor; readonly instante: string },
  porta: PortaDaFila,
): Promise<DesfechoDoSentimentoEDaFila> {
  if (chamada.direction === 'rehearsal') {
    return { sentimento: 'nao_se_aplica', fila: { situacao: 'nao_se_aplica' } }
  }

  let resultado: ResultadoGravado
  try {
    resultado = await porta.lerResultadoDaChamada(chamada.id)
  } catch {
    return { sentimento: 'falhou', fila: { situacao: 'falhou' } }
  }

  const sentimento = await gravarSentimento(chamada, resultado, porta)

  let fila: DesfechoDaFila
  try {
    const [{ limiares, fuso }, sequencia] = await Promise.all([
      porta.limiaresDaFila(chamada.account_id),
      porta.falhasConsecutivas(chamada.account_id, chamada.id),
    ])
    const valor = resultado.classification_source === 'human'
      ? sentimentoNaFaixa(resultado.sentiment)
      : (sentimentoDaChamada(resultado)?.valor ?? null)
    const itens = itensDaChamada(
      {
        id: chamada.id,
        direction: chamada.direction,
        atendida: fim.atendidaPor === 'human',
        sentimento: valor,
        criteriosReprovados: criteriosReprovados(resultado.evaluation),
        telefone: sequencia?.telefone ?? '',
        dia: diaNoFuso(fim.instante, fuso),
        leadId: chamada.lead_id,
      },
      limiares,
      { falhasConsecutivas: sequencia?.falhas ?? 0, credito: null },
    )
    const criados: GeneroDoGatilho[] = []
    const jaAbertos: GeneroDoGatilho[] = []
    for (const item of itens) {
      const situacao = await porta.registrarItemDeFila(chamada.account_id, item)
      if (situacao === 'criado') criados.push(item.kind)
      else jaAbertos.push(item.kind)
    }
    fila = { situacao: 'avaliada', criados, jaAbertos }
  } catch {
    fila = { situacao: 'falhou' }
  }

  return { sentimento, fila }
}

async function gravarSentimento(
  chamada: ChamadaDaFila,
  resultado: ResultadoGravado,
  porta: PortaDaFila,
): Promise<DesfechoDoSentimento> {
  if (resultado.classification_source === 'human') return 'corrigido_por_humano'
  const sentimento = sentimentoDaChamada(resultado)
  if (!sentimento) return 'sem_sentimento'
  try {
    await porta.gravarSentimento(chamada.account_id, chamada.id, chamada.lead_id, sentimento.valor, sentimento.fonte)
    return sentimento.fonte
  } catch {
    return 'falhou'
  }
}
