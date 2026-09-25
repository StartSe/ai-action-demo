// call-events: o webhook de fim de chamada (T-15, R-05, R-07, RNF-16).
//
// O provedor de voz avisa que a conversa terminou, e este webhook faz três
// coisas, nesta ordem: confere que o aviso é mesmo do provedor, descobre de
// qual chamada ele fala e **aciona** `call-finalize`. Só isso.
//
// **NUNCA FINALIZA ELE MESMO** (T-15). A finalização é canônica e tem dono:
// `call-finalize` é a única que escreve o desfecho de uma chamada, e é
// acionada por dois caminhos — este aviso e a varredura de recuperação. Se este
// webhook escrevesse transcrição, duração ou classificação, seriam duas fontes
// de desfecho, e a que rodasse por último apagaria a outra.
//
// **A IDEMPOTÊNCIA NÃO É VERIFICADA AQUI, E ISSO É A CORREÇÃO.** O provedor
// reenvia aviso, e dois avisos do mesmo evento chegam aqui como dois pedidos
// iguais. Os dois acionam a finalização, e quem garante que só um finaliza é a
// reivindicação atômica de `call-finalize` (`update ... where
// finalize_started_at is null ... returning id`, US-069). Conferir aqui se a
// chamada "já foi finalizada" antes de acionar seria verificação seguida de
// ação — o defeito exato de T-15: dois avisos no mesmo segundo leem "ainda não"
// juntos e acionam juntos. A porta desta função nem tem como perguntar isso, e
// o teste prova que o segundo aviso faz exatamente o que o primeiro fez.
//
// **CONVERSA DESCONHECIDA DEVOLVE 200, E NÃO 404.** O provedor reenvia o que
// não recebeu 2xx. Um aviso de conversa que não é desta instalação (agente
// apontado para o endereço errado, conversa de ensaio de outro ambiente) nunca
// vai passar a existir, e um 404 viraria um laço de reenvio eterno. A resposta
// é 200 e o aviso fica registrado — no log da função, porque
// `integration_events.account_id` não aceita nulo e aviso sem chamada não tem
// conta a quem pertencer.
//
// **A ASSINATURA VEM ANTES DE TUDO**, como em `call-init`: ausente, malformada,
// fora da janela e inválida saem pelo mesmo 401, e nenhuma toca no banco.
// Durante a rotação do segredo (R-07), o anterior confere por 24 h contadas do
// carimbo da rotação; a regra mora em `_shared/provedor/assinatura-de-webhook.ts`.
//
// **O SEGREDO DA CONTA, QUANDO O ENDEREÇO A INDICA.** `agent-publish` cadastra
// o webhook no workspace da ElevenLabs de cada conta com `?conta=<id>`, e o
// segredo HMAC é o que a ElevenLabs devolveu no cadastro, guardado no cofre da
// conta. É a única leitura antes da conferência, e só acontece depois de o
// cabeçalho ter a forma da receita; conta sem segredo e conta inexistente caem
// no mesmo 401 do segredo errado. Conferido o da conta, o aviso só aciona
// chamada dela. O segredo da instalação continua valendo como alternativa.
//
// **O RASTRO É DE TODO AVISO QUE ACHOU CHAMADA**, com `correlation_id` igual ao
// `call_id` (RNF-16): é o que põe o aviso de fim na mesma cadeia do disparo de
// `call-place`. Falha ao gravar o rastro não derruba o aviso — o rastro é
// observabilidade, e perder a finalização por causa dele seria trocar o
// importante pelo acessório.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o
// acionamento entram por `PortaDoAviso`, implementada em `index.ts` e dublada
// no teste.

import {
  conferirAssinaturaDoProvedor,
  lerAssinaturaDoProvedor,
} from '../_shared/provedor/assinatura-de-webhook.ts'

import { lerAvisoDoProvedor, type AvisoDoProvedor } from './formato-do-provedor.ts'
import { MENSAGENS, STATUS, type MotivoDoFim } from './respostas.ts'

/** O provedor no rastro, com o nome curto que `call-place` também usa. */
export const PROVEDOR_DO_AVISO = 'voz'

/** O caminho no rastro: é o nosso endereço que foi chamado, e não o do provedor. */
export const ENDPOINT_DO_AVISO = 'call-events'

/** A chamada de que o aviso fala, no que esta função precisa dela. */
export interface ChamadaDoAviso {
  readonly id: string
  readonly account_id: string
}

