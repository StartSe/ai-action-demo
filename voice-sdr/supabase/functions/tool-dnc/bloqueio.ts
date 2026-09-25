// tool-dnc: o bloqueio pedido dentro da chamada (RF-805, RF-422).
// Referência: docs/PRD-implementacao.md seções 4.3 e 5, docs/revisao-tecnica.md
// T-02, T-16 e R-02.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`), e o
// que ela decide é pouco, de propósito:
//
// - **O instante é o da chamada, não o da finalização.** O bloqueio grava
//   enquanto o interlocutor ainda está na linha. É o ponto de RF-805, e é o que
//   a referência erra: lá o bloqueio dependia da ferramenta de qualificação no
//   fim, e quem desligava antes continuava sendo chamado.
// - **A origem sai do `reason`.** `wrong_number` é a pessoa errada de RF-422;
//   qualquer outro valor é o pedido do interlocutor (`lead_request`). O que o
//   modelo escreveu além do código, e o `notes` quando vier, vai para
//   `dnc_entries.notes`: é o motivo dito na conversa, e é o que a tela mostra
//   quando alguém pergunta por que a conta não liga mais para aquele número.
// - **Pedido repetido é idempotente pelo banco.** A leitura devolve o instante
//   do bloqueio vigente quando há um; a escrita passa pelo único parcial de
//   `dnc_entries` (`bloquear_numero_pela_ferramenta`) e só abre item na fila
//   quando foi ela quem criou o bloqueio. Duas chamadas simultâneas podem ler
//   "sem bloqueio" juntas e responder cada uma o próprio instante; a linha é
//   uma só, com o da primeira. A diferença é de milissegundos numa fala que
//   não os cita.
// - **A fala é a despedida, e não promete encerrar.** Quem encerra é
//   `end_call`, a ferramenta de sistema (T-02). A fala sai de
//   `_shared/speech/regras-travadas.ts`, a mesma que a camada 1 manda dizer,
//   para a Sarah não ter duas versões da despedida.
// - **Sem número, o pedido não se perde.** Chamada sem número conhecido
//   responde `ok: false` com a mesma despedida (a promessa foi feita em voz
//   alta e a camada 1 proíbe dizer que houve erro) e o item da fila abre do
//   mesmo jeito, para alguém do time resolver à mão.
//
// Leitura e escrita chegam por caminhos diferentes, e isso é o modo ensaio
// (T-16): a leitura é fechamento de `criarToolDnc`, e a escrita é a porta que o
// esqueleto entrega só a `efeitos`, fora do ensaio. Em ensaio a Sarah ouve a
// mesma despedida e nada é gravado.
//
// Módulo portável: sem `Deno`, sem rede. O `index.ts` monta as portas sobre o
// Supabase com a chave de serviço.

