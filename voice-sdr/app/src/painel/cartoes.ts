// O que cada campo do resumo vira na tela. Três leituras, e só três:
//
// - `valor`: o RPC mandou número, e o cartão o mostra em `.val`.
// - `sem_base`: o número não existe porque não houve de onde tirá-lo (taxa sem
//   ligação, nota sem chamada avaliada). O cartão diz por quê.
// - `indisponivel`: o RPC devolveu `indisponivel_nesta_fase`, o que só uma
//   instalação sem a migração 20261013100000 faz. O cartão diz que o número
//   ainda não aparece. Nunca zero, nunca cartão morto: zero se lê como
//   "nenhuma reunião", e é mentira por omissão.
//
// A métrica norte (reunião realizada) passa por aqui como qualquer outro
// campo: conta só a reunião com desfecho marcado, e a que passou sem desfecho
// aparece ao lado, em `pendenciasDaMetricaNorte`, nunca somada a ela.

import { ehIndisponivel } from '@/painel/leitura'
import type { Campo, IntervaloDoPainel, ResumoDoPainel, ValorEmMoeda } from '@/painel/tipos'

export type LeituraDoCampo =
  | { estado: 'valor'; valor: number }
  | { estado: 'sem_base' }
  | { estado: 'indisponivel'; fatia: string }

export function lerCampo(campo: Campo<number | null>): LeituraDoCampo {
  if (ehIndisponivel(campo)) return { estado: 'indisponivel', fatia: campo.fatia }
  if (campo === null) return { estado: 'sem_base' }
  return { estado: 'valor', valor: campo }
}

/** Reuniões realizadas no período: a métrica norte do produto. */
export function metricaNorte(resumo: ResumoDoPainel): LeituraDoCampo {
  return lerCampo(resumo.reunioes.realizadas)
}

/**
 * O que a tela diz ao lado da métrica norte: quantas reuniões do período
 * passaram sem desfecho marcado, e se a apuração ficou abaixo de 70% (RF-518).
 */
export function pendenciasDaMetricaNorte(resumo: ResumoDoPainel): {
  semApuracao: number
  degradada: boolean
} {
  const semApuracao = lerCampo(resumo.reunioes.semApuracao)
  const degradacao = resumo.apuracao.degradacaoDaMetricaNorte
  return {
    semApuracao: semApuracao.estado === 'valor' ? semApuracao.valor : 0,
    degradada: degradacao === true,
  }
}

export type LeituraDoCusto =
  | { estado: 'valor'; valores: ValorEmMoeda[] }
  | { estado: 'sem_base' }
  | { estado: 'indisponivel'; fatia: string }

/** Custo por reunião realizada, por moeda. Lista vazia é reunião sem preço de ligação. */
export function custoPorReuniao(resumo: ResumoDoPainel): LeituraDoCusto {
  const campo = resumo.custoPorReuniaoRealizada
  if (ehIndisponivel(campo)) return { estado: 'indisponivel', fatia: campo.fatia }
  if (campo === null || campo.length === 0) return { estado: 'sem_base' }
  return { estado: 'valor', valores: campo }
}

export type CartaoDeLigacoes = 'total' | 'atendidas' | 'taxaDeAtendimento' | 'duracaoMedia'

export const CARTOES_DE_LIGACOES = [
  'total',
  'atendidas',
  'taxaDeAtendimento',
  'duracaoMedia',
] as const satisfies readonly CartaoDeLigacoes[]

export function cartaoDeLigacoes(resumo: ResumoDoPainel, cartao: CartaoDeLigacoes): LeituraDoCampo {
  const { ligacoes } = resumo
  switch (cartao) {
    case 'total':
      return lerCampo(ligacoes.total)
    case 'atendidas':
      return lerCampo(ligacoes.atendidas)
    case 'taxaDeAtendimento':
      return lerCampo(ligacoes.taxaDeAtendimento)
    case 'duracaoMedia':
      return lerCampo(ligacoes.duracaoMediaSeg)
  }
}

export function notaMedia(resumo: ResumoDoPainel): LeituraDoCampo {
  return lerCampo(resumo.avaliacao.notaMedia)
}

/**
 * Os cartões de reunião, na ordem em que o painel mostra. A métrica norte
 * fica fora: ela tem cartão próprio, no topo. O custo por reunião realizada
 * também, porque vem por moeda (`custoPorReuniao`).
 */
export type CartaoDeReuniao =
  | 'marcadas'
  | 'confirmadas'
  | 'faltas'
  | 'taxaDeComparecimento'
  | 'semApuracao'
  | 'proximasReunioes'
  | 'taxaDeApuracao'

export const CARTOES_DE_REUNIAO = [
  'marcadas',
  'confirmadas',
  'faltas',
  'taxaDeComparecimento',
  'semApuracao',
  'proximasReunioes',
  'taxaDeApuracao',
] as const satisfies readonly CartaoDeReuniao[]

export function cartaoDeReuniao(resumo: ResumoDoPainel, cartao: CartaoDeReuniao): LeituraDoCampo {
  switch (cartao) {
    case 'proximasReunioes':
      return lerCampo(resumo.proximasReunioes)
    case 'taxaDeApuracao':
      return lerCampo(resumo.apuracao.taxaDeApuracao)
    default:
      return lerCampo(resumo.reunioes[cartao])
  }
}

export interface LinhaDoFunil {
  key: string
  label: string
  entraram: number
  passagem: LeituraDoCampo
}

/**
 * O funil do período, na ordem das etapas. O rótulo é o atual; o número é o
 * que o RPC contou pela key, e renomear a etapa não o toca.
 */
export function linhasDoFunil(resumo: ResumoDoPainel): LinhaDoFunil[] {
  return resumo.funil.map((etapa) => ({
    key: etapa.key,
    label: etapa.label,
    entraram: etapa.entraram,
    passagem: lerCampo(etapa.taxaDePassagem),
  }))
}

/** Sem ligação no período, a tela mostra o vazio com o caminho para discar. */
export function periodoVazio(resumo: ResumoDoPainel): boolean {
  return resumo.ligacoes.total === 0
}

// Períodos ----------------------------------------------------------------------

export const PERIODOS = ['hoje', 'sete-dias', 'trinta-dias', 'mes'] as const

export type Periodo = (typeof PERIODOS)[number]

export const PERIODO_PADRAO: Periodo = 'sete-dias'

function inicioDoDia(instante: number, diasAtras = 0): Date {
  const dia = new Date(instante)
  dia.setHours(0, 0, 0, 0)
  dia.setDate(dia.getDate() - diasAtras)
  return dia
}

/**
 * O intervalo `[de, ate)` do período, no fuso de quem olha. Os períodos
 * corridos terminam no fim de hoje e contam hoje como um dos dias.
 */
export function intervaloDoPeriodo(periodo: Periodo, agora: number): IntervaloDoPainel {
  const amanha = inicioDoDia(agora, -1)
  let de: Date
  switch (periodo) {
    case 'hoje':
      de = inicioDoDia(agora)
      break
    case 'sete-dias':
      de = inicioDoDia(agora, 6)
      break
    case 'trinta-dias':
      de = inicioDoDia(agora, 29)
      break
    case 'mes':
      de = inicioDoDia(agora)
      de.setDate(1)
      break
  }
  return { de: de.toISOString(), ate: amanha.toISOString() }
}
