// Uma mensagem de texto pela instância Z-API da conta.
//
// As três bordas que escrevem no WhatsApp (whatsapp-inbound, whatsapp-send e o
// pré-contato de cron-dial) passam por aqui: o pedido sai de `zapi.ts`, o
// `fetch` entra por parâmetro, e a volta é o envelope de sempre, que nunca
// levanta. O código da Z-API viaja em `codigo` para `erros.ts` traduzir e não
// sai no corpo de resposta nenhuma.
//
// Módulo portável: sem Deno. A rede é o `buscar` de quem chama.

import { lerCodigoDoErro, lerIdDoEnvio, pedidoDeEnvioDeTexto, type CredenciaisDaZapi, type EnvioDaZapi } from './zapi.ts'

export type Buscar = (url: string, init: RequestInit) => Promise<Response>

/** O WhatsApp tem estes segundos para aceitar a mensagem. */
export const LIMITE_DO_ENVIO_MS = 10_000

export async function enviarTexto(
  credenciais: CredenciaisDaZapi,
  telefone: string,
  texto: string,
  buscar: Buscar,
): Promise<EnvioDaZapi> {
  const pedido = pedidoDeEnvioDeTexto(credenciais, telefone, texto)
  const inicio = Date.now()
  try {
    const resposta = await buscar(pedido.url, pedido.init)
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo ilegível: o status decide.
    }
    const idDoProvedor = lerIdDoEnvio(corpo)
    const ok = resposta.ok && idDoProvedor !== null
    return {
      ok,
      codigo: ok ? null : (lerCodigoDoErro(corpo) ?? String(resposta.status)),
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      endpoint: pedido.endpoint,
      idDoProvedor,
    }
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint: pedido.endpoint,
      idDoProvedor: null,
    }
  }
}
