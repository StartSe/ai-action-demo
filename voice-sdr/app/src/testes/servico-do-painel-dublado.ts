import { lerResumo } from '@/painel/leitura'
import type {
  CargaDoPainel,
  IntervaloDoPainel,
  MotivoDeFalhaDoPainel,
  ServicoDoPainel,
} from '@/painel/tipos'

/**
 * Os campos de reunião como a instalação sem a migração 20261013100000 ainda
 * os devolve: o objeto `indisponivel_nesta_fase` em vez de número.
 */
export function reunioesDeInstalacaoAntiga() {
  const f5 = { codigo: 'indisponivel_nesta_fase', fatia: 'F5' }
  const f6 = { codigo: 'indisponivel_nesta_fase', fatia: 'F6' }
  return {
    reunioes: {
      marcadas: f5,
      confirmadas: f5,
      realizadas: f6,
      faltas: f6,
      taxa_de_comparecimento: f6,
    },
    custo_por_reuniao_realizada: f6,
    proximas_reunioes: f5,
    apuracao: { taxa_de_apuracao: f6, degradacao_da_metrica_norte: f6 },
  }
}

/** O funil padrão da conta, no formato do RPC, com os rótulos trocáveis. */
export function funilBruto(rotulos: Partial<Record<string, string>> = {}) {
  const etapa = (key: string, label: string, posicao: number, entraram: number, taxa: number | null) => ({
    key,
    label: rotulos[key] ?? label,
    posicao,
    entraram,
    taxa_de_passagem: taxa,
  })
  return [
    etapa('new', 'Novo', 1, 40, null),
    etapa('contacted', 'Contatado', 2, 20, 0.5),
    etapa('qualified', 'Qualificado', 3, 8, 0.4),
    etapa('meeting_booked', 'Reunião marcada', 4, 0, 0),
    etapa('lost', 'Perdido', 5, 3, null),
  ]
}

/** A resposta do RPC para um período sem ligação nenhuma. */
export function resumoBrutoVazio() {
  return {
    periodo: { de: '2026-09-18T03:00:00Z', ate: '2026-09-25T03:00:00Z' },
    ligacoes: { total: 0, atendidas: 0, taxa_de_atendimento: null, duracao_media_seg: null },
    funil: funilBruto().map((etapa) => ({ ...etapa, entraram: 0, taxa_de_passagem: null })),
    avaliacao: { nota_media: null, avaliadas: 0 },
    sentimento: { positivo: 0, neutro: 0, negativo: 0, sem_sentimento: 0, piso: -0.5 },
    custo: { por_componente: [], total: [] },
    ultimas_ligacoes: [],
    reunioes: {
      marcadas: 0,
      confirmadas: 0,
      realizadas: 0,
      faltas: 0,
      taxa_de_comparecimento: null,
      sem_apuracao: 0,
    },
    custo_por_reuniao_realizada: null,
    proximas_reunioes: 0,
    apuracao: { taxa_de_apuracao: null, degradacao_da_metrica_norte: null },
  }
}

/** A resposta do RPC para um período com operação. `numeric` chega como texto. */
export function resumoBrutoDeExemplo(rotulos: Partial<Record<string, string>> = {}) {
  return {
    ...resumoBrutoVazio(),
    ligacoes: { total: 48, atendidas: 30, taxa_de_atendimento: '0.6250', duracao_media_seg: '142.5' },
    funil: funilBruto(rotulos),
    avaliacao: { nota_media: '7.60', avaliadas: 26 },
    sentimento: { positivo: 14, neutro: 9, negativo: 4, sem_sentimento: 3, piso: -0.5 },
    custo: {
      por_componente: [
        { componente: 'infra', moeda: 'BRL', centavos: 150 },
        { componente: 'telephony', moeda: 'BRL', centavos: 1840 },
        { componente: 'model', moeda: 'USD', centavos: 212 },
        { componente: 'voice', moeda: 'USD', centavos: 935 },
      ],
      total: [
        { moeda: 'BRL', centavos: 1990 },
        { moeda: 'USD', centavos: 1147 },
      ],
    },
    reunioes: {
      marcadas: 9,
      confirmadas: 4,
      realizadas: 5,
      faltas: 1,
      taxa_de_comparecimento: '0.8333',
      sem_apuracao: 2,
    },
    custo_por_reuniao_realizada: [
      { moeda: 'BRL', centavos: 398 },
      { moeda: 'USD', centavos: 229 },
    ],
    proximas_reunioes: 3,
    apuracao: { taxa_de_apuracao: '0.7500', degradacao_da_metrica_norte: false },
  }
}

export interface RespostasDoPainel {
  /** A resposta bruta do RPC. O padrão é o período vazio. */
  resumo?: unknown | ((intervalo: IntervaloDoPainel) => unknown)
  falha?: MotivoDeFalhaDoPainel
  /** A carga nunca volta. */
  pendente?: boolean
}

export interface ServicoDoPainelDublado extends ServicoDoPainel {
  /** Cada intervalo pedido ao RPC, na ordem. */
  readonly pedidos: IntervaloDoPainel[]
}

/**
 * O dublê devolve o `jsonb` do RPC e o passa por `lerResumo`, a mesma leitura
 * do serviço de verdade. O padrão é o período vazio, que desenha só o estado
 * vazio abaixo do discador.
 */
export function criarServicoDoPainelDublado(respostas: RespostasDoPainel = {}): ServicoDoPainelDublado {
  const pedidos: IntervaloDoPainel[] = []

  return {
    pedidos,
    async carregarResumo(intervalo): Promise<CargaDoPainel> {
      pedidos.push(intervalo)
      if (respostas.pendente) return new Promise<CargaDoPainel>(() => {})
      if (respostas.falha) return { ok: false, motivo: respostas.falha }

      const bruto =
        typeof respostas.resumo === 'function'
          ? (respostas.resumo as (intervalo: IntervaloDoPainel) => unknown)(intervalo)
          : (respostas.resumo ?? resumoBrutoVazio())
      const resumo = lerResumo(bruto)
      return resumo ? { ok: true, resumo } : { ok: false, motivo: 'falha-de-comunicacao' }
    },
  }
}
