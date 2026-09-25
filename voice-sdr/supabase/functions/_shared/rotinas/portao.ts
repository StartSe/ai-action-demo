// O portão das rotinas agendadas: o cabeçalho `x-internal-secret` (T-04, T-26).
//
// `disparar_rotina` chama a função pelo pg_net sem `Authorization`, só com o
// segredo interno lido do Vault. Por isso toda rotina tem `verify_jwt = false`
// e confere o segredo antes de qualquer leitura: sem o portão, qualquer um que
// soubesse o endereço acordaria a rotina — e acordar `cron-dial` é discar.
//
// **Variável ausente fecha, nunca abre.** Instalação sem
// `SARAH_INTERNAL_SECRET` não roda rotina nenhuma; o contrário faria o pedido
// com cabeçalho vazio passar.
//
// Os dois lados passam por sha-256 antes da comparação em tempo constante,
// como em `call-place`: comparar os hashes tira o comprimento do segredo da
// conversa.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { hashEmHexadecimal, hashesIguais } from '../hash-de-segredo.ts'

/** O cabeçalho que `disparar_rotina` manda. */
export const CABECALHO_DA_ROTINA = 'x-internal-secret'

export async function segredoDaRotinaConfere(
  recebido: string | null | undefined,
  esperado: string | null | undefined,
): Promise<boolean> {
  const dado = recebido?.trim() ?? ''
  const referencia = esperado?.trim() ?? ''
  if (dado === '' || referencia === '') return false
  const [a, b] = await Promise.all([hashEmHexadecimal(dado), hashEmHexadecimal(referencia)])
  return hashesIguais(a, b)
}
