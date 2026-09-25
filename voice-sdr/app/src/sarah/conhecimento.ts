// A base de conhecimento, na parte que a tela decide sem renderizar nada
// (US-085, RF-310).
//
// O que a Sarah sabe responder sobre o negócio. Cada entrada é uma pergunta e
// uma resposta; juntas viram documentos no provedor de voz, anexados às quatro
// publicações por `knowledge-sync`.
//
// **O ESTADO DE UMA ENTRADA SAI DAS COLUNAS, E NÃO DE UM CAMPO DE ESTADO.**
// `knowledge_entries` não tem coluna `status`, e é deliberado: um campo assim
// seria uma segunda verdade ao lado de `provider_doc_id`, `indexed_at`,
// `sync_error` e `removed_at`, e as duas divergiriam na primeira falha de
// sincronização. Quem traduz as quatro colunas em uma palavra é esta função.

import { hashDoDocumento, documentoDaEntrada } from '@conhecimento/sincronizacao.ts'

import type { EntradaDeConhecimento } from '@/sarah/tipos'

/** Quantas entradas a tela desenha antes de dizer que truncou. */
export const TETO_DA_LISTA = 200

/**
 * Em que pé está uma entrada.
 *
 * `pendente`   escrita e ainda não enviada ao provedor.
 * `indexada`   no ar: a Sarah já sabe responder isto.
 * `alterada`   indexada, mas o texto mudou depois — a Sarah ainda responde o
 *              antigo, e é por isso que este estado não é `indexada`.
 * `removendo`  marcada para sair, esperando o provedor confirmar.
 * `erro`       a última sincronização falhou, e o motivo está em `sync_error`.
 */
export type EstadoDaEntrada = 'pendente' | 'indexada' | 'alterada' | 'removendo' | 'erro'

/**
 * A ordem das perguntas importa: `removendo` vem antes de tudo porque a
 * entrada que está saindo não é mais nenhuma das outras coisas; `erro` vem
 * antes de `indexada` porque uma entrada pode estar no ar **e** ter falhado na
 * última tentativa de atualizar — e o que a pessoa precisa ver é a falha.
 */
export function estadoDaEntrada(entrada: EntradaDeConhecimento): EstadoDaEntrada {
  if (entrada.removidaEm !== null) return 'removendo'
  if (entrada.erro !== null) return 'erro'
  if (entrada.documento === null || entrada.indexadaEm === null) return 'pendente'
  return entrada.alteradaDepoisDeIndexada ? 'alterada' : 'indexada'
}

/** A entrada tem algo a enviar ao provedor na próxima sincronização. */
export function esperaSincronizacao(entrada: EntradaDeConhecimento): boolean {
  const estado = estadoDaEntrada(entrada)
  return estado === 'pendente' || estado === 'alterada' || estado === 'removendo' || estado === 'erro'
}

/** Quantas entradas da lista esperam sincronização. */
export function quantasEsperam(entradas: readonly EntradaDeConhecimento[]): number {
  return entradas.filter(esperaSincronizacao).length
}

/**
 * O texto de agora difere do que foi indexado?
 *
 * Pelo hash do documento, e nunca por comparação de datas: `updated_at` muda
 * quando alguém troca uma etiqueta, que não vai ao provedor e não desatualiza
 * nada. É o mesmo hash de `knowledge-sync`, importado dele — duas
 * implementações divergiriam e a tela diria "alterada" para sempre.
 */
export async function mudouDesdeAIndexacao(
  entrada: { pergunta: string; resposta: string },
  hashIndexado: string | null,
): Promise<boolean> {
  if (hashIndexado === null) return false
  const documento = documentoDaEntrada({ question: entrada.pergunta, answer: entrada.resposta })
  return (await hashDoDocumento(documento)) !== hashIndexado
}

/** Os limites do que se escreve. Abaixo do mínimo não é pergunta nem resposta. */
export const LIMITES = {
  pergunta: { minimo: 5, maximo: 500 },
  resposta: { minimo: 5, maximo: 4_000 },
} as const

/** A entrada pode ser gravada. */
export function podeGravar(pergunta: string, resposta: string): boolean {
  return (
    pergunta.trim().length >= LIMITES.pergunta.minimo &&
    pergunta.trim().length <= LIMITES.pergunta.maximo &&
    resposta.trim().length >= LIMITES.resposta.minimo &&
    resposta.trim().length <= LIMITES.resposta.maximo
  )
}

/**
 * As etiquetas como a tela as escreve: separadas por vírgula, aparadas, sem
 * repetição e sem vazias. Repetição vira uma só porque a coluna é `text[]` e
 * duas iguais só poluiriam o filtro.
 */
export function lerEtiquetas(texto: string): string[] {
  const vistas = new Set<string>()
  for (const bruta of texto.split(',')) {
    const etiqueta = bruta.trim().toLowerCase()
    if (etiqueta !== '') vistas.add(etiqueta)
  }
  return [...vistas]
}

/** O caminho inverso: as etiquetas gravadas, para o campo de edição. */
export function escreverEtiquetas(etiquetas: readonly string[]): string {
  return etiquetas.join(', ')
}
