// cron-meeting-invite: a nova tentativa do convite da reunião por e-mail
// (seção 4.6, RF-509, R-05).
//
// Roda a cada 5 minutos, dentro do envelope das rotinas. `tool-book-meeting`
// manda os dois convites na mesma requisição do agendamento; o que falhou lá
// (provedor fora, chave recusada, lead sem e-mail) fica nas colunas de entrega
// de `meetings`, e esta rotina tenta de novo pelas regras de
// `_shared/agenda/convite-de-reuniao.ts`: recuo, teto e marca só depois do 2xx.
//
// **Idempotente (RNF-06).** A reivindicação (`reivindicar_convites_para_enviar`)
// é `for update skip locked` e grava `invite_claimed_at`, que tira a reunião da
// fila por quatro minutos: duas passagens sobrepostas pegam reuniões
// diferentes. Reunião nascida há menos de dois minutos fica de fora, porque a
// ferramenta ainda pode estar enviando. Dentro da passagem, o lado com
// `sent_at` não vai ao provedor, e a chave de idempotência da mensagem é a
// mesma para a mesma tentativa.
//
// **Uma reunião que falha no provedor não para as outras**: a falha vira
// pendência na linha dela. O envelope só vê erro quando a própria escrita da
// pendência não grava: aí é o banco que caiu, e seguir seria mandar convites
// sem conseguir registrar que saíram.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o
// e-mail entram por `PortaDoReenvio`, implementada em `index.ts` e dublada no
// teste.

import {
  TETO_DE_TENTATIVAS,
  enviarConvitesDaReuniao,
  type PortaDoConviteDaReuniao,
  type ReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import type { FalhaDoEmail, PortaDeEmail } from '../_shared/email/email.ts'
import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-meeting-invite'

export interface PortaDoReenvio extends PortaDoConviteDaReuniao {
  /**
   * `reivindicar_convites_para_enviar`: as reuniões com convite por sair,
   * abaixo de `teto`, com `for update skip locked`, gravando `invite_claimed_at`.
   */
  reivindicarReunioes(limite: number, instante: string, teto: number): Promise<readonly string[]>
  /** A reunião como o convite a lê. Nula se sumiu entre a reivindicação e a leitura. */
  reuniaoParaConvite(reuniaoId: string): Promise<ReuniaoParaConvite | null>
  /** O e-mail transacional da conta, ou a falha quando não há chave. */
  emailParaConvite(contaId: string): Promise<PortaDeEmail | FalhaDoEmail>
}

export interface PedidoDoReenvio {
  readonly porta: PortaDoReenvio
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-meeting-invite`, dentro do envelope das rotinas. */
export function reenviarConvites(pedido: PedidoDoReenvio): Promise<ResultadoDaExecucao> {
  const { porta } = pedido

  return executarRotina<ItemDaRotina>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora: pedido.agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const ids = await porta.reivindicarReunioes(limite, instante, TETO_DE_TENTATIVAS)
        return ids.map((id) => ({ chave: id }))
      },
      async processar(item, instante) {
        const reuniao = await porta.reuniaoParaConvite(item.chave)
        if (reuniao === null) return
        const email = await porta.emailParaConvite(reuniao.account_id)
        await enviarConvitesDaReuniao({ reuniao, email, porta, agora: () => Date.parse(instante) })
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
 * porta: sem ele, nem `job_runs` recebe linha.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  reenvio: PedidoDoReenvio,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await reenviarConvites(reenvio)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
