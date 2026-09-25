// As decisões puras das ações em lote: o que a seleção contém, quais ações
// estão à mão e como um lote parcialmente recusado é relatado. Nada aqui toca
// React, rede nem Supabase, e é por isso que tudo se prova em `acoes.test.ts`.
//
// Duas regras estruturam o arquivo:
//
// 1. **A seleção é podada pela lista à vista.** Trocar o filtro devolve outras
//    linhas, e um id que saiu da tela não pode continuar selecionado: a barra
//    diria "3 selecionados" com duas linhas marcadas, e a exclusão apagaria um
//    lead que quem clicou não estava vendo.
// 2. **Lote parcial é resultado, não erro.** `resumoDoLote` devolve os três
//    números que somam o pedido — feitos, recusados e o total —, no mesmo
//    desenho do relatório da importação (`leads-import`): desfecho que não
//    fecha a conta esconde linha.

import type { LeadDaLista, ResultadoDoLote } from '@/leads/tipos'

/**
 * As ações que a barra oferece (RF-112).
 *
 * Cadência e campanha **não entram**: `cadences` e `campaigns` são tabelas de
 * fatias seguintes e não existem neste banco. Botão que abre um seletor sem
 * opção ensina o operador a desconfiar da tela inteira; os dois entram junto
 * com as tabelas que os sustentam. A mesma ausência está declarada no
 * cabeçalho de `app/src/copy/leads.ts`.
 */
export type AcaoEmLote =
  | 'bloquear'
  | 'desbloquear'
  | 'exportar'
  | 'excluir'
  | 'mesclar'

/** A ordem em que os botões aparecem. */
export const ACOES_EM_LOTE: readonly AcaoEmLote[] = [
  'bloquear',
  'desbloquear',
  'exportar',
  'excluir',
  'mesclar',
]

/** As que escrevem no banco, e por isso exigem papel operator ou acima. */
export const ACOES_DE_ESCRITA: readonly AcaoEmLote[] = [
  'bloquear',
  'desbloquear',
  'excluir',
  'mesclar',
]

/**
 * Quais ações aparecem para esta seleção.
 *
 * Mesclar só existe com exatamente dois leads marcados: mesclar é escolher
 * quem permanece entre dois, e com três não há pergunta que a tela possa
 * fazer. Sem os dois, o botão não aparece — desabilitado ele seria um convite
 * sem saída.
 */
export function acoesOferecidas(selecionados: number): AcaoEmLote[] {
  return ACOES_EM_LOTE.filter(
    (acao) => acao !== 'mesclar' || selecionados === 2,
  )
}

/**
 * Se a ação pode ser disparada agora.
 *
 * Exportar é o caso fora da regra nos dois sentidos: ela age sobre o **recorte
 * à vista**, e não sobre a seleção — é o recorte que `lead-export` recebe —, e
 * por isso não depende de haver lead marcado. E ela é leitura: a política só
 * cobra `is_member`, então quem acompanha a conta em leitura também exporta.
 */
export function acaoHabilitada(
  acao: AcaoEmLote,
  { selecionados, podeEscrever }: { selecionados: number; podeEscrever: boolean },
): boolean {
  if (acao === 'exportar') return true
  if (!podeEscrever) return false
  if (acao === 'mesclar') return selecionados === 2
  return selecionados > 0
}

/** Marca ou desmarca um lead, sem mexer no resto da seleção. */
export function alternarSelecao(
  selecao: readonly string[],
  id: string,
): string[] {
  return selecao.includes(id)
    ? selecao.filter((selecionado) => selecionado !== id)
    : [...selecao, id]
}

/**
 * A seleção depois de a lista mudar. Id que não está mais à vista sai: a
 * contagem da barra e as linhas marcadas precisam descrever a mesma coisa.
 */
export function podarSelecao(
  selecao: readonly string[],
  visiveis: readonly LeadDaLista[],
): string[] {
  const presentes = new Set(visiveis.map((lead) => lead.id))
  return selecao.filter((id) => presentes.has(id))
}

/** Se tudo o que está à vista está marcado. Lista vazia não conta como tudo. */
export function tudoSelecionado(
  selecao: readonly string[],
  visiveis: readonly LeadDaLista[],
): boolean {
  return visiveis.length > 0 && selecao.length === visiveis.length
}

/**
 * Como a tela identifica um lead que a política recusou. O nome quando há um,
 * e o telefone quando a planilha não trouxe nome — que é o caso de quem entrou
 * por importação e é justamente o mais provável num lote grande.
 */
export function rotuloDoLead(lead: LeadDaLista): string {
  return lead.nome.trim() || lead.telefone
}

/**
 * O relatório de um lote. Os três números fecham a conta do pedido:
 * `feitos + recusados.length === total`.
 */
export interface ResumoDoLote {
  total: number
  feitos: number
  /** Quem a política recusou, já com o rótulo que a tela mostra. */
  recusados: string[]
}

export function resumoDoLote(
  pedidos: readonly LeadDaLista[],
  resultado: ResultadoDoLote,
): ResumoDoLote {
  const feitos = new Set(resultado.feitos)

  return {
    total: pedidos.length,
    feitos: pedidos.filter((lead) => feitos.has(lead.id)).length,
    recusados: pedidos
      .filter((lead) => !feitos.has(lead.id))
      .map(rotuloDoLead),
  }
}

/** Se o lote passou inteiro. É o que decide entre a frase curta e o relatório. */
export function loteInteiro(resumo: ResumoDoLote): boolean {
  return resumo.recusados.length === 0
}
