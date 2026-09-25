// A conferência do `x-tool-secret`, antes de a ferramenta saber de que conta é
// a chamada.
//
// O segredo da conta é `HMAC(chave_do_servidor, account_id)` (T-18, seção 5 do
// PRD de implementação); a derivação mora em `../segredo-de-ferramenta.ts`, que
// é o que `agent-publish` grava na configuração do agente. Este módulo é o lado
// de quem recebe: dado o cabeçalho e as contas candidatas, diz qual conta o
// segredo apresentado prova, sem ler banco nenhum para isso. HMAC não se
// inverte, então "descobrir a conta" é recalcular o segredo de cada candidata e
// ver qual casa — quem escolhe as candidatas é a borda (a conta da conversa, ou
// o conjunto de contas em cache), e o módulo não confia em nenhuma delas antes
// de o segredo casar.
//
// **Rotação (R-07).** Trocar a chave do servidor é republicar os quatro agentes
// de todas as contas, e entre a troca da variável e a republicação há ligação
// no ar cujo agente ainda manda o segredo velho. Por 24 h contadas da rotação, a
// chave anterior também confere, e a resposta diz qual das duas casou: a borda
// registra quem ainda usa a velha, e a rotação termina quando ninguém mais usa.
// Sem carimbo de rotação, ou com carimbo no futuro, a anterior não vale —
// janela sem começo valeria para sempre. É a mesma regra do segredo de webhook,
// em `../provedor/assinatura-de-webhook.ts`.
//
// **O segredo apresentado não sai daqui.** Nem na resposta, nem em mensagem de
// erro: quem registra a recusa registra o motivo, e o motivo é um nome.
//
// Módulo portável: `crypto.subtle` é Web Crypto e existe no Deno da borda e no
// Node dos testes. Sem Deno, sem rede, sem banco. A chave do servidor chega por
// parâmetro, lida de `SARAH_TOOL_SERVER_KEY` pelo `index.ts` de quem chama.

import { JANELA_DE_ROTACAO_EM_SEGUNDOS } from '../provedor/assinatura-de-webhook.ts'
import { derivarSegredoDeFerramenta } from '../segredo-de-ferramenta.ts'

/** O cabeçalho em que o agente publicado manda o segredo. */
export const CABECALHO_DO_SEGREDO = 'x-tool-secret'

/** A janela em que a chave anterior ainda confere, em milissegundos. */
export const JANELA_DE_ROTACAO_EM_MS = JANELA_DE_ROTACAO_EM_SEGUNDOS * 1000

/** HMAC-SHA256 são 32 bytes, 64 caracteres em hexadecimal. */
const TAMANHO_EM_HEXADECIMAL = 64
const SO_HEXADECIMAL = /^[0-9a-f]+$/

/**
 * O segredo da conta, em hexadecimal minúsculo. É o nome que o contrato das
 * ferramentas usa para a mesma receita de `derivarSegredoDeFerramenta`: uma
 * implementação só, porque duas cópias de uma derivação se desencontram no
 * primeiro ajuste e toda ferramenta passa a recusar o agente publicado.
 */
export function derivarSegredo(chaveDoServidor: string, accountId: string): Promise<string> {
  return derivarSegredoDeFerramenta(chaveDoServidor, accountId)
}

export interface ChavesDoServidor {
  /** A chave em vigor. Ausente é configuração faltando, e levanta. */
  readonly vigente: string
  /** A chave de antes da rotação, quando há uma em curso. */
  readonly anterior?: string | null
  /** Quando a rotação aconteceu, em milissegundos desde a época. */
  readonly rotacionadaEm?: number | null
}

export interface PedidoDeConferencia {
  /** O valor do cabeçalho `x-tool-secret`, como chegou. */
  readonly cabecalho: string | null | undefined
  readonly chaves: ChavesDoServidor
  /** As contas que o segredo pode provar. Nenhuma é confiável antes de casar. */
  readonly contas: Iterable<string>
  /** O relógio, em milissegundos. Padrão `Date.now`. */
  readonly agora?: () => number
}

