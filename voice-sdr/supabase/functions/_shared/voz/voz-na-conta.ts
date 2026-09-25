// A voz escolhida precisa estar na conta da ElevenLabs de quem configura.
//
// **VOZ DA BIBLIOTECA NÃO VALE ATÉ SER ADICIONADA.** As vozes de exemplo do
// assistente vêm da biblioteca compartilhada do provedor. Um agente criado com
// uma delas, numa conta que não a adicionou, não fala com ela: o provedor cai
// em outra voz sem avisar. Por isso, antes de criar o agente, a voz é
// conferida na conta e, se faltar, procurada na biblioteca e adicionada.
//
// A procura na biblioteca é pelo nome, que é o que a busca do provedor
// entende, e a escolha é pelo identificador: nome igual de outra voz não conta.
//
// Módulo portável: a rede entra pelo `fetch` injetado, sem Deno.

export const ENDERECO_DA_ELEVENLABS = 'https://api.elevenlabs.io/v1'

const LIMITE_MS = 10_000

export type VozNaConta =
  /** Pronta para o agente. O identificador é o que a conta usa para a voz. */
  | { readonly estado: 'na_conta' | 'adicionada'; readonly vozId: string }
  | { readonly estado: 'fora_da_biblioteca' | 'indisponivel' }

export interface PedidoDeVozNaConta {
  readonly chave: string
  readonly vozId: string
  /** O nome que a pessoa viu. Sem ele, a busca na biblioteca usa o identificador. */
  readonly nome: string | null
}

type Buscar = (endereco: string, opcoes: RequestInit) => Promise<Response>

export async function garantirVozNaConta(
  pedido: PedidoDeVozNaConta,
  buscar: Buscar = fetch,
): Promise<VozNaConta> {
  const cabecalhos = { 'xi-api-key': pedido.chave }
  try {
    const naConta = await buscar(`${ENDERECO_DA_ELEVENLABS}/voices/${encodeURIComponent(pedido.vozId)}`, {
      headers: cabecalhos,
      signal: AbortSignal.timeout(LIMITE_MS),
    })
    if (naConta.ok) return { estado: 'na_conta', vozId: pedido.vozId }
    // 400 e 404 são "esta conta não tem a voz". O resto é o provedor fora do ar.
    if (naConta.status !== 400 && naConta.status !== 404) return { estado: 'indisponivel' }

    const termo = pedido.nome?.trim() || pedido.vozId
    const busca = new URLSearchParams({ search: termo, page_size: '100' })
    const biblioteca = await buscar(`${ENDERECO_DA_ELEVENLABS}/shared-voices?${busca}`, {
      headers: cabecalhos,
      signal: AbortSignal.timeout(LIMITE_MS),
    })
    if (!biblioteca.ok) return { estado: 'indisponivel' }
    const corpo = (await biblioteca.json().catch(() => null)) as {
      voices?: readonly { voice_id?: unknown; public_owner_id?: unknown; name?: unknown }[]
    } | null
    const achada = corpo?.voices?.find((voz) => voz.voice_id === pedido.vozId)
    if (!achada || typeof achada.public_owner_id !== 'string') return { estado: 'fora_da_biblioteca' }

    const nome = typeof achada.name === 'string' && achada.name.trim() ? achada.name : termo
    const adicao = await buscar(
      `${ENDERECO_DA_ELEVENLABS}/voices/add/${encodeURIComponent(achada.public_owner_id)}/${encodeURIComponent(pedido.vozId)}`,
      {
        method: 'POST',
        headers: { ...cabecalhos, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: nome }),
        signal: AbortSignal.timeout(LIMITE_MS),
      },
    )
    if (!adicao.ok) return { estado: 'indisponivel' }
    // A voz adicionada costuma manter o identificador; vale o que o provedor diz.
    const adicionada = (await adicao.json().catch(() => null)) as { voice_id?: unknown } | null
    const vozId = typeof adicionada?.voice_id === 'string' ? adicionada.voice_id : pedido.vozId
    return { estado: 'adicionada', vozId }
  } catch {
    return { estado: 'indisponivel' }
  }
}
