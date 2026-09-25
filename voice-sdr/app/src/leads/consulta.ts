// As decisões puras da lista de leads: o que a barra de endereço guarda, como
// isso vira o recorte que o serviço recebe, e qual dos dois vazios a tela
// mostra. Nada aqui toca React nem rede, e é por isso que tudo se prova em
// `consulta.test.ts`.
//
// A busca da rota e o recorte não são o mesmo objeto de propósito:
//
// - A busca guarda o **período** da última atividade (`atividade=7d`), e o
//   recorte guarda o **instante** (`atividadeDesde`, ISO 8601). Um link com o
//   instante cravado envelhece — "últimos 7 dias" mandado hoje vira "desde 14
//   de setembro" para quem o abrir no mês que vem —, e o instante é o que a
//   exportação precisa receber para devolver exatamente as linhas da tela.
// - A busca guarda o termo **como a pessoa digitou**, e o recorte guarda o
//   termo já normalizado. O campo de busca precisa mostrar `(48) 99999-8888`
//   de volta; a consulta precisa de `+5548999998888`.

import { normalizarTelefone } from '@compartilhado/telefone.ts'
import {
  lerRecorteDeLeads,
  ORDENACAO_PADRAO,
  ORDENACOES,
  type LeituraDoRecorte,
  type Ordenacao,
} from '@compartilhado/recorte-de-leads.ts'

import type { Origem, Temperatura } from '@/leads/tipos'

/** As três temperaturas, na ordem do seletor (a do check de `leads.temperature`). */
export const TEMPERATURAS: readonly Temperatura[] = ['quente', 'morno', 'frio']

/** Os quatro caminhos de escrita do produto, na ordem do seletor. */
export const ORIGENS: readonly Origem[] = ['import', 'intake', 'manual', 'whatsapp']

/** Janela da última atividade, como o seletor a oferece. */
export type PeriodoDeAtividade = 'tudo' | '24h' | '7d' | '30d'

export const PERIODOS_DE_ATIVIDADE: readonly PeriodoDeAtividade[] = [
  'tudo',
  '24h',
  '7d',
  '30d',
]

/** O filtro de bloqueio tem três estados, e "os dois" é a ausência de filtro. */
export type RecorteDeBloqueio = 'todos' | 'bloqueados' | 'liberados'

export const RECORTES_DE_BLOQUEIO: readonly RecorteDeBloqueio[] = [
  'todos',
  'bloqueados',
  'liberados',
]

/**
 * O que viaja na barra de endereço. Toda chave é opcional e sai sempre de
 * `validateSearch`, ainda que indefinida: a busca do match herda a da raiz, e
 * devolver `{}` deixaria passar o que veio escrito à mão.
 */
export interface BuscaDeLeads {
  termo?: string
  etapa?: string
  temperatura?: string
  origem?: string
  atividade?: string
  bloqueado?: string
  ordenacao?: string
}

/** A busca sem nenhum filtro, com todas as chaves presentes e vazias. */
export const BUSCA_LIMPA: BuscaDeLeads = {
  termo: undefined,
  etapa: undefined,
  temperatura: undefined,
  origem: undefined,
  atividade: undefined,
  bloqueado: undefined,
  ordenacao: undefined,
}

const HORA = 60 * 60 * 1000

const JANELA: Record<Exclude<PeriodoDeAtividade, 'tudo'>, number> = {
  '24h': 24 * HORA,
  '7d': 7 * 24 * HORA,
  '30d': 30 * 24 * HORA,
}

/**
 * Lê uma chave da busca como texto. Valor que não é texto não vem de link
 * legítimo (`?termo[]=a` chega como lista) e é tratado como chave ausente.
 */
export function textoDaBusca(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  return valor.trim() || undefined
}

/**
 * O instante a partir do qual o período vale, em ISO 8601, ou `undefined`
 * quando o recorte é tudo. O relógio entra por parâmetro para o teste poder
 * fixá-lo, como no cofre de credenciais.
 */
export function inicioDaAtividade(
  periodo: PeriodoDeAtividade,
  agora: () => number = Date.now,
): string | undefined {
  if (periodo === 'tudo') return undefined
  return new Date(agora() - JANELA[periodo]).toISOString()
}

/**
 * O termo como a consulta o quer. Texto que só tem dígito e separador de
 * telefone passa pelo módulo portável antes de virar filtro: sem isso,
 * procurar `(48) 99999-8888` não acha `+5548999998888`, que é a única forma
 * que o banco guarda.
 *
 * Número que o módulo recusa (DDD inexistente, dígitos de menos) segue como
 * texto: `48 9999` é busca parcial legítima de quem lembra o começo do número,
 * e o `ilike` do serviço acha o pedaço.
 */
const SO_DE_TELEFONE = /^[+()\s.\-\d]+$/

export function termoDaConsulta(texto: string): string {
  const termo = texto.trim()
  if (!termo || !SO_DE_TELEFONE.test(termo)) return termo

  const numero = normalizarTelefone(termo)
  return numero.ok ? numero.e164 : termo
}

