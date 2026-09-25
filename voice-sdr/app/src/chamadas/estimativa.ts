/**
 * A estimativa de custo antes de ligar (D-14).
 *
 * Quem calcula é o banco (`estimativa_de_custo`), sobre as últimas ligações
 * atendidas da conta com preço. Aqui só se lê a resposta, conferindo cada
 * campo, e se monta o que a tela mostra. Nenhum preço de tabela de provedor
 * entra: sem ligação medida, a tela diz que a estimativa vem depois da
 * primeira, e não inventa número.
 */

import { formatarValor } from '@/chamadas/ficha'
import type { EstimativaDeCusto, ValorEstimado } from '@/chamadas/tipos'

function inteiroOuNulo(valor: unknown): number | null {
  const numero = typeof valor === 'string' ? Number(valor) : valor
  return typeof numero === 'number' && Number.isFinite(numero) ? Math.round(numero) : null
}

function lerValores(bruto: unknown): ValorEstimado[] {
  if (!Array.isArray(bruto)) return []
  return bruto.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const { moeda, centavos } = item as Record<string, unknown>
    const lidos = inteiroOuNulo(centavos)
    if (typeof moeda !== 'string' || !/^[A-Z]{3}$/.test(moeda) || lidos === null) return []
    return [{ moeda, centavos: lidos }]
  })
}

/** A resposta de `estimativa_de_custo`, conferida. Forma torta vira sem amostra. */
export function lerEstimativa(bruto: unknown): EstimativaDeCusto {
  const objeto =
    typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {}
  const ligacoesMedidas = Math.max(0, inteiroOuNulo(objeto.ligacoes_medidas) ?? 0)
  const porLigacao = lerValores(objeto.por_ligacao)
  const porMinuto = lerValores(objeto.por_minuto)
  if (ligacoesMedidas === 0 || porLigacao.length === 0) {
    return { ligacoesMedidas: 0, duracaoMediaSeg: null, porLigacao: [], porMinuto: [] }
  }
  return {
    ligacoesMedidas,
    duracaoMediaSeg: inteiroOuNulo(objeto.duracao_media_seg),
    porLigacao,
    porMinuto,
  }
}

/** Os valores lado a lado, cada um na moeda dele: `R$ 0,30 + US$ 0,23`. */
export function juntarValores(valores: readonly ValorEstimado[]): string {
  return valores.map((valor) => formatarValor(valor)).join(' + ')
}

/** Minutos e segundos por extenso curto: `1 min 30 s`, `45 s`. */
export function duracaoPorExtenso(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  if (minutos === 0) return `${resto} s`
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`
}
