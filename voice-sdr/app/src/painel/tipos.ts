/**
 * O que o painel (`/`) conhece do período. Tudo sai de um RPC só,
 * `dashboard_summary(conta, de, ate)` (US-143): a tela não soma `calls` no
 * navegador (L-21). A leitura do `jsonb` fica em `leitura.ts`, e o que cada
 * campo vira na tela é decidido em `cartoes.ts`.
 */

/**
 * O campo que o banco desta instalação ainda não calcula. A versão de
 * `dashboard_summary` anterior à migração 20261013100000 devolvia este objeto
 * nos campos de reunião em vez de zero, porque zero se lê como "nenhuma
 * reunião". A leitura continua aceitando o objeto, para o painel não mentir
 * numa instalação que ainda não recebeu a atualização.
 */
export interface Indisponivel {
  codigo: 'indisponivel_nesta_fase'
  /** A fatia que entrega o campo (`F5`, `F6`). */
  fatia: string
}

/**
 * Um campo que pode ainda não existir nesta fase. Quando a fatia ligar o
 * número, o valor chega no lugar do objeto, sem mudar a tela.
 */
export type Campo<T> = T | Indisponivel

export interface EtapaDoPeriodo {
  /** A chave estável da etapa. É por ela que os números casam. */
  key: string
  /** O rótulo atual, só para desenhar. */
  label: string
  posicao: number
  /** Leads distintos que chegaram à etapa no período. */
  entraram: number
  /** `entraram` sobre o da etapa anterior. Nulo na primeira, na de perda e sem base. */
  taxaDePassagem: number | null
}

export interface ParcelaDoPeriodo {
  componente: string
  moeda: string
  centavos: number
}

export interface ValorEmMoeda {
  moeda: string
  centavos: number
}

export interface ResumoDoPainel {
  ligacoes: {
    total: number
    atendidas: number
    /** Nula quando não houve ligação. */
    taxaDeAtendimento: number | null
    /** Das atendidas. Nula quando nenhuma foi atendida. */
    duracaoMediaSeg: number | null
  }
  funil: EtapaDoPeriodo[]
  avaliacao: { notaMedia: number | null; avaliadas: number }
  sentimento: {
    positivo: number
    neutro: number
    negativo: number
    semSentimento: number
    /** `account_settings.sentiment_floor`, a régua da fila. */
    piso: number
  }
  /** Por moeda: o provedor de voz cobra em dólar, e somar moedas seria inventar câmbio. */
  custo: { porComponente: ParcelaDoPeriodo[]; total: ValorEmMoeda[] }
  reunioes: {
    marcadas: Campo<number | null>
    confirmadas: Campo<number | null>
    /** A métrica norte. */
    realizadas: Campo<number | null>
    faltas: Campo<number | null>
    taxaDeComparecimento: Campo<number | null>
    /** Reuniões cujo horário passou sem ninguém marcar o desfecho (RF-516). */
    semApuracao: Campo<number | null>
  }
  /** Por moeda, como o custo do período. Nulo sem reunião realizada. */
  custoPorReuniaoRealizada: Campo<ValorEmMoeda[] | null>
  /** Quantas reuniões ativas começam daqui em diante. */
  proximasReunioes: Campo<number | null>
  apuracao: {
    taxaDeApuracao: Campo<number | null>
    /** Verdadeiro quando a taxa de apuração fica abaixo de 70% (RF-518). */
    degradacaoDaMetricaNorte: Campo<boolean | null>
  }
}

/** O intervalo `[de, ate)` em ISO, como o RPC recebe. */
export interface IntervaloDoPainel {
  de: string
  ate: string
}

export type MotivoDeFalhaDoPainel = 'sem-conta' | 'sem-permissao' | 'falha-de-comunicacao'

export type CargaDoPainel =
  | { ok: true; resumo: ResumoDoPainel }
  | { ok: false; motivo: MotivoDeFalhaDoPainel }

export interface ServicoDoPainel {
  /** Uma chamada a `dashboard_summary` por período. */
  carregarResumo(intervalo: IntervaloDoPainel): Promise<CargaDoPainel>
}