/** Uma linha de `integration_events`, com as chaves da tabela. */
export interface EventoDeIntegracao {
  readonly account_id: string
  readonly direction: 'inbound'
  readonly provider: string
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number
  readonly latency_ms: null
  /** O identificador da chamada (RNF-16). */
  readonly correlation_id: string
}

/** O aviso que não achou chamada, para o log. */
export interface AvisoSemChamada {
  readonly tipo: string | null
  readonly conversaId: string | null
  readonly chamadaDaTelefoniaId: string | null
}

/**
 * A camada de dados e o acionamento. Não há método que pergunte se a chamada
 * já foi finalizada, e a ausência é o contrato: ver o cabeçalho.
 */
export interface PortaDoAviso {
  /**
   * O segredo HMAC do webhook de fim da conta, que a ElevenLabs devolveu quando
   * `agent-publish` o cadastrou (cofre, `voz` / `webhook_secret`). Nulo quando a
   * conta não tem, ou não existe. É a única leitura antes da conferência.
   */
  segredoDoWebhookDaConta(contaId: string): Promise<string | null>
  chamadaPelaConversa(conversaId: string): Promise<ChamadaDoAviso | null>
  chamadaPelaTelefonia(chamadaDaTelefoniaId: string): Promise<ChamadaDoAviso | null>
  /** Chama `call-finalize` com o segredo interno. Levanta quando ela não atendeu. */
  acionarFinalizacao(chamadaId: string): Promise<void>
  registrarEventoDeIntegracao(evento: EventoDeIntegracao): Promise<void>
  registrarAvisoSemChamada(aviso: AvisoSemChamada): Promise<void>
}

export interface AvisoRecebido {
  readonly ok: true
  /** Nulo quando o aviso não achou chamada nesta instalação. */
  readonly chamadaId: string | null
  readonly desfecho: 'finalizacao_acionada' | 'conversa_desconhecida'
}

export interface RecusaDoFim {
  readonly ok: false
  readonly motivo: MotivoDoFim
  readonly mensagem: string
}

export interface RespostaDoFim {
  readonly status: number
  readonly corpo: AvisoRecebido | RecusaDoFim
}

export interface PedidoDaBorda {
  readonly metodo: string
  /** O corpo cru, byte a byte como chegou. É ele que a assinatura cobre. */
  readonly corpo: string
  readonly assinatura: string | null
  /**
   * A conta de `?conta=`, já conferida quanto à forma
   * (`_shared/provedor/webhooks-da-conta.ts`). Só escolhe o segredo a conferir.
   */
  readonly contaDoEndereco?: string | null
}

export interface OpcoesDoFim {
  /** Ausente recusa todo pedido, pela razão de `call-init`. */
  readonly segredoDoWebhook: string | null
  /** O segredo de antes da rotação, quando há uma em curso (R-07). */
  readonly segredoAnterior: string | null
  /** O carimbo da rotação, em segundos. Nulo desliga o segredo anterior. */
  readonly rotacionadoEmSegundos: number | null
  readonly agoraEmSegundos: number
}

