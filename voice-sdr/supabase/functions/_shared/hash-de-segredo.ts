// O par segredo/hash, uma vez só.
//
// Dois segredos deste produto seguem a mesma receita: o valor em claro nasce
// onde alguém o vai usar (o link do convite, o endereço público de entrada) e
// o banco guarda apenas `sha256(valor)` em hexadecimal, numa coluna com
// `check (col ~ '^[0-9a-f]{64}$')`. Vazamento da tabela não devolve segredo
// utilizável, e a busca continua sendo por igualdade exata.
//
// Este módulo é a receita; `token-de-convite.ts` e `chave-de-entrada.ts` são os
// dois nomes que ela tem no produto. Uma implementação só porque duas cópias de
// um hash se desencontram no primeiro ajuste, e um hash desencontrado
// transforma todo segredo já emitido em valor morto.
//
// Sem dependência de plataforma: `crypto.subtle` é padrão de Web Crypto e
// existe tanto no Deno das funções de borda quanto no Node dos testes.

const HASH_HEXADECIMAL = /^[0-9a-f]{64}$/

/**
 * Segredo novo, em base64url para caber numa URL sem escape. 32 bytes de
 * entropia viram 43 caracteres.
 */
export function gerarSegredoParaUrl(bytesDeEntropia = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(bytesDeEntropia))
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** sha-256 do segredo, em hexadecimal minúsculo. É o que a coluna guarda. */
export async function hashEmHexadecimal(segredo: string): Promise<string> {
  const bytes = new TextEncoder().encode(segredo.trim())
  const resumo = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(resumo)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Verdadeiro para o formato que as colunas de hash aceitam. */
export function pareceHashEmHexadecimal(valor: string): boolean {
  return HASH_HEXADECIMAL.test(valor)
}

/**
 * Dois hashes são iguais, comparados em tempo que não depende de onde eles
 * passam a divergir.
 *
 * `a === b` compara caracteres até achar o primeiro diferente e volta. A
 * diferença de tempo entre "divergiu no primeiro" e "divergiu no último" é
 * pequena e ruidosa, mas é real e é mensurável com repetição suficiente — e
 * quem a mede consegue descobrir o hash guardado um caractere por vez, sem
 * nunca acertar a chave. O laço abaixo acumula o xor de todos os caracteres e
 * só decide no fim.
 *
 * O comprimento continua vazando pelo `return` de cima, e isso é de propósito:
 * os dois valores são hashes de 64 caracteres, então o comprimento não é
 * segredo de ninguém. Comparar um hash com um valor de outro tamanho é bug de
 * quem chamou, e sair rápido dele é melhor do que fingir que não é.
 *
 * **A propriedade é estrutural, não é testada.** Nenhuma asserção de tempo
 * sobrevive a um CI compartilhado, e a que sobreviveria passaria igual com
 * `a === b` no lugar deste laço — está escrito no teste por quê. O que segura
 * a regra é a leitura: `return` dentro do laço a derruba.
 */
export function hashesIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  let diferenca = 0
  for (let posicao = 0; posicao < a.length; posicao += 1) {
    diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao)
  }
  return diferenca === 0
}
