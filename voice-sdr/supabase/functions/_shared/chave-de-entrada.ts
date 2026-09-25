// Chave do endereço público de entrada de leads.
//
// Cada conta tem um endereço próprio para receber lead de fora (formulário do
// site, integração de terceiro). O que autentica quem chega ali é esta chave, e
// ela é um segredo de portador: quem a tiver, escreve na conta. Por isso o
// banco guarda só `sha256(chave)` em `accounts.intake_key_hash`, do mesmo jeito
// que `invitations.token_hash` — a chave resolve a conta numa consulta por
// igualdade, e vazamento da tabela não devolve chave utilizável.
//
// A chave em claro existe uma vez: no navegador de quem a gira, para ser
// copiada. Nem o RPC de rotação nem a borda a devolvem depois.
//
// Portável de propósito: sem `Deno` e sem import de rede, para a interface o
// importar por `@compartilhado/` e calcular exatamente o mesmo hash que a borda
// recalcula quando um lead chega.

import {
  gerarSegredoParaUrl,
  hashEmHexadecimal,
  hashesIguais,
  pareceHashEmHexadecimal,
} from './hash-de-segredo.ts'

/**
 * Bytes de entropia da chave. 32 bytes viram 43 caracteres em base64url — a
 * mesma medida do token de convite, e pela mesma razão: a chave viaja em URL e
 * em cabeçalho, e adivinhá-la tem que ser impossível, não difícil.
 */
const BYTES_DE_ENTROPIA = 32

/**
 * Chave nova, em base64url para caber numa URL sem escape. É a única vez que o
 * valor existe em claro: o que sai daqui vai para a tela e para o hash, nunca
 * para o banco.
 */
export function gerarChaveDeEntrada(): string {
  return gerarSegredoParaUrl(BYTES_DE_ENTROPIA)
}

/** sha-256 da chave, em hexadecimal minúsculo. É o que a coluna guarda. */
export function hashDaChaveDeEntrada(chave: string): Promise<string> {
  return hashEmHexadecimal(chave)
}

/** Verdadeiro para o formato que a coluna intake_key_hash aceita. */
export function pareceHashDaChaveDeEntrada(valor: string): boolean {
  return pareceHashEmHexadecimal(valor)
}

/**
 * Os dois hashes são da mesma chave, em tempo constante.
 *
 * A consulta ao banco resolve a conta por igualdade no índice; esta função é a
 * conferência final da borda, e existe por duas razões. A primeira é o tempo:
 * a comparação não diz, pelo que demora, quanto do hash bateu. A segunda é a
 * forma da consulta — uma porta de dados que um dia trocasse a igualdade por
 * `like` ou por `ilike` passaria a resolver conta com prefixo de chave, e é
 * aqui que isso morre.
 */
export function chaveConfereComOHash(hashDaChave: string, hashGuardado: string): boolean {
  return hashesIguais(hashDaChave, hashGuardado)
}
