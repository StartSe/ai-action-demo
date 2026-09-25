// A leitura do `jsonb` de `dashboard_summary`, com recusa para o que não casa.
//
// O serviço sobre o Supabase e o dublê passam pela mesma função: o teste da
// tela desenha o formato do RPC, e não um objeto escrito para a tela. Número
// que não veio fica nulo, nunca zero; o objeto `indisponivel_nesta_fase`, que
// só uma instalação sem a migração 20261013100000 ainda devolve, chega intacto
// a `cartoes.ts`, que decide o que ele vira.

import type {
  Campo,
  EtapaDoPeriodo,
  Indisponivel,
  ParcelaDoPeriodo,
  ResumoDoPainel,
  ValorEmMoeda,
} from '@/painel/tipos'

type Bruto = Record<string, unknown>

function objeto(valor: unknown): Bruto | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Bruto)
    : null
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : []
}

/** `numeric` do Postgres pode chegar como texto pelo PostgREST. */
function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  if (typeof valor === 'string' && valor.trim() !== '') {
    const lido = Number(valor)
    return Number.isFinite(lido) ? lido : null
  }
  return null
}

function contagem(valor: unknown): number {
  return numero(valor) ?? 0
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null
}

export function ehIndisponivel(valor: unknown): valor is Indisponivel {
  const bruto = objeto(valor)
  return bruto?.codigo === 'indisponivel_nesta_fase' && typeof bruto.fatia === 'string'
}

function campo(valor: unknown): Campo<number | null> {
  if (ehIndisponivel(valor)) return { codigo: 'indisponivel_nesta_fase', fatia: valor.fatia }
  if (Array.isArray(valor)) return valor.length
  return numero(valor)
}

function campoDeMoedas(valor: unknown): Campo<ValorEmMoeda[] | null> {
  if (ehIndisponivel(valor)) return { codigo: 'indisponivel_nesta_fase', fatia: valor.fatia }
  if (!Array.isArray(valor)) return null
  return semNulos(valor.map(valorEmMoeda))
}

function campoLogico(valor: unknown): Campo<boolean | null> {
  if (ehIndisponivel(valor)) return { codigo: 'indisponivel_nesta_fase', fatia: valor.fatia }
  return typeof valor === 'boolean' ? valor : null
}

function etapa(valor: unknown): EtapaDoPeriodo | null {
  const bruto = objeto(valor)
  const key = texto(bruto?.key)
  if (!bruto || !key) return null
  return {
    key,
    label: texto(bruto.label) ?? key,
    posicao: contagem(bruto.posicao),
    entraram: contagem(bruto.entraram),
    taxaDePassagem: numero(bruto.taxa_de_passagem),
  }
}

function parcela(valor: unknown): ParcelaDoPeriodo | null {
  const bruto = objeto(valor)
  const componente = texto(bruto?.componente)
  const moeda = texto(bruto?.moeda)
  const centavos = numero(bruto?.centavos)
  if (!componente || !moeda || centavos === null) return null
  return { componente, moeda, centavos }
}

function valorEmMoeda(valor: unknown): ValorEmMoeda | null {
  const bruto = objeto(valor)
  const moeda = texto(bruto?.moeda)
  const centavos = numero(bruto?.centavos)
  if (!moeda || centavos === null) return null
  return { moeda, centavos }
}

function semNulos<T>(itens: (T | null)[]): T[] {
  return itens.filter((item): item is T => item !== null)
}

/** O resumo do RPC, ou nulo quando a resposta não tem o formato dele. */
export function lerResumo(resposta: unknown): ResumoDoPainel | null {
  const bruto = objeto(resposta)
  const ligacoes = objeto(bruto?.ligacoes)
  if (!bruto || !ligacoes) return null

  const avaliacao = objeto(bruto.avaliacao) ?? {}
  const sentimento = objeto(bruto.sentimento) ?? {}
  const custo = objeto(bruto.custo) ?? {}
  const reunioes = objeto(bruto.reunioes) ?? {}
  const apuracao = objeto(bruto.apuracao) ?? {}

  return {
    ligacoes: {
      total: contagem(ligacoes.total),
      atendidas: contagem(ligacoes.atendidas),
      taxaDeAtendimento: numero(ligacoes.taxa_de_atendimento),
      duracaoMediaSeg: numero(ligacoes.duracao_media_seg),
    },
    funil: semNulos(lista(bruto.funil).map(etapa)).sort((a, b) => a.posicao - b.posicao),
    avaliacao: {
      notaMedia: numero(avaliacao.nota_media),
      avaliadas: contagem(avaliacao.avaliadas),
    },
    sentimento: {
      positivo: contagem(sentimento.positivo),
      neutro: contagem(sentimento.neutro),
      negativo: contagem(sentimento.negativo),
      semSentimento: contagem(sentimento.sem_sentimento),
      piso: numero(sentimento.piso) ?? -0.5,
    },
    custo: {
      porComponente: semNulos(lista(custo.por_componente).map(parcela)),
      total: semNulos(lista(custo.total).map(valorEmMoeda)),
    },
    reunioes: {
      marcadas: campo(reunioes.marcadas),
      confirmadas: campo(reunioes.confirmadas),
      realizadas: campo(reunioes.realizadas),
      faltas: campo(reunioes.faltas),
      taxaDeComparecimento: campo(reunioes.taxa_de_comparecimento),
      semApuracao: campo(reunioes.sem_apuracao),
    },
    custoPorReuniaoRealizada: campoDeMoedas(bruto.custo_por_reuniao_realizada),
    proximasReunioes: campo(bruto.proximas_reunioes),
    apuracao: {
      taxaDeApuracao: campo(apuracao.taxa_de_apuracao),
      degradacaoDaMetricaNorte: campoLogico(apuracao.degradacao_da_metrica_norte),
    },
  }
}
