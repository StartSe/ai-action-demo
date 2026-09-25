// O endereço do webhook da Z-API, que é também a credencial dele.
//
// A Z-API não assina o webhook e não deixa cadastrar cabeçalho próprio
// (suposição Z4 de `zapi.ts`). O que sobra para autenticar é o endereço:
// `whatsapp-inbound?conta=<account_id>&chave=<segredo>`, em que o segredo é
// `HMAC(chave_do_servidor, 'whatsapp:' + conta)`, pela receita de
// `segredo-de-ferramenta.ts` (a mesma de `x-tool-secret` e do segredo do
// início da voz). O prefixo `whatsapp:` separa este segredo dos outros dois da
// conta: um que vaze não abre os demais.
//
// A chave do servidor é `SARAH_TOOL_SERVER_KEY`, resolvida por
// `segredo-da-instalacao.ts`. Rodar a chave muda o endereço de todas as contas:
// a chave anterior confere por 24 h (R-07) e, nesse prazo, `whatsapp-connect`
// precisa ser chamado de novo para cadastrar o endereço novo.
//
// **Tudo errado é a mesma recusa.** Conta ausente, conta malformada, chave
// ausente, chave malformada e chave de outra conta saem pelo mesmo `null`, e a
// borda responde o mesmo 401 antes de tocar no banco.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { conferirSegredo, derivarSegredo, type ChavesDoServidor } from '../tools/segredo.ts'

export const FUNCAO_DE_ENTRADA = 'whatsapp-inbound'
export const PARAMETRO_DA_CONTA = 'conta'
export const PARAMETRO_DA_CHAVE = 'chave'

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function textoDaConta(contaId: string): string {
  return `whatsapp:${contaId}`
}

/** O segredo da conta no endereço, em hexadecimal de 64 caracteres. */
export function derivarChaveDoWhatsapp(chaveDoServidor: string, contaId: string): Promise<string> {
  const conta = contaId.trim().toLowerCase()
  if (conta === '') throw new Error('conta ausente')
  return derivarSegredo(chaveDoServidor, textoDaConta(conta))
}

/** O endereço que `whatsapp-connect` cadastra na Z-API. `base` é o de `/functions/v1`. */
export async function enderecoDoWebhookDoWhatsapp(
  base: string,
  chaveDoServidor: string,
  contaId: string,
): Promise<string> {
  const raiz = base.replace(/\/+$/, '')
  const conta = contaId.trim().toLowerCase()
  const chave = await derivarChaveDoWhatsapp(chaveDoServidor, conta)
  return `${raiz}/${FUNCAO_DE_ENTRADA}?${PARAMETRO_DA_CONTA}=${encodeURIComponent(conta)}&${PARAMETRO_DA_CHAVE}=${chave}`
}

/**
 * A conta que o endereço prova, ou nulo. Compara em tempo constante e aceita
 * a chave anterior por 24 h durante a rotação. Com a chave do servidor vazia,
 * nada confere: instalação sem a chave fecha o webhook em vez de abri-lo.
 */
export async function contaDoEnderecoDoWhatsapp(
  endereco: string,
  chaves: ChavesDoServidor,
  agora?: () => number,
): Promise<string | null> {
  if (chaves.vigente.trim() === '') return null
  let conta: string
  let chave: string
  try {
    const url = new URL(endereco)
    conta = (url.searchParams.get(PARAMETRO_DA_CONTA) ?? '').trim().toLowerCase()
    chave = (url.searchParams.get(PARAMETRO_DA_CHAVE) ?? '').trim()
  } catch {
    return null
  }
  if (!FORMATO_DE_UUID.test(conta)) return null

  const conferencia = await conferirSegredo({
    cabecalho: chave,
    chaves,
    contas: [textoDaConta(conta)],
    agora,
  })
  return conferencia.ok ? conta : null
}
