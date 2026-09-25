// A conta dona da linha viaja no endereço do webhook de voz.
//
// `inbound-twiml` confere a assinatura da telefonia com o token **da conta**,
// que está no cofre dela. Para saber qual token conferir sem consultar o
// número chamado, a função precisa conhecer a conta antes de validar, e o único
// lugar do pedido que a operadora não deixa ninguém mudar sem refazer a
// assinatura é a URL: ela entra inteira no cálculo, com a consulta junto. Por
// isso `phone-register` cadastra o webhook como `.../inbound-twiml?conta=<id>`,
// e quem forjar outra conta no endereço precisa do token dela para assinar.
//
// O identificador não é segredo, e o módulo não o trata como um. Ele só escolhe
// qual segredo vai decidir.
//
// Módulo portável: sem Deno, sem rede. `phone-register` escreve o endereço e
// `inbound-twiml` o lê pelo mesmo par de funções, para as duas pontas não
// divergirem no nome do parâmetro.

/** O nome do parâmetro de consulta com o id da conta. */
export const PARAMETRO_DA_CONTA = 'conta'

/** `accounts.id` é uuid. Qualquer outra coisa não vira leitura de cofre. */
const FORMATO_DA_CONTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** O endereço do atendimento com a conta na consulta. Parâmetro anterior é trocado. */
export function enderecoComConta(base: string, contaId: string): string {
  const endereco = new URL(base)
  endereco.searchParams.set(PARAMETRO_DA_CONTA, contaId)
  return endereco.toString()
}

/**
 * O que o endereço diz sobre a conta.
 *
 * `sem_conta` é o webhook cadastrado antes deste parâmetro existir; `invalida`
 * é valor que não é uuid, ou o parâmetro repetido — duas contas no mesmo
 * endereço não têm leitura honesta, e escolher a primeira abriria a porta para
 * a operadora conferir uma e a função ler outra.
 */
export type ContaDoEndereco =
  | { readonly tipo: 'conta'; readonly contaId: string }
  | { readonly tipo: 'sem_conta' }
  | { readonly tipo: 'invalida' }

export function contaDoEndereco(url: string): ContaDoEndereco {
  let valores: string[]
  try {
    valores = new URL(url).searchParams.getAll(PARAMETRO_DA_CONTA)
  } catch {
    return { tipo: 'invalida' }
  }
  if (valores.length === 0) return { tipo: 'sem_conta' }
  const [valor] = valores
  if (valores.length > 1 || valor === undefined || !FORMATO_DA_CONTA.test(valor)) {
    return { tipo: 'invalida' }
  }
  return { tipo: 'conta', contaId: valor.toLowerCase() }
}
