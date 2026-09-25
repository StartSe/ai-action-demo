// O que a tela do provedor de modelo sabe sem renderizar nada (US-246).
//
// Existe separado do componente porque a regra do projeto é que um arquivo de
// componente exporte só componentes: constante e função compartilhadas moram
// em módulo próprio, senão o recarregamento rápido do Vite para de funcionar
// no arquivo inteiro.

import type { Tarefa } from '@compartilhado/modelo/resolucao.ts'

/**
 * A ordem em que as tarefas aparecem: da que mais muda o produto para a que
 * menos. `review` primeiro porque é a que o dono usa depois de cada ligação;
 * `classify` depois das de redação porque roda sozinha e ninguém lê o
 * resultado dela diretamente. As duas de mídia do WhatsApp fecham a lista: só
 * valem com o canal ligado.
 */
export const TAREFAS_NA_TELA: readonly Tarefa[] = ['review', 'draft', 'classify', 'audio', 'imagem']

/**
 * Onde o navegador guarda a marca da autorização entre a ida e a volta do
 * OAuth (US-246).
 *
 * **Não é o segredo do PKCE.** O `code_verifier` fica no servidor, em
 * `model_auth_states`, e nunca passa pelo navegador — é justamente isso que o
 * PKCE existe para garantir. O que se guarda aqui é só a marca de correlação
 * (`state`), que serve para a volta dizer de qual autorização ela é.
 *
 * Existe porque o provedor documenta `callback_url`, `code_challenge` e
 * `code_challenge_method`, e não documenta `state`: um anúncio dele diz que
 * `state` passou a ser aceito, mas não há garantia de que a volta o traga.
 * Sem esta cópia, uma volta sem `state` deixaria a tela parada sem dizer nada.
 *
 * `sessionStorage` e não `localStorage`: a autorização vale dez minutos e
 * pertence a esta aba. Uma marca que sobrevivesse ao fechamento do navegador
 * seria uma marca velha tentando concluir uma autorização que já venceu.
 */
const CHAVE_DA_MARCA = 'sarah.modelo.autorizacao'

/** Guarda a marca que a URL de autorização carrega. Falha em silêncio. */
export function guardarMarca(urlDeAutorizacao: string): void {
  try {
    const marca = new URL(urlDeAutorizacao).searchParams.get('state')
    if (marca) window.sessionStorage.setItem(CHAVE_DA_MARCA, marca)
  } catch {
    // Navegador sem sessionStorage (aba anônima com armazenamento bloqueado)
    // ainda conclui quando o provedor devolve `state`. Falhar aqui tiraria o
    // caminho que funciona junto com o que não funciona.
  }
}

/** A marca guardada, ou nula. */
export function lerMarcaGuardada(): string | undefined {
  try {
    return window.sessionStorage.getItem(CHAVE_DA_MARCA) ?? undefined
  } catch {
    return undefined
  }
}

/** Esquece a marca depois de concluir: ela vale uma vez. */
export function esquecerMarca(): void {
  try {
    window.sessionStorage.removeItem(CHAVE_DA_MARCA)
  } catch {
    // Ver `guardarMarca`.
  }
}

// O preço do modelo, como o provedor o dá e como a lista o mostra -----------------

/**
 * O provedor cota por **token**, em dólares, e como texto: `"0.000015"`. Um
 * número desses numa lista não diz nada a ninguém — a unidade que se compara
 * entre modelos é o milhão de tokens, que é como o próprio provedor anuncia os
 * preços na página dele.
 *
 * Devolve nulo para o que não é número, para negativo e para o que o provedor
 * não informou. Nulo quer dizer "não sei", e é diferente de zero: zero é
 * grátis, e mostrar "US$ 0,00" para um preço ausente afirmaria o que ninguém
 * disse.
 */
export function precoPorMilhao(valor: string | null): number | null {
  if (valor === null || valor.trim() === '') return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero < 0) return null
  return numero * 1_000_000
}

/** Um preço por milhão, escrito. Zero é "grátis", e não "US$ 0,00". */
export function escreverPreco(porMilhao: number): string {
  if (porMilhao === 0) return 'grátis'
  // Duas casas até dez dólares, nenhuma acima: a diferença entre US$ 0,25 e
  // US$ 0,30 decide uma escolha; a entre US$ 15 e US$ 15,40 não decide nenhuma.
  const casas = porMilhao < 10 ? 2 : 0
  return `US$ ${porMilhao.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}`
}

/**
 * O par entrada/saída de um modelo, para caber numa linha de lista. Nulo
 * quando o provedor não informou nenhum dos dois: um preço solto sem dizer se
 * é de entrada ou de saída confunde mais do que ajuda, e a legenda abaixo do
 * seletor é quem diz a ordem.
 */
export function descreverPreco(
  entrada: string | null,
  saida: string | null,
): string | null {
  const daEntrada = precoPorMilhao(entrada)
  const daSaida = precoPorMilhao(saida)
  if (daEntrada === null && daSaida === null) return null
  if (daEntrada !== null && daSaida === null) return escreverPreco(daEntrada)
  if (daEntrada === null && daSaida !== null) return escreverPreco(daSaida)
  return `${escreverPreco(daEntrada!)} / ${escreverPreco(daSaida!)}`
}
