import type { EtapaConfigurada, EtapaPedida } from '@/leads/tipos'

/**
 * As seis chaves que a automação cita (RF-203). São as mesmas do check
 * `pipeline_stages_chave_valida` e do gatilho `recusar_exclusao_de_etapa`:
 * etapa com uma delas não se apaga, e a tela não oferece o que o banco recusa.
 */
export const CHAVES_CANONICAS: readonly string[] = [
  'new',
  'contacted',
  'qualified',
  'meeting_booked',
  'won',
  'lost',
]

export function ehCanonica(chave: string): boolean {
  return CHAVES_CANONICAS.includes(chave)
}

/**
 * As cores que uma etapa pode ter, pelo nome do token de
 * `docs/padrao-de-interface.md` seção 2. A escolha é entre estes valores, e
 * nunca hexadecimal livre: cor arbitrária quebra o contraste da tela densa. O
 * nome do token é o que vai para `pipeline_stages.color`.
 */
export const CORES_DA_ETAPA = [
  'informacao',
  'atencao',
  'menta',
  'menta-2',
  'carmim',
  'perigo',
  'texto-desativado',
] as const

export type CorDaEtapa = (typeof CORES_DA_ETAPA)[number]

/** A utilitária de fundo de cada token, escrita inteira para o Tailwind achá-la. */
export const FUNDO_DA_COR: Readonly<Record<CorDaEtapa, string>> = {
  informacao: 'bg-informacao',
  atencao: 'bg-atencao',
  menta: 'bg-menta',
  'menta-2': 'bg-menta-2',
  carmim: 'bg-carmim',
  perigo: 'bg-perigo',
  'texto-desativado': 'bg-texto-desativado',
}

/**
 * A cor de quem ainda não escolheu nenhuma, pela chave, como o quadro do design
 * system (seção 10). Etapa que a conta criou fica no neutro. Ganho é
 * `--positivo`, que é o mesmo valor de `--menta-2`, e por isso a paleta não o
 * oferece duas vezes com dois nomes.
 */
const COR_PADRAO: Readonly<Record<string, CorDaEtapa>> = {
  new: 'informacao',
  contacted: 'atencao',
  qualified: 'menta-2',
  meeting_booked: 'carmim',
  won: 'menta-2',
  lost: 'texto-desativado',
}

/** O que está gravado em `color`, se for da paleta; qualquer outro valor é nulo. */
export function paraCor(valor: string | null | undefined): CorDaEtapa | null {
  return CORES_DA_ETAPA.find((cor) => cor === valor) ?? null
}

/** A cor que a tela desenha: a escolhida, ou a padrão da chave. */
export function corDaEtapa(chave: string, cor: CorDaEtapa | null | undefined): CorDaEtapa {
  return cor ?? COR_PADRAO[chave] ?? 'texto-desativado'
}

/** O formato de chave própria que o check do banco aceita. */
const FORMATO_DA_CHAVE = /^[a-z][a-z0-9_]{2,31}$/

/**
 * A chave de uma etapa nova, derivada do rótulo: sem acento, minúscula,
 * espaços e pontuação viram sublinhado. `null` quando o rótulo não dá chave no
 * formato do banco (curta demais, ou começando por dígito). A chave é gravada
 * uma vez e nunca muda, então a tela a mostra antes de criar.
 */
export function chaveDoRotulo(rotulo: string): string | null {
  const chave = rotulo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
    .replace(/_+$/, '')
  return FORMATO_DA_CHAVE.test(chave) ? chave : null
}

/**
 * A lista inteira de etapas que o RPC recebe para uma troca de lugar: a etapa
 * sobe ou desce uma casa, e todas vão com a posição final. Posição é o índice
 * na ordem nova, e não a antiga somada de um: é a lista completa que evita
 * colisão no meio da gravação.
 */
export function listaReordenada(
  etapas: readonly EtapaConfigurada[],
  id: string,
  sentido: -1 | 1,
): EtapaPedida[] | null {
  const indice = etapas.findIndex((etapa) => etapa.id === id)
  const destino = indice + sentido
  if (indice < 0 || destino < 0 || destino >= etapas.length) return null

  const ordem = [...etapas]
  const [movida] = ordem.splice(indice, 1)
  ordem.splice(destino, 0, movida!)
  return ordem.map((etapa, posicao) => paraPedido(etapa, { posicao }))
}

/** Uma etapa existente como o RPC a recebe, com o que mudou por cima. */
export function paraPedido(
  etapa: EtapaConfigurada,
  mudanca: Partial<Pick<EtapaPedida, 'rotulo' | 'posicao' | 'cor'>> = {},
): EtapaPedida {
  return {
    id: etapa.id,
    rotulo: mudanca.rotulo ?? etapa.rotulo,
    posicao: mudanca.posicao ?? etapa.posicao,
    cor: mudanca.cor === undefined ? etapa.cor : mudanca.cor,
  }
}

/** A posição de uma etapa nova: depois da última. */
export function proximaPosicao(etapas: readonly EtapaConfigurada[]): number {
  return etapas.reduce((maior, etapa) => Math.max(maior, etapa.posicao + 1), 0)
}
