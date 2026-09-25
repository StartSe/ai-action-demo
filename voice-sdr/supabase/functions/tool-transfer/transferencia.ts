// tool-transfer: o pedido de humano dentro da chamada (RF-909, seção 9 do PRD).
// Referência: docs/PRD-implementacao.md seções 3.4, 4.3 e 5, docs/revisao-tecnica.md
// T-02 e T-16.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`) e só
// decide; quem move a chamada é `transfer_to_number`, a ferramenta de sistema
// do provedor, encadeada pela camada 1 depois desta resposta (T-02). Um webhook
// devolve JSON e não transfere nada, e por isso nenhuma resposta daqui afirma
// que a transferência já aconteceu.
//
// - **O destino é `agents.transfer_target` da conta.** Normalizado por
//   `_shared/telefone.ts`, para `transfer_to_number` receber um E.164 e nunca
//   o texto que alguém digitou na tela. Destino ausente e destino que não é
//   telefone dão o mesmo `queued`, com pendências diferentes.
// - **Sem destino, o pedido vira item na fila**, `human_requested`, severidade
//   alta, com o recorte e o `call_id` por onde a tela pede o áudio. A pendência
//   de configuração vai no `context` do item, como código, e a tela da fila a
//   traduz: a conversa não ouve "a conta não configurou um destino", ouve que
//   alguém do time retorna.
// - **Duas falas**, em `_shared/speech/transferencia.ts`: uma para a
//   transferência em curso, outra para o retorno depois. Nenhuma promete prazo.
// - **A urgência não muda a severidade.** Pedido de humano que ficou sem
//   destino é sempre alta; a urgência dita na conversa vai no `context`, para
//   quem pega o item saber por onde começar.
//
// Em ensaio (T-16) a leitura acontece e a resposta é a mesma, e `efeitos`, que
// é quem abre o item, não roda.
//
// Módulo portável: sem `Deno`, sem rede. O `index.ts` monta as portas sobre o
// Supabase com a chave de serviço.

import { PROPOSITOS } from '../_shared/playbook/camada-um.ts'
import { FALAS_DA_TRANSFERENCIA } from '../_shared/speech/transferencia.ts'
import { normalizarTelefone } from '../_shared/telefone.ts'
import {
  criarFerramenta,
  type ContextoDoExecutor,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** A urgência como o item da fila a guarda. */
export type Urgencia = 'alta' | 'normal'

/** Por que o pedido ficou sem destino. Código; a frase é da tela da fila. */
export type PendenciaDeDestino = 'destino_ausente' | 'destino_invalido'

/** O que `ler` consulta. Nunca escreve. */
export interface LeituraDaTransferencia {
  /** `agents.transfer_target` da conta, como gravado, ou nulo. */
  destinoDaConta(contaId: string): Promise<string | null>
}

export interface ItemDeTransferenciaNaFila {
  readonly contaId: string
  readonly chamadaId: string
  readonly leadId: string | null
  readonly contexto: Readonly<Record<string, unknown>>
}

/** O que `efeitos` escreve. O esqueleto a entrega só fora do ensaio. */
export interface EscritaDaTransferencia {
  /** Pelo RPC `criar_excecao` (L-24), com `human_requested` e severidade alta. */
  abrirItemNaFila(item: ItemDeTransferenciaNaFila): Promise<void>
}

/** O que a leitura decidiu e `efeitos` executa. */
export interface PlanoDaTransferencia {
  /** Nula quando há destino: aí não há item a abrir. */
  readonly pendencia: PendenciaDeDestino | null
  readonly urgencia: Urgencia
  readonly recorte: string | null
}

const URGENCIAS_ALTAS = new Set(['alta', 'high', 'urgente', 'urgent'])

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/** A urgência a partir do que o modelo mandou. Qualquer outra coisa é normal. */
export function urgenciaDoPedido(urgency: unknown): Urgencia {
  return URGENCIAS_ALTAS.has(texto(urgency).toLowerCase()) ? 'alta' : 'normal'
}

/** O motivo dito na conversa, e o `notes` quando vier. Nulo quando não sobra nada. */
export function recorteDoPedido(entrada: Readonly<Record<string, unknown>>): string | null {
  const partes = [texto(entrada.reason), texto(entrada.notes)].filter((parte) => parte !== '')
  return partes.length === 0 ? null : [...new Set(partes)].join(' | ')
}

/** O destino em E.164, ou a razão de não haver um. */
export function destinoDaTransferencia(
  gravado: string | null,
): { readonly numero: string; readonly pendencia: null } | { readonly numero: null; readonly pendencia: PendenciaDeDestino } {
  if (texto(gravado) === '') return { numero: null, pendencia: 'destino_ausente' }
  const normalizado = normalizarTelefone(gravado)
  return normalizado.ok
    ? { numero: normalizado.e164, pendencia: null }
    : { numero: null, pendencia: 'destino_invalido' }
}

/** Monta o tratador de `tool-transfer` sobre a leitura dada. */
export function criarToolTransfer(leitura: LeituraDaTransferencia): TratadorDeFerramenta<EscritaDaTransferencia> {
  return criarFerramenta<EscritaDaTransferencia, PlanoDaTransferencia>({
    nome: 'tool-transfer',
    propositos: [...PROPOSITOS],
    obrigatorios: [{ chave: 'reason', nome: 'motivo' }],
    executar: {
      async ler(contexto): Promise<ResultadoDoExecutor<PlanoDaTransferencia>> {
        const urgencia = urgenciaDoPedido(contexto.entrada.urgency)
        const recorte = recorteDoPedido(contexto.entrada)
        const destino = destinoDaTransferencia(await leitura.destinoDaConta(contexto.contaId))

        if (destino.numero !== null) {
          return {
            data: { transfer_number: destino.numero, queued: false },
            speech: FALAS_DA_TRANSFERENCIA.emCurso,
            plano: { pendencia: null, urgencia, recorte },
          }
        }
        return {
          data: { transfer_number: null, queued: true },
          speech: FALAS_DA_TRANSFERENCIA.retorno,
          plano: { pendencia: destino.pendencia, urgencia, recorte },
        }
      },

      async efeitos(contexto: ContextoDoExecutor<EscritaDaTransferencia>, leitura) {
        const plano = leitura.plano
        if (plano === undefined || plano.pendencia === null) return

        await contexto.escrita.abrirItemNaFila({
          contaId: contexto.contaId,
          chamadaId: contexto.chamada.id,
          leadId: contexto.chamada.lead_id,
          contexto: {
            call_id: contexto.chamada.id,
            // O recorte que existe durante a chamada é o que o modelo disse ao
            // chamar a ferramenta; a transcrição inteira chega na finalização e
            // a tela a lê pela chamada.
            recorte: plano.recorte,
            urgencia: plano.urgencia,
            pendencia: plano.pendencia,
          },
        })
      },
    },
  })
}