/**
 * O recorte que o serviço recebe, montado a partir da busca da rota e conferido
 * pelo módulo compartilhado — o mesmo que a exportação usa. Conferir aqui é o
 * que faz um `?ordenacao=preco` escrito à mão virar recusa na tela em vez de
 * lista ordenada por outra coisa sem ninguém avisar.
 */
export function recorteDaBusca(
  busca: BuscaDeLeads,
  agora: () => number = Date.now,
): LeituraDoRecorte {
  const periodo = paraPeriodoDeAtividade(busca.atividade)
  if (periodo === null) {
    return { ok: false, motivo: 'filtro_invalido', campo: 'atividade' }
  }

  // O objeto vai cru para o módulo compartilhado, com `bloqueado` e
  // `ordenacao` do jeito que chegaram da barra de endereço: é ele quem conhece
  // os valores aceitos, e conferir aqui também seria uma segunda lista para
  // envelhecer. Passar por ele, e não só na borda, é o que garante que a lista
  // e a exportação recusem as mesmas coisas.
  return lerRecorteDeLeads({
    termo: termoDaConsulta(busca.termo ?? ''),
    etapa: busca.etapa,
    temperatura: busca.temperatura,
    origem: busca.origem,
    atividadeDesde: inicioDaAtividade(periodo, agora),
    bloqueado: busca.bloqueado,
    ordenacao: busca.ordenacao,
  })
}

/** `null` é período desconhecido; `tudo` é a ausência de filtro. */
export function paraPeriodoDeAtividade(
  valor: string | undefined,
): PeriodoDeAtividade | null {
  if (!valor) return 'tudo'
  return (
    PERIODOS_DE_ATIVIDADE.find((periodo) => periodo === valor) ?? null
  )
}

/** O estado do seletor de bloqueio a partir da busca (`bloqueado=true`). */
export function bloqueioDaBusca(valor: string | undefined): RecorteDeBloqueio {
  if (valor === 'true') return 'bloqueados'
  if (valor === 'false') return 'liberados'
  return 'todos'
}

/** O que o seletor escolheu; valor fora da lista cai em "os dois". */
export function bloqueioEscolhido(valor: string): RecorteDeBloqueio {
  return RECORTES_DE_BLOQUEIO.find((recorte) => recorte === valor) ?? 'todos'
}

/** O que o seletor de bloqueio grava na busca. */
export function bloqueadoDaBusca(
  recorte: RecorteDeBloqueio,
): string | undefined {
  if (recorte === 'bloqueados') return 'true'
  if (recorte === 'liberados') return 'false'
  return undefined
}

/** A ordenação em vigor, com o padrão do módulo compartilhado. */
export function ordenacaoDaBusca(valor: string | undefined): Ordenacao {
  return ORDENACOES.find((ordenacao) => ordenacao === valor) ?? ORDENACAO_PADRAO
}

/**
 * Se a busca recorta alguma coisa. É o que decide qual estado vazio a tela
 * mostra: sem filtro, a conta não tem lead; com filtro, o recorte é que não
 * achou. A ordenação não conta — ela muda a ordem, não o conjunto.
 */
export function temRecorte(busca: BuscaDeLeads): boolean {
  return Boolean(
    busca.termo ||
      busca.etapa ||
      busca.temperatura ||
      busca.origem ||
      busca.bloqueado ||
      (busca.atividade && busca.atividade !== 'tudo'),
  )
}

/**
 * A chave da consulta. Sai da **busca**, e não do recorte: o recorte carrega o
 * instante da última atividade, que muda a cada leitura do relógio e faria a
 * chave mudar a cada desenho — e uma chave nova a cada desenho é uma consulta
 * nova a cada desenho.
 */
export function chaveDaBusca(busca: BuscaDeLeads): readonly string[] {
  return [
    'leads',
    busca.termo ?? '',
    busca.etapa ?? '',
    busca.temperatura ?? '',
    busca.origem ?? '',
    busca.atividade ?? 'tudo',
    busca.bloqueado ?? '',
    busca.ordenacao ?? '',
  ]
}

/** Os três desfechos da lista carregada. */
export type EstadoDaLista = 'lista' | 'conta-sem-lead' | 'recorte-sem-resultado'

export function estadoDaLista(
  quantidade: number,
  busca: BuscaDeLeads,
): EstadoDaLista {
  if (quantidade > 0) return 'lista'
  return temRecorte(busca) ? 'recorte-sem-resultado' : 'conta-sem-lead'
}

/**
 * O padrão do `ilike` para o `or` do PostgREST. As aspas são obrigatórias: sem
 * elas, uma vírgula digitada no campo de busca fecha a condição e o resto do
 * termo vira outro filtro. A contrabarra escapa aspa e contrabarra dentro do
 * valor citado.
 */
export function padraoDeBusca(termo: string): string {
  const escapado = termo.replace(/[\\"]/g, (caractere) => `\\${caractere}`)
  return `"%${escapado}%"`
}
