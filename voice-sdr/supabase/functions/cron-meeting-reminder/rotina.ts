// cron-meeting-reminder: o lembrete de reunião, a cada minuto (seção 4.6,
// RF-601, primeiro critério de aceite da F6).
//
// A rotina não decide nada sozinha e nunca disca. O núcleo é SQL
// (`enfileirar_lembretes_de_reuniao`): escolhe as reuniões na janela da conta,
// marca `reminder_sent_at` e enfileira o item `rem` na `dial_queue`, tudo numa
// transação. Quem liga é `cron-dial` (L-14), e o pré-contato por WhatsApp, quando
// a conta o ligou, sai de lá junto com a ligação, como para qualquer item da
// fila.
//
// **Idempotente (RNF-06).** A marca é a reivindicação: a segunda passagem no
// mesmo minuto não vê a reunião. O que o envelope registra em `job_runs.items`
// é o que entrou na fila, e o alarme de volume (R-09) compara esse número com a
// média das execuções anteriores.
//
// **`processar` não faz nada**, de propósito: o efeito já aconteceu dentro da
// reivindicação, e a rotina só devolve ao envelope o que a função enfileirou,
// para a contagem e o alarme. Repetir o efeito aqui seria a segunda porta de
// escrita na fila.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoLembrete`, implementada em `index.ts` e dublada no teste.

import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-meeting-reminder'

/** Uma linha de `enfileirar_lembretes_de_reuniao`. */
export interface LembreteEnfileirado {
  readonly meeting_id: string
  readonly account_id: string
}

export interface PortaDoLembrete {
  /** `enfileirar_lembretes_de_reuniao(p_agora, p_limite)`, pelo RPC. */
  enfileirarLembretes(instante: string, limite: number): Promise<readonly LembreteEnfileirado[]>
}

export interface PedidoDoLembrete {
  readonly porta: PortaDoLembrete
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

interface ItemDoLembrete extends ItemDaRotina {
  readonly contaId: string
}

/** Uma passagem de `cron-meeting-reminder`, dentro do envelope das rotinas. */
export function lembrarReunioes(pedido: PedidoDoLembrete): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  return executarRotina<ItemDoLembrete>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora: pedido.agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const linhas = await porta.enfileirarLembretes(instante, limite)
        return linhas.map((linha) => ({ chave: linha.meeting_id, contaId: linha.account_id }))
      },
      async processar() {
        // O item já está na fila: a função o enfileirou na mesma transação da marca.
      },
    },
  })
}

// A borda --------------------------------------------------------------------

export interface PedidoDaRotina {
  readonly metodo: string
  /** O cabeçalho `x-internal-secret`. */
  readonly segredo: string | null
}

export interface RespostaDaRotina {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
}

/**
 * O que o `index.ts` chama. O segredo é conferido antes de tocar em qualquer
 * porta: sem ele, nem `job_runs` recebe linha. Erro da função vira linha com
 * `error` em `job_runs` e 500 no corpo, sem exceção escapando.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  lembrete: PedidoDoLembrete,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }
  const resultado = await lembrarReunioes(lembrete)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
