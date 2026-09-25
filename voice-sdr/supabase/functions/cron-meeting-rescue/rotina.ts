// cron-meeting-rescue: o resgate de falta atestada, a cada cinco minutos
// (seção 4.6, RF-604 e RF-605, terceiro critério de aceite da F6).
//
// O nome é `cron-meeting-rescue` e não `cron-meeting-noshow` de propósito: a
// rotina lê falta ATESTADA e não detecta falta nenhuma (T-17). O núcleo é SQL
// (`enfileirar_resgates`): enfileira o item `rescue` da falta atestada, abaixo
// do teto e depois do recuo, e esgota a que chegou ao teto (lead para perdido
// com o motivo), tudo numa transação por item. Quem liga é `cron-dial` (L-14).
//
// **Idempotente (RNF-06).** A marca é a reivindicação: a segunda passagem no
// mesmo instante não vê a reunião. O que o envelope registra em `job_runs.items`
// é o que entrou na fila, e o alarme de volume (R-09) compara esse número com a
// média das execuções anteriores.
//
// **`processar` não faz nada**, de propósito: o efeito já aconteceu dentro da
// reivindicação, e a rotina só devolve ao envelope o que a função enfileirou,
// para a contagem e o alarme. Repetir o efeito aqui seria a segunda porta de
// escrita na fila.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoResgate`, implementada em `index.ts` e dublada no teste.

import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-meeting-rescue'

/** Uma linha de `enfileirar_resgates`: o resgate enfileirado ou a falta esgotada. */
export interface ResgateDaPassagem {
  readonly meeting_id: string
  readonly account_id: string
  readonly acao: 'enfileirado' | 'esgotado'
}

export interface PortaDoResgate {
  /** `enfileirar_resgates(p_agora, p_limite)`, pelo RPC. */
  enfileirarResgates(instante: string, limite: number): Promise<readonly ResgateDaPassagem[]>
}

export interface PedidoDoResgate {
  readonly porta: PortaDoResgate
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

interface ItemDoResgate extends ItemDaRotina {
  readonly contaId: string
}

/** Uma passagem de `cron-meeting-rescue`, dentro do envelope das rotinas. */
export function resgatarFaltas(pedido: PedidoDoResgate): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  return executarRotina<ItemDoResgate>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora: pedido.agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const linhas = await porta.enfileirarResgates(instante, limite)
        return linhas.map((linha) => ({ chave: `${linha.acao}:${linha.meeting_id}`, contaId: linha.account_id }))
      },
      async processar() {
        // O efeito já aconteceu: a função enfileirou ou esgotou na mesma transação da marca.
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
  resgate: PedidoDoResgate,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }
  const resultado = await resgatarFaltas(resgate)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
