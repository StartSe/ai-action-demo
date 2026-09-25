// Token do link de convite: o que viaja no e-mail e o que fica no banco.
//
// O banco guarda `sha256(token)` em hexadecimal, nunca o token. Quem cria o
// convite gera o par aqui; quem aceita recalcula o hash a partir do que veio
// no link e busca por igualdade. Vazamento da tabela não devolve link usável.
//
// A receita do par mora em `hash-de-segredo.ts`, compartilhada com a chave do
// endereço público de entrada. Aqui fica só o nome que ela tem no convite.

import {
  gerarSegredoParaUrl,
  hashEmHexadecimal,
  pareceHashEmHexadecimal,
} from './hash-de-segredo.ts'

/** Bytes de entropia do token. 32 bytes viram 43 caracteres em base64url. */
const BYTES_DE_ENTROPIA = 32

/**
 * Token novo, em base64url para caber numa URL sem escape. É a única vez que
 * o valor existe em claro: depois dele, só o hash.
 */
export function gerarTokenDeConvite(): string {
  return gerarSegredoParaUrl(BYTES_DE_ENTROPIA)
}

/** sha-256 do token, em hexadecimal minúsculo. É o que a coluna guarda. */
export function hashDeToken(token: string): Promise<string> {
  return hashEmHexadecimal(token)
}

/** Verdadeiro para o formato que a coluna token_hash aceita. */
export function pareceHashDeToken(valor: string): boolean {
  return pareceHashEmHexadecimal(valor)
}
