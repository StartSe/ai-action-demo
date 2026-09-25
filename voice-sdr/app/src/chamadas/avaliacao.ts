/**
 * A avaliação por critério na ficha da chamada (RF-314, RF-414).
 *
 * `calls.evaluation.itens` guarda só a chave de cada critério; o rótulo é de
 * `evaluation_criteria`, que a conta edita. A ordem é a dos critérios da conta
 * (`position`), e o item cuja chave saiu da lista depois da avaliação continua
 * aparecendo, no fim: o que foi avaliado não some porque o critério mudou.
 * Sem linha na conta, o rótulo vem do conjunto mínimo da semente e, na falta
 * dele, da própria chave.
 */

import { CRITERIOS_MINIMOS } from '@compartilhado/qualificacao/avaliacao.ts'

import type { CriterioDaConta, ItemAvaliado } from '@/chamadas/tipos'

export interface LinhaDaAvaliacao {
  chave: string
  rotulo: string
  aprovado: boolean | null
  evidencia: string | null
}

const ROTULOS_DA_SEMENTE: ReadonlyMap<string, string> = new Map(
  CRITERIOS_MINIMOS.map((criterio) => [criterio.key, criterio.rotulo]),
)

export function linhasDaAvaliacao(
  itens: readonly ItemAvaliado[],
  criterios: readonly CriterioDaConta[],
): LinhaDaAvaliacao[] {
  const posicao = new Map(criterios.map((criterio, indice) => [criterio.chave, indice]))
  const rotulo = new Map(criterios.map((criterio) => [criterio.chave, criterio.rotulo]))
  const fora = criterios.length

  return itens
    .map((item, chegada) => ({ item, chegada }))
    .sort(
      (a, b) =>
        (posicao.get(a.item.criterio) ?? fora) - (posicao.get(b.item.criterio) ?? fora) ||
        a.chegada - b.chegada,
    )
    .map(({ item }) => ({
      chave: item.criterio,
      rotulo: rotulo.get(item.criterio) ?? ROTULOS_DA_SEMENTE.get(item.criterio) ?? item.criterio,
      aprovado: item.aprovado,
      evidencia: item.evidencia,
    }))
}