/** As quatro recusas, cada uma com nome próprio para o registro da borda. */
export type MotivoDaRecusa =
  | 'cabecalho_ausente'
  | 'segredo_malformado'
  | 'tamanho_diferente'
  | 'sem_conta'

export type ConferenciaDoSegredo =
  | { readonly ok: true; readonly contaId: string; readonly chave: 'vigente' | 'anterior' }
  | { readonly ok: false; readonly motivo: MotivoDaRecusa }

/**
 * Confere o segredo apresentado contra as contas candidatas e devolve a conta
 * que ele prova, dizendo se casou com a chave vigente ou com a anterior.
 *
 * Toda candidata é comparada com as duas chaves, sem sair no primeiro acerto:
 * o tempo da conferência não conta em que posição a conta estava. A comparação
 * de cada par é sobre os 32 bytes, em tempo constante (`bytesIguais`).
 */
export async function conferirSegredo(pedido: PedidoDeConferencia): Promise<ConferenciaDoSegredo> {
  const apresentado = (pedido.cabecalho ?? '').trim()
  if (apresentado === '') return { ok: false, motivo: 'cabecalho_ausente' }
  if (!SO_HEXADECIMAL.test(apresentado)) return { ok: false, motivo: 'segredo_malformado' }
  if (apresentado.length !== TAMANHO_EM_HEXADECIMAL) return { ok: false, motivo: 'tamanho_diferente' }

  const recebidos = bytesDoHexadecimal(apresentado)
  const vigente = pedido.chaves.vigente.trim()
  const anterior = anteriorDentroDaJanela(pedido.chaves, vigente, (pedido.agora ?? Date.now)())

  let achada: { contaId: string; chave: 'vigente' | 'anterior' } | null = null
  for (const contaId of pedido.contas) {
    const casouVigente = bytesIguais(
      recebidos,
      bytesDoHexadecimal(await derivarSegredo(vigente, contaId)),
    )
    const casouAnterior =
      anterior !== null &&
      bytesIguais(recebidos, bytesDoHexadecimal(await derivarSegredo(anterior, contaId)))
    if (achada === null && (casouVigente || casouAnterior)) {
      achada = { contaId, chave: casouVigente ? 'vigente' : 'anterior' }
    }
  }

  return achada === null ? { ok: false, motivo: 'sem_conta' } : { ok: true, ...achada }
}

/** A chave anterior, quando a rotação dela ainda está dentro das 24 h. */
function anteriorDentroDaJanela(
  chaves: ChavesDoServidor,
  vigente: string,
  agora: number,
): string | null {
  const anterior = chaves.anterior?.trim() ?? ''
  if (anterior === '' || anterior === vigente) return null

  const rotacionadaEm = chaves.rotacionadaEm
  if (typeof rotacionadaEm !== 'number' || !Number.isFinite(rotacionadaEm)) return null
  // Só para a frente: carimbo no futuro é variável mal escrita, e tratá-lo como
  // janela aberta faria um erro de digitação ressuscitar a chave velha.
  const desdeARotacao = agora - rotacionadaEm
  if (desdeARotacao < 0 || desdeARotacao > JANELA_DE_ROTACAO_EM_MS) return null
  return anterior
}

function bytesDoHexadecimal(hexadecimal: string): Uint8Array {
  const bytes = new Uint8Array(hexadecimal.length / 2)
  for (let posicao = 0; posicao < bytes.length; posicao += 1) {
    bytes[posicao] = Number.parseInt(hexadecimal.slice(posicao * 2, posicao * 2 + 2), 16)
  }
  return bytes
}

/**
 * Dois vetores de bytes de mesmo tamanho são iguais, em tempo que não depende
 * de onde divergem: acumula o xor de todos e só decide no fim. `===` ou
 * `return` dentro do laço sairia no primeiro byte diferente, e quem mede o
 * tempo descobre o segredo um byte por vez. A propriedade é estrutural, não é
 * testada — nenhuma asserção de tempo sobrevive a um CI compartilhado.
 */
export function bytesIguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let posicao = 0; posicao < a.length; posicao += 1) {
    diferenca |= (a[posicao] as number) ^ (b[posicao] as number)
  }
  return diferenca === 0
}
