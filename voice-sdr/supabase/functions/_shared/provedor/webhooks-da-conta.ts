// Os dois webhooks do provedor de voz, cadastrados por conta.
//
// `agent-publish` cadastra na ElevenLabs da conta dois endereços nossos:
// `call-init` (início da conversa) e `call-events` (fim). Os dois levam
// `?conta=<account_id>`, porque a configuração deles é do **workspace** do
// provedor, um por chave, e é a conta que escolhe com qual segredo o pedido se
// confere. O parâmetro **não autentica nada sozinho**: sem o segredo certo da
// conta indicada, a recusa é o mesmo 401 de sempre, e conta inexistente cai na
// mesma recusa que segredo errado.
//
// **Por que dois segredos de natureza diferente.**
//
// - O fim é assinado pelo provedor por HMAC (`elevenlabs-signature`, receita
//   de `assinatura-de-webhook.ts`), e o segredo é **dele**: a ElevenLabs o
//   sorteia ao criar o webhook e o devolve uma vez. Não há como derivá-lo, então
//   ele é guardado no cofre da conta (`voz` / `webhook_secret`), com o
//   identificador do webhook no metadado.
// - O início **não é assinado**. A única credencial que o provedor manda é um
//   cabeçalho que nós escrevemos na configuração (`request_headers`). Aí o
//   segredo é nosso, e segue a receita de `segredo-de-ferramenta.ts`: HMAC da
//   chave do servidor, sem linha nova e sem leitura de banco para conferir. O
//   texto derivado leva um prefixo próprio (`inicio:`) para não ser o mesmo
//   `x-tool-secret` da conta — um segredo que vaze de um lugar não abre o outro.
//
// O nome do cabeçalho tem `secret`, e é de propósito: o gatilho de redação de
// `integration_events` casa pelo nome da chave, e a configuração enviada ao
// provedor passa por lá.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { conferirSegredo, derivarSegredo, type ChavesDoServidor } from '../tools/segredo.ts'

/** O parâmetro do endereço que escolhe a conta. */
export const PARAMETRO_DA_CONTA = 'conta'

/** O cabeçalho em que o provedor manda, no início da conversa, o segredo da conta. */
export const CABECALHO_DO_SEGREDO_DO_INICIO = 'x-sarah-webhook-secret'

/** O provedor e a chave do segredo do webhook de fim, no cofre da conta. */
export const PROVEDOR_DO_WEBHOOK = 'voz'
export const CHAVE_DO_SEGREDO_DO_FIM = 'webhook_secret'

/** As duas funções que recebem os webhooks. */
export const FUNCAO_DO_INICIO = 'call-init'
export const FUNCAO_DO_FIM = 'call-events'

const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** O texto que a derivação assina: o prefixo separa este segredo do `x-tool-secret`. */
function textoDoInicio(contaId: string): string {
  return `inicio:${contaId}`
}

/**
 * O segredo que o provedor manda em `x-sarah-webhook-secret` para a conta, em
 * hexadecimal de 64 caracteres. Levanta com chave ou conta vazias, pela razão
 * de `derivarSegredoDeFerramenta`.
 */
export function derivarSegredoDoInicio(chaveDoServidor: string, contaId: string): Promise<string> {
  const conta = contaId.trim()
  if (conta === '') throw new Error('conta ausente')
  return derivarSegredo(chaveDoServidor, textoDoInicio(conta))
}

/**
 * Confere o cabeçalho do início contra a conta indicada. É `conferirSegredo`
 * por baixo — tempo constante e chave anterior por 24 h durante a rotação —,
 * com uma candidata só: a conta do endereço.
 */
export async function segredoDoInicioConfere(pedido: {
  readonly cabecalho: string | null | undefined
  readonly contaId: string
  readonly chaves: ChavesDoServidor
  readonly agora?: () => number
}): Promise<boolean> {
  if (pedido.chaves.vigente.trim() === '') return false
  const conferencia = await conferirSegredo({
    cabecalho: pedido.cabecalho,
    chaves: pedido.chaves,
    contas: [textoDoInicio(pedido.contaId)],
    agora: pedido.agora,
  })
  return conferencia.ok
}

/**
 * A conta do endereço, ou nulo quando ela falta ou não tem forma de uuid.
 * Forma errada morre aqui, antes de virar consulta: é a mesma recusa de conta
 * que não existe.
 */
export function contaDoEndereco(endereco: string): string | null {
  let valor: string | null
  try {
    valor = new URL(endereco).searchParams.get(PARAMETRO_DA_CONTA)
  } catch {
    return null
  }
  const conta = valor?.trim().toLowerCase() ?? ''
  return FORMATO_DE_UUID.test(conta) ? conta : null
}

/** O endereço de um dos dois webhooks para a conta. `base` é o de `/functions/v1`. */
export function enderecoDoWebhook(
  base: string,
  funcao: typeof FUNCAO_DO_INICIO | typeof FUNCAO_DO_FIM,
  contaId: string,
): string {
  const raiz = base.replace(/\/+$/, '')
  return `${raiz}/${funcao}?${PARAMETRO_DA_CONTA}=${encodeURIComponent(contaId)}`
}