import { PROPOSITOS } from '../_shared/playbook/camada-um.ts'
import { FALAS_DAS_REGRAS_TRAVADAS } from '../_shared/speech/regras-travadas.ts'
import {
  criarFerramenta,
  type ChamadaDaFerramenta,
  type ContextoDoExecutor,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** As duas origens de `dnc_entries.source` que acontecem dentro da chamada. */
export type OrigemDoBloqueio = 'lead_request' | 'wrong_number'

/** O `reason` que marca a pessoa errada, como a camada 1 manda chamar. */
export const MOTIVO_DE_PESSOA_ERRADA = 'wrong_number'

/** O `reason` do pedido do interlocutor, como a camada 1 manda chamar. */
export const MOTIVO_DE_PEDIDO = 'lead_request'

/**
 * O que vai em `dnc_entries.reason`, que é obrigatório. É texto de registro,
 * lido na lista de bloqueios: diz de onde veio, e o detalhe fica em `notes`.
 */
export const MOTIVO_GRAVADO: Readonly<Record<OrigemDoBloqueio, string>> = {
  lead_request: 'Pediu durante a ligação para não ser mais chamado.',
  wrong_number: 'Número errado: quem atendeu não era a pessoa procurada.',
}

/** Os números que a chamada conhece. Qualquer um pode ser nulo. */
export interface NumerosDaChamada {
  /** `calls.from_number`. */
  readonly de: string | null
  /** `calls.to_number`. */
  readonly para: string | null
  /** `leads.phone_e164` do lead da chamada. */
  readonly doLead: string | null
}

/** O que `ler` consulta. Nunca escreve. */
export interface LeituraDoDnc {
  numerosDaChamada(contaId: string, chamadaId: string): Promise<NumerosDaChamada>
  /** O `created_at` do bloqueio ativo deste número, em ISO, ou nulo. */
  bloqueioVigente(contaId: string, telefone: string): Promise<string | null>
}

export interface PedidoDeBloqueio {
  readonly contaId: string
  readonly telefone: string
  readonly origem: OrigemDoBloqueio
  readonly motivo: string
  readonly notas: string | null
  /** O instante que a leitura respondeu, em ISO. */
  readonly instante: string
}

export interface ItemDeBloqueioNaFila {
  readonly contaId: string
  readonly chamadaId: string
  readonly leadId: string | null
  readonly contexto: Readonly<Record<string, unknown>>
}

/** O que `efeitos` escreve. O esqueleto a entrega só fora do ensaio. */
export interface EscritaDoDnc {
  /** Pelo único parcial: devolve o instante vigente e se foi esta escrita que criou. */
  bloquear(pedido: PedidoDeBloqueio): Promise<{ readonly blockedAt: string; readonly criado: boolean }>
  /** Pelo RPC `criar_excecao` (L-24). */
  abrirItemNaFila(item: ItemDeBloqueioNaFila): Promise<void>
}

/** O que a leitura decidiu e `efeitos` executa. */
export interface PlanoDoBloqueio {
  readonly telefone: string | null
  readonly origem: OrigemDoBloqueio
  readonly notas: string | null
  readonly instante: string | null
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

/** A origem a partir do `reason` que o modelo mandou. */
export function origemDoMotivo(reason: unknown): OrigemDoBloqueio {
  return texto(reason).toLowerCase() === MOTIVO_DE_PESSOA_ERRADA ? 'wrong_number' : 'lead_request'
}

/**
 * O motivo dito na conversa: o `reason` quando é mais que o código, e o
 * `notes` quando vier. Nulo quando não sobra nada, porque `notes` vazio é
 * recusado pela tabela.
 */
export function notasDoPedido(entrada: Readonly<Record<string, unknown>>): string | null {
  const reason = texto(entrada.reason)
  const codigo = [MOTIVO_DE_PEDIDO, MOTIVO_DE_PESSOA_ERRADA].includes(reason.toLowerCase())
  const partes = [codigo ? '' : reason, texto(entrada.notes)].filter((parte) => parte !== '')
  return partes.length === 0 ? null : [...new Set(partes)].join(' | ')
}

/**
 * O número de quem está na linha. Na recebida é quem ligou; na feita (e no
 * ensaio) é para quem se ligou. O do lead é a rede quando a chamada não
 * guardou o número.
 */
export function numeroDoInterlocutor(
  chamada: Pick<ChamadaDaFerramenta, 'direction'>,
  numeros: NumerosDaChamada,
): string | null {
  const daChamada = chamada.direction === 'inbound' ? numeros.de : numeros.para
  const numero = texto(daChamada) || texto(numeros.doLead)
  return numero === '' ? null : numero
}

/** A despedida da regra travada que chamou a ferramenta. */
export function despedida(origem: OrigemDoBloqueio): string {
  const falas =
    origem === 'wrong_number' ? FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada : FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe
  return falas[falas.length - 1]!
}

/** Monta o tratador de `tool-dnc` sobre a leitura dada. */
export function criarToolDnc(leitura: LeituraDoDnc): TratadorDeFerramenta<EscritaDoDnc> {
  return criarFerramenta<EscritaDoDnc, PlanoDoBloqueio>({
    nome: 'tool-dnc',
    propositos: [...PROPOSITOS],
    obrigatorios: [{ chave: 'reason', nome: 'motivo' }],
    executar: {
      async ler(contexto): Promise<ResultadoDoExecutor<PlanoDoBloqueio>> {
        const origem = origemDoMotivo(contexto.entrada.reason)
        const notas = notasDoPedido(contexto.entrada)
        const speech = despedida(origem)

        const numeros = await leitura.numerosDaChamada(contexto.contaId, contexto.chamada.id)
        const telefone = numeroDoInterlocutor(contexto.chamada, numeros)
        if (telefone === null) {
          return {
            ok: false,
            erro: 'numero_desconhecido',
            data: { blocked_at: null },
            speech,
            plano: { telefone: null, origem, notas, instante: null },
          }
        }

        const vigente = await leitura.bloqueioVigente(contexto.contaId, telefone)
        const instante = vigente ?? new Date(contexto.agora()).toISOString()
        return {
          data: { blocked_at: instante },
          speech,
          plano: { telefone, origem, notas, instante },
        }
      },

      async efeitos(contexto: ContextoDoExecutor<EscritaDoDnc>, leitura) {
        const plano = leitura.plano
        if (plano === undefined) return

        const contextoDoItem = (blockedAt: string | null) => ({
          call_id: contexto.chamada.id,
          origem: plano.origem,
          // O recorte que existe durante a chamada é o que o modelo disse ao
          // chamar a ferramenta; a transcrição inteira chega na finalização e
          // a tela a lê pela chamada.
          recorte: plano.notas,
          blocked_at: blockedAt,
        })
        const abrirItem = (blockedAt: string | null) =>
          contexto.escrita.abrirItemNaFila({
            contaId: contexto.contaId,
            chamadaId: contexto.chamada.id,
            leadId: contexto.chamada.lead_id,
            contexto: contextoDoItem(blockedAt),
          })

        if (plano.telefone === null || plano.instante === null) {
          await abrirItem(null)
          return
        }

        const gravado = await contexto.escrita.bloquear({
          contaId: contexto.contaId,
          telefone: plano.telefone,
          origem: plano.origem,
          motivo: MOTIVO_GRAVADO[plano.origem],
          notas: plano.notas,
          instante: plano.instante,
        })
        // Só quem criou o bloqueio abre o item: o pedido repetido na mesma
        // chamada não vira segundo item.
        if (gravado.criado) await abrirItem(gravado.blockedAt)
      },
    },
  })
}
