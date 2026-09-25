// Uma pergunta ao modelo, pela porta que a conta escolheu (US-246).
//
// As funções que falam com modelo — `call-review`, `playbook-draft`,
// `call-classify`, `onboarding-suggest` e `onboarding-interview` — fazem a
// mesma coisa: resolvem a porta da conta, montam o
// pedido no formato daquela porta, leem a resposta e devolvem o envelope. A
// terceira cópia é onde a regra sai para `_shared/`.
//
// **AS DUAS PORTAS TÊM FORMATOS DIFERENTES.** A Anthropic recebe `system` e
// `messages` separados e devolve `content[]`; o OpenRouter recebe o sistema
// como primeira mensagem, no formato da OpenAI, e devolve `choices[]`. O que
// este módulo esconde é essa diferença: quem chama entrega sistema, mensagem e
// esquema, e recebe texto.
//
// **O MODELO É SEMPRE O QUE A CONTA CONECTOU.** A instalação não tem chave de
// modelo própria: quem paga e escolhe o modelo é a conta, pelo OpenRouter que
// ela autorizou. A porta `platform`, que é o valor de `model_settings` antes de
// conectar, quer dizer "sem modelo conectado", e a pergunta volta
// `sem_credencial` **sem ir à rede** — cada função traduz isso para a frase que
// manda conectar o modelo. Não há caminho que chame um modelo com chave que
// não seja da conta.
//
// **`length` NÃO É SUCESSO.** Resposta cortada no meio não faz o parse do JSON,
// e chamá-la de `ok` empurraria o erro para o leitor do outro lado.
//
// Módulo portável: sem `Deno`, sem import de rede. `fetch` é global.

import type { EnvelopeDoProvedor } from '../provedor/resposta.ts'

import {
  cabecalhosDaConversa,
  corpoDaConversa,
  lerConversa,
  URL_DA_CONVERSA,
} from './openrouter.ts'
import type { ModeloResolvido } from './resolucao.ts'

/** O que uma pergunta ao modelo devolve, seja qual for a porta. */
export interface RespostaDoModelo extends EnvelopeDoProvedor {
  readonly texto?: string | null
  readonly tokensDeEntrada?: number | null
  readonly tokensDeSaida?: number | null
}

export interface PerguntaAoModelo {
  readonly modelo: string
  readonly sistema: string
  readonly mensagem: string
  readonly esquema: Readonly<Record<string, unknown>>
  /** O teto de saída, em tokens. É o tamanho da resposta, não o da janela. */
  readonly maxTokens: number
}

/** Como a aplicação se identifica no painel de quem paga a conta. */
export interface Aplicacao {
  readonly url?: string | undefined
  readonly nome?: string | undefined
}

export interface PortaDaPergunta {
  /**
   * A chave do OpenRouter desta conta, do cofre. Nula quando a conta ligou a
   * porta e a credencial não está lá — que é conta desconectada pela metade.
   */
  chaveDoOpenRouter(contaId: string): Promise<string | null>
}

/** O endereço da pergunta, no registro de integração. */
const ENDPOINT = 'api/v1/chat/completions'

/**
 * Pergunta ao modelo pela porta resolvida. Nunca levanta: falha de rede e
 * recusa do provedor chegam como `ok: false`.
 */
export async function perguntarAoModelo(
  contaId: string,
  resolvido: ModeloResolvido,
  pergunta: PerguntaAoModelo,
  porta: PortaDaPergunta,
  aplicacao: Aplicacao = {},
  limiteMs = 120_000,
): Promise<RespostaDoModelo> {
  const endpoint = ENDPOINT
  // Conta sem modelo conectado. Não há chave da instalação para cair: ver o
  // cabeçalho.
  if (resolvido.porta !== 'openrouter') {
    return { ok: false, codigo: 'sem_credencial', status: null, endpoint }
  }

  const chave = await porta.chaveDoOpenRouter(contaId)
  // Porta ligada sem chave no cofre é conta desconectada pela metade. Vira
  // `sem_credencial`, que quem chama traduz para a frase de configuração que
  // falta — e não para exceção, que viraria falha interna sem saída.
  if (!chave) return { ok: false, codigo: 'sem_credencial', status: null, endpoint }

  const inicio = Date.now()
  try {
    const resposta = await fetch(URL_DA_CONVERSA, {
      method: 'POST',
      headers: cabecalhosDaConversa(chave, aplicacao),
      body: JSON.stringify(
        corpoDaConversa({
          modelo: pergunta.modelo,
          sistema: pergunta.sistema,
          mensagem: pergunta.mensagem,
          esquema: pergunta.esquema,
          maxTokens: pergunta.maxTokens,
          aplicacao,
        }),
      ),
      signal: AbortSignal.timeout(limiteMs),
    })

    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo que não é JSON vira leitura vazia, e o crivo recusa por ilegível.
    }
    const lida = lerConversa(corpo)

    return {
      // `length` quer dizer resposta cortada no meio: ver o cabeçalho.
      ok: resposta.ok && lida.texto !== null && lida.motivoDoFim !== 'length',
      codigo: lida.motivoDoFim ?? (resposta.ok ? null : String(resposta.status)),
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      endpoint,
      texto: lida.texto,
      tokensDeEntrada: lida.tokensDeEntrada,
      tokensDeSaida: lida.tokensDeSaida,
    }
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint,
    }
  }
}
