// A reaplicação do bloqueio na finalização (R-02, seção 4.2, RF-805).
//
// A camada 1 manda a Sarah prometer o bloqueio em voz alta e encerrar, e a
// promessa vale com a ferramenta em falha (US-103). Este módulo é o que a faz
// valer: toda invocação de `tool-dnc` lida da transcrição é refeita aqui, e o
// bloqueio que a ferramenta não conseguiu gravar nasce na finalização.
//
// **NÃO PASSA PELO REGISTRO DE `reaplicacao.ts`.** Aquele registro só alcança o
// que o provedor marcou com `is_error`. O banco fora do ar durante a ligação
// não chega lá assim: o esqueleto das ferramentas responde 200 com `ok: false`
// e a frase de contorno, e o provedor registra uma invocação bem-sucedida. Por
// isso a leitura é de **toda** invocação de `tool-dnc`, com erro ou sem, e quem
// decide se falta o bloqueio é o banco.
//
// **Idempotente nos dois sentidos, pelo único parcial de `dnc_entries`.** O
// bloqueio vai pelo mesmo RPC da ferramenta (`bloquear_numero_pela_ferramenta`):
// com bloqueio ativo para o número, nada é escrito, a linha existente não muda
// e o instante dela continua o da ligação. É o que torna segura a segunda
// passagem da finalização e a invocação que deu certo. O item da fila abre só
// quando foi esta escrita que criou o bloqueio, a mesma regra da ferramenta.
//
// **O instante é o da promessa**, o `at` lido da transcrição, e não o da
// finalização: o bloqueio vale desde que o interlocutor pediu.
//
// **Falha ao bloquear derruba a finalização**, ao contrário do registro
// genérico. A promessa foi dita, e a finalização é a última chance de
// cumpri-la: com ela caída, a reivindicação vence em 5 minutos e a varredura
// tenta de novo, e o RPC idempotente torna a repetição inofensiva. O item da
// fila que falha depois do bloqueio criado não derruba nada: o bloqueio, que é
// a promessa, já está gravado, e a falha fica contada no corpo.
//
// **Ensaio não reaplica nada** (T-16): ensaio não bloqueia, e a chamada de
// ensaio nem chega a tocar a porta.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  MOTIVO_GRAVADO,
  notasDoPedido,
  numeroDoInterlocutor,
  origemDoMotivo,
  type EscritaDoDnc,
  type LeituraDoDnc,
  type OrigemDoBloqueio,
} from '../tool-dnc/bloqueio.ts'

import type { InvocacaoLida } from './formato-do-provedor.ts'
import { instantesDasInvocacoes } from './leitura-da-transcricao.ts'

/** O nome da ferramenta como o provedor o escreve na transcrição. */
export const FERRAMENTA_DE_BLOQUEIO = 'tool-dnc'

/** O que abre `dnc_entries.notes` do bloqueio que nasceu aqui. */
export const NOTA_DA_REAPLICACAO = 'Reaplicado na finalização: a ferramenta não gravou o bloqueio durante a ligação.'

/** Um pedido de bloqueio lido da transcrição. */
export interface PedidoLido {
  readonly origem: OrigemDoBloqueio
  /** O motivo dito na conversa, sem a nota da reaplicação. */
  readonly notas: string | null
  /** O instante da invocação, em ISO. */
  readonly instante: string
}

/** A chamada, no que a reaplicação precisa dela. */
export interface ChamadaDoBloqueio {
  readonly id: string
  readonly account_id: string
  readonly lead_id: string | null
  readonly direction: 'outbound' | 'inbound' | 'rehearsal'
}

/** A leitura dos números e a escrita, com os contratos de `tool-dnc`. */
export interface PortaDoBloqueio {
  numerosDaChamada: LeituraDoDnc['numerosDaChamada']
  bloquearNumero: EscritaDoDnc['bloquear']
  abrirItemDeBloqueio: EscritaDoDnc['abrirItemNaFila']
}

export interface ResultadoDosBloqueios {
  /** Chamada de ensaio: nada foi lido nem escrito. */
  readonly ensaio: boolean
  /** Invocações de `tool-dnc` na transcrição. */
  readonly pedidos: number
  /** Bloqueios que nasceram aqui. */
  readonly criados: number
  /** Pedidos que já tinham bloqueio ativo, e que por isso não escreveram nada. */
  readonly existentes: number
  /** Pedidos sem número conhecido: a ferramenta já abre o item nesse caso. */
  readonly semNumero: number
  /** Itens da fila que não abriram depois do bloqueio criado. */
  readonly itensQueFalharam: number
}

/**
 * As invocações de `tool-dnc` da transcrição, na ordem e com o instante de
 * `instantesDasInvocacoes` — o mesmo `at` que a linha da invocação recebe.
 */
export function pedidosDeBloqueio(lidas: readonly InvocacaoLida[], inicioMs: number): PedidoLido[] {
  return instantesDasInvocacoes(lidas, inicioMs)
    .filter(({ invocacao }) => invocacao.nome === FERRAMENTA_DE_BLOQUEIO)
    .map(({ invocacao, ms }) => ({
      origem: origemDoMotivo(invocacao.parametros.reason),
      notas: notasDoPedido(invocacao.parametros),
      instante: new Date(ms).toISOString(),
    }))
}

/** As notas gravadas: a marca da reaplicação primeiro, e o motivo dito depois. */
export function notasDaReaplicacao(notas: string | null): string {
  return notas === null ? NOTA_DA_REAPLICACAO : `${NOTA_DA_REAPLICACAO} | ${notas}`
}

/**
 * Refaz os bloqueios pedidos. Levanta quando o bloqueio não pôde ser gravado
 * (ver o cabeçalho); o item da fila que falha fica contado.
 */
export async function reaplicarBloqueios(
  chamada: ChamadaDoBloqueio,
  pedidos: readonly PedidoLido[],
  porta: PortaDoBloqueio,
): Promise<ResultadoDosBloqueios> {
  const resultado = { ensaio: false, pedidos: pedidos.length, criados: 0, existentes: 0, semNumero: 0, itensQueFalharam: 0 }
  if (chamada.direction === 'rehearsal') return { ...resultado, ensaio: true }
  if (pedidos.length === 0) return resultado

  const numeros = await porta.numerosDaChamada(chamada.account_id, chamada.id)
  const telefone = numeroDoInterlocutor(chamada, numeros)
  if (telefone === null) return { ...resultado, semNumero: pedidos.length }

  for (const pedido of pedidos) {
    const gravado = await porta.bloquearNumero({
      contaId: chamada.account_id,
      telefone,
      origem: pedido.origem,
      motivo: MOTIVO_GRAVADO[pedido.origem],
      notas: notasDaReaplicacao(pedido.notas),
      instante: pedido.instante,
    })
    if (!gravado.criado) {
      resultado.existentes += 1
      continue
    }
    resultado.criados += 1
    try {
      await porta.abrirItemDeBloqueio({
        contaId: chamada.account_id,
        chamadaId: chamada.id,
        leadId: chamada.lead_id,
        contexto: {
          call_id: chamada.id,
          origem: pedido.origem,
          recorte: pedido.notas,
          blocked_at: gravado.blockedAt,
          reaplicado: true,
        },
      })
    } catch {
      resultado.itensQueFalharam += 1
    }
  }
  return resultado
}