/** Recebe o aviso. Nunca levanta: exceção da porta vira 503, e o provedor reenvia. */
export async function receberAviso(
  pedido: PedidoDaBorda,
  porta: PortaDoAviso,
  opcoes: OpcoesDoFim,
): Promise<RespostaDoFim> {
  if (pedido.metodo.toUpperCase() !== 'POST') return recusa('metodo_invalido')

  // Antes do corpo, antes de tudo. Cabeçalho que nem tem a forma da receita
  // morre aqui, sem leitura nenhuma.
  if (!lerAssinaturaDoProvedor(pedido.assinatura)) return recusa('assinatura_invalida')

  let contaProvada: string | null = null
  let cofreFalhou = false
  const conta = pedido.contaDoEndereco ?? null
  if (conta) {
    let segredoDaConta: string | null = null
    try {
      segredoDaConta = await porta.segredoDoWebhookDaConta(conta)
    } catch {
      cofreFalhou = true
    }
    const daConta = await conferirAssinaturaDoProvedor({
      segredo: segredoDaConta,
      corpo: pedido.corpo,
      assinatura: pedido.assinatura,
      agoraEmSegundos: opcoes.agoraEmSegundos,
    })
    if (daConta) contaProvada = conta
  }

  if (contaProvada === null) {
    const daInstalacao = await conferirAssinaturaDoProvedor({
      segredo: opcoes.segredoDoWebhook,
      segredoAnterior: opcoes.segredoAnterior,
      rotacionadoEmSegundos: opcoes.rotacionadoEmSegundos,
      corpo: pedido.corpo,
      assinatura: pedido.assinatura,
      agoraEmSegundos: opcoes.agoraEmSegundos,
    })
    // Cofre fora do ar é falha nossa, e o provedor precisa reenviar: um 401
    // aqui perderia o aviso de uma ligação que aconteceu.
    if (!daInstalacao) return recusa(cofreFalhou ? 'falha_interna' : 'assinatura_invalida')
  }

  let corpo: unknown
  try {
    corpo = JSON.parse(pedido.corpo)
  } catch {
    return recusa('corpo_invalido')
  }

  const aviso = lerAvisoDoProvedor(corpo)
  if (!aviso) return recusa('corpo_invalido')

  let chamada: ChamadaDoAviso | null
  try {
    chamada = await resolverChamada(aviso, porta)
  } catch {
    return recusa('falha_interna')
  }
  // O segredo de uma conta só aciona a finalização das chamadas dela. A de
  // outra conta sai como a desconhecida: 200, e nenhum acionamento.
  if (chamada && contaProvada !== null && chamada.account_id !== contaProvada) chamada = null

  if (!chamada) {
    try {
      await porta.registrarAvisoSemChamada({
        tipo: aviso.tipo,
        conversaId: aviso.conversaId,
        chamadaDaTelefoniaId: aviso.chamadaDaTelefoniaId,
      })
    } catch {
      // O registro é do log; sem ele o 200 continua certo.
    }
    return { status: 200, corpo: { ok: true, chamadaId: null, desfecho: 'conversa_desconhecida' } }
  }

  let acionada = true
  try {
    await porta.acionarFinalizacao(chamada.id)
  } catch {
    acionada = false
  }

  const resposta: RespostaDoFim = acionada
    ? { status: 200, corpo: { ok: true, chamadaId: chamada.id, desfecho: 'finalizacao_acionada' } }
    : recusa('finalizacao_indisponivel')

  await registrarRastro(chamada, aviso, resposta, porta)
  return resposta
}

/**
 * A chamada pela conversa, e pela chamada da telefonia quando a conversa não
 * achou. A conversa vem primeiro porque é o identificador que as sete
 * ferramentas também usam; o `call_sid` cobre a saída em que o provedor
 * respondeu o disparo sem conversa e `call-init` não chegou a preenchê-la.
 */
async function resolverChamada(
  aviso: AvisoDoProvedor,
  porta: PortaDoAviso,
): Promise<ChamadaDoAviso | null> {
  if (aviso.conversaId) {
    const pelaConversa = await porta.chamadaPelaConversa(aviso.conversaId)
    if (pelaConversa) return pelaConversa
  }
  if (aviso.chamadaDaTelefoniaId) {
    return await porta.chamadaPelaTelefonia(aviso.chamadaDaTelefoniaId)
  }
  return null
}

async function registrarRastro(
  chamada: ChamadaDoAviso,
  aviso: AvisoDoProvedor,
  resposta: RespostaDoFim,
  porta: PortaDoAviso,
): Promise<void> {
  try {
    await porta.registrarEventoDeIntegracao({
      account_id: chamada.account_id,
      direction: 'inbound',
      provider: PROVEDOR_DO_AVISO,
      endpoint: ENDPOINT_DO_AVISO,
      // O resumo do aviso, e não o corpo: ver `formato-do-provedor.ts` sobre a
      // transcrição fora da tabela de observabilidade.
      request: {
        type: aviso.tipo,
        conversation_id: aviso.conversaId,
        call_sid: aviso.chamadaDaTelefoniaId,
        status: aviso.situacao,
        event_timestamp: aviso.instanteDoEvento,
      },
      response: { ...resposta.corpo },
      status_code: resposta.status,
      // O aviso é pedido que chegou, e não ida nossa a alguém: não há latência
      // de provedor a medir.
      latency_ms: null,
      correlation_id: chamada.id,
    })
  } catch {
    // Observabilidade perdida não derruba a finalização; ver o cabeçalho.
  }
}

function recusa(motivo: MotivoDoFim): RespostaDoFim {
  return { status: STATUS[motivo], corpo: { ok: false, motivo, mensagem: MENSAGENS[motivo] } }
}
