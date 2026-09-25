// As decisões puras da tela de playbooks (RF-306, RF-307, RF-311). Nada aqui
// toca React, rede nem Supabase.
//
// A regra que dá forma ao arquivo é a separação entre salvar e publicar. O
// rascunho é a versão `draft` mais nova; publicar é promover **esse** rascunho,
// já salvo, e nunca o que está escrito no campo. Por isso a tela só oferece
// publicar quando não há nada por salvar: o que vai ao ar é o que alguém pode
// reler no histórico, e não um texto que existiu só na tela.

import type {
  EstadoDePublicacao,
  PlaybookDoProposito,
  Proposito,
  VersaoDoPlaybook,
} from '@/sarah/tipos'

/**
 * O indicador de publicação tem quatro estados: os três de RF-311 e o de R-06.
 * O quarto não é da US-060 porque não sai do nosso banco: é o provedor dizendo
 * que a configuração dele não é a que publicamos.
 */
export type EstadoDoIndicador = EstadoDePublicacao | 'alterado_fora_da_plataforma'

/**
 * Divergência do lado do provedor vence os três: o hash gravado pode bater com
 * o compilado e, mesmo assim, a Sarah que atende não ser a nossa, porque alguém
 * a editou no painel de lá.
 */
export function estadoDoIndicador(
  publicacao: EstadoDePublicacao,
  foraDaPlataforma: readonly Proposito[],
): EstadoDoIndicador {
  return foraDaPlataforma.length > 0 ? 'alterado_fora_da_plataforma' : publicacao
}

/**
 * O texto das camadas 2 e 3 em conta que nunca escreveu: o `default` de
 * `body_script` e `body_house`. `padroes-da-configuracao.test.ts` compara com a
 * migração.
 */
export const TEXTO_PADRAO_DA_CAMADA = ''

/** O rascunho em edição: a versão mais nova, quando ainda é `draft`. */
export function versaoEmEdicao(playbook: PlaybookDoProposito): VersaoDoPlaybook | null {
  const maisNova = playbook.versoes[0]
  return maisNova?.estado === 'draft' ? maisNova : null
}

/** A versão no ar no banco, ou null quando o propósito nunca publicou. */
export function versaoPublicada(playbook: PlaybookDoProposito): VersaoDoPlaybook | null {
  return playbook.versoes.find((versao) => versao.estado === 'published') ?? null
}

export interface TextoDoPlaybook {
  roteiro: string
  jeitoDaCasa: string
}

/**
 * O que o editor abre mostrando: o rascunho, senão a versão no ar, senão nada.
 * Abrir da versão no ar é o que faz "mudar uma frase" não exigir reescrever o
 * roteiro inteiro depois de cada publicação.
 */
export function textoInicial(playbook: PlaybookDoProposito): TextoDoPlaybook {
  const base = versaoEmEdicao(playbook) ?? versaoPublicada(playbook)
  return { roteiro: base?.roteiro ?? '', jeitoDaCasa: base?.jeitoDaCasa ?? '' }
}

export function textosIguais(um: TextoDoPlaybook, outro: TextoDoPlaybook): boolean {
  return um.roteiro === outro.roteiro && um.jeitoDaCasa === outro.jeitoDaCasa
}

/**
 * O rascunho salvo pode ir ao ar: existe, tem roteiro (o banco recusa publicar
 * camada 2 vazia) e não é igual ao que já está publicado. Publicar a mesma
 * coisa de novo só criaria uma versão que ninguém sabe explicar.
 */
export function rascunhoPublicavel(playbook: PlaybookDoProposito): VersaoDoPlaybook | null {
  const rascunho = versaoEmEdicao(playbook)
  if (!rascunho || rascunho.roteiro.trim() === '') return null

  const noAr = versaoPublicada(playbook)
  if (noAr && textosIguais(rascunho, noAr)) return null
  return rascunho
}

/** Uma linha da comparação entre duas versões. */
export interface LinhaComparada {
  tipo: 'igual' | 'removida' | 'acrescentada'
  texto: string
}

/**
 * A diferença linha a linha entre dois textos, pela maior subsequência comum.
 * Linha é a unidade porque roteiro se escreve em frases por linha, e é a frase
 * que alguém procura quando pergunta o que mudou.
 */
export function compararTextos(antes: string, depois: string): LinhaComparada[] {
  const de = antes === '' ? [] : antes.split('\n')
  const para = depois === '' ? [] : depois.split('\n')

  // comum[i][j]: tamanho da maior subsequência comum de de[i..] e para[j..].
  const comum: number[][] = Array.from({ length: de.length + 1 }, () =>
    new Array<number>(para.length + 1).fill(0),
  )
  for (let i = de.length - 1; i >= 0; i--) {
    for (let j = para.length - 1; j >= 0; j--) {
      const linha = comum[i] as number[]
      linha[j] =
        de[i] === para[j]
          ? (comum[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(comum[i + 1]?.[j] ?? 0, linha[j + 1] ?? 0)
    }
  }

  const linhas: LinhaComparada[] = []
  let i = 0
  let j = 0
  while (i < de.length && j < para.length) {
    if (de[i] === para[j]) {
      linhas.push({ tipo: 'igual', texto: de[i] as string })
      i++
      j++
    } else if ((comum[i + 1]?.[j] ?? 0) >= (comum[i]?.[j + 1] ?? 0)) {
      linhas.push({ tipo: 'removida', texto: de[i] as string })
      i++
    } else {
      linhas.push({ tipo: 'acrescentada', texto: para[j] as string })
      j++
    }
  }
  for (; i < de.length; i++) linhas.push({ tipo: 'removida', texto: de[i] as string })
  for (; j < para.length; j++) linhas.push({ tipo: 'acrescentada', texto: para[j] as string })
  return linhas
}
