// cron-dial: o único consumidor de `dial_queue` (L-14, T-04, seção 4.6).
//
// Cinco rotinas produzem discagem e só esta disca. As outras escrevem na fila e
// param ali; esta lê a fila a cada minuto e chama `call-place`, que é o caminho
// único de discagem. É essa regra que faz o caminho único valer para a
// automação também: cinco rotinas discando por conta própria seriam cinco
// leituras do mesmo `max_concurrent`, e nenhuma veria o que as outras
// discaram. `despacho.test.ts` varre os módulos das demais funções atrás de
// chamada a `call-place` e reprova se achar.
//
// **O que esta rotina decide, e o que ela não decide.** Ela decide *quantos*
// itens de cada conta tomar e *o que fazer* com a resposta. Se a ligação pode
// sair — freio, janela, bloqueio, tetos — é de `guard_dial`, dentro de
// `call-place`, e nada daqui repete a guarda.
//
// **A simultaneidade se mede no dado** (`situacao_da_fila`): chamadas da conta
// em `queued`, `ringing` e `in_progress`, mais item já tomado que ainda não
// virou chamada. Nunca em memória: a passagem do minuto anterior pode estar
// rodando ao mesmo tempo, e o que ela discou só existe no banco. A reivindicação
// (`reivindicar_da_fila`) recalcula as vagas com a conta travada, e por isso
// duas passagens sobrepostas não estouram o teto nem quando leram a mesma
// situação.
//
// **Conta parada é pulada, e o item fica `queued`** (RF-011, par da US-073). A
// regra é `consumoDaFila`, de `_shared/discagem/pausa.ts`: retomar a discagem
// não pode exigir reenfileirar o que já estava na fila.
//
// **O item é tomado antes de qualquer chamada externa.** A reivindicação grava
// `status = 'claimed'` e `claimed_at` na mesma instrução do `for update skip
// locked`; só depois o item vai a `call-place`. Execução que morre no meio
// deixa o item `claimed` com `claimed_at`, que é o que `cron-call-recovery`
// procura.
//
// **Os quatro desfechos da resposta de `call-place`:**
//
// 1. **Discada** (`ok`, estado `discando` ou `ja_existia`): `done` com a
//    chamada. `ja_existia` é o mesmo item voltando depois de uma execução que
//    morreu entre discar e marcar, e a chave de idempotência (T-07) é que o
//    torna inofensivo.
// 2. **Recusada pela guarda**: `done` com o motivo em `last_error`. Recusa é
//    desfecho normal, e não erro da rotina: a tentativa recusada já está em
//    `call_attempts`, e insistir nela a cada minuto seria laço — uma linha de
//    recusa por minuto até a condição mudar. Quem volta a pedir é a produtora,
//    com `attempt` novo.
// 3. **Definitiva** (pedido que nenhuma repetição conserta: fonte, referência,
//    conta ou lead que não existem, número que não normaliza): `failed` com o
//    motivo.
// 4. **Transitória** (rede, provedor fora, configuração que falta, a guarda
//    indisponível, qualquer resposta que não se reconhece): o item volta a
//    `queued` com `last_error` e `run_at` empurrado por recuo crescente, e sem
//    perder o item. Depois de `MAXIMO_DE_FALHAS` vira `failed`, senão uma conta
//    sem publicação geraria uma ida a `call-place` por item a cada recuo, para
//    sempre.
//
// Falha do provedor **depois** de gravar a chamada (a recusa traz `chamadaId`)
// é desfecho 1 com o erro anotado: a linha de `calls` existe, é de
// `cron-call-recovery`, e repetir o item daria `ja_existia` de qualquer jeito.
//
// Nada disso levanta: `processar` só levanta quando a própria escrita do
// desfecho falha, e aí o envelope encerra a execução com o erro gravado em
// `job_runs`.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o
// `call-place` entram por `PortaDoDespacho`, implementada em `index.ts` e
// dublada no teste.

import { lerChave, type FonteDeDiscagem } from '../_shared/chamada/idempotencia.ts'
import type { MotivoDaGuarda } from '../_shared/discagem/guarda.ts'
import { consumoDaFila, type ContaDaFila } from '../_shared/discagem/pausa.ts'
import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-dial'

/** Depois de quantas falhas transitórias o item vira `failed`. */
export const MAXIMO_DE_FALHAS = 6

/** O recuo cresce em dobro a partir de um minuto, até este teto. */
export const RECUO_MAXIMO_EM_MINUTOS = 60

/** Tamanho máximo de `last_error`: é o texto de quem investiga um item parado. */
const TAMANHO_DO_ERRO = 500

/**
 * Os motivos da guarda que chegam a `call_attempts` como recusa (os códigos
 * de `MOTIVO_POR_CODIGO` em `_shared/discagem/guarda.ts`). Ficam de fora
 * `telefone_invalido`, que é exceção da guarda e não recusa registrada, e
 * `guarda_indisponivel`, que é falha de consulta: nenhum dos dois deixou linha
 * em `call_attempts`, e tratá-los como recusa encerraria o item sem rastro.
 */
const RECUSAS_DA_GUARDA: ReadonlySet<string> = new Set([
  'freio_puxado',
  'portao_de_lead_real',
  'numero_bloqueado',
  'fora_da_janela',
  'intervalo_minimo',
  'teto_por_numero',
  'teto_da_conta',
  'teto_de_gasto',
  'sem_linha_disponivel',
] satisfies readonly MotivoDaGuarda[])

/**
 * Os motivos de `call-place` que nenhuma repetição conserta: o pedido está
 * torto, ou aponta para algo que não existe. Lista fechada, e o que não está
 * aqui é transitório — errar para o lado da repetição custa um recuo; errar
 * para o lado da falha perde uma discagem que a conta pediu.
 */
const RECUSAS_DEFINITIVAS: ReadonlySet<string> = new Set([
  'conta_ausente',
  'proposito_invalido',
  'fonte_invalida',
  'referencia_invalida',
  'destino_ausente',
  'pulo_invalido',
  'fonte_de_gente',
  'conta_desconhecida',
  'lead_desconhecido',
  'telefone_invalido',
])

/** Uma linha de `dial_queue`, no recorte que a rotina lê. */
export interface ItemDaFila {
  readonly id: string
  readonly account_id: string
  readonly lead_id: string | null
  readonly purpose: string
  readonly source: string
  readonly source_ref: string
  readonly attempt: number
  readonly failures: number
}

/** Uma linha de `situacao_da_fila`. */
export interface ContaNaFila extends ContaDaFila {
  readonly account_id: string
  readonly max_concurrent: number
  /** Chamadas no ar mais itens tomados sem chamada, contados no banco. */
  readonly ativas: number
}

/** O corpo que `call-place` lê, nas chaves que o `index.ts` dele aceita. */
export interface PedidoAoCallPlace {
  readonly contaId: string
  readonly proposito: string
  readonly fonte: FonteDeDiscagem
  readonly referencia: string
  readonly ordinal: number | null
  /** `dial_queue.attempt`: da segunda em diante, a chave de `calls` ganha o sufixo (US-189). */
  readonly tentativa: number
  readonly leadId: string | null
  readonly motivo: string
}

/** O que volta de `call-place`: status e corpo, que chega pela rede e é `unknown`. */
export interface RespostaDoCallPlace {
  readonly status: number
  readonly corpo: unknown
}

export interface PortaDoDespacho {
  /** `situacao_da_fila(instante)`: contas com item pronto, a mais antiga primeiro. */
  situacaoDaFila(instante: string): Promise<readonly ContaNaFila[]>
  /**
   * `reivindicar_da_fila`: toma até `limite` itens prontos da conta com
   * `for update skip locked`, já `claimed` e com `claimed_at`.
   */
  reivindicarDaConta(contaId: string, limite: number, instante: string): Promise<readonly ItemDaFila[]>
  /** Chama `call-place` com o segredo interno. */
  discar(pedido: PedidoAoCallPlace): Promise<RespostaDoCallPlace>
  /** `done`, com a chamada quando houve. */
  concluirItem(id: string, fim: { readonly call_id: string | null; readonly last_error: string | null }): Promise<void>
  /** `failed`, com o motivo. */
  falharItem(id: string, fim: { readonly last_error: string; readonly failures: number }): Promise<void>
  /**
   * O pré-contato por WhatsApp (`_shared/whatsapp/pre-contato.ts`), chamado
   * depois que a ligação saiu. Opcional: sem ele, nada muda. Falha aqui nunca
   * muda o desfecho do item: a ligação já saiu.
   */
  preContato?(item: ItemDaFila): Promise<void>
  /** De volta a `queued`, sem `claimed_at`, com `run_at` à frente. */
  reprogramarItem(
    id: string,
    fim: { readonly run_at: string; readonly last_error: string; readonly failures: number },
  ): Promise<void>
}

/** O que a resposta de `call-place` vira para o item. */
export type DesfechoDoItem =
  | { readonly tipo: 'discada'; readonly chamadaId: string; readonly erro: string | null }
  | { readonly tipo: 'recusada'; readonly motivo: string }
  | { readonly tipo: 'definitiva'; readonly motivo: string }
  | { readonly tipo: 'transitoria'; readonly motivo: string }

/** Quantos itens a conta ainda cabe agora. Zero para conta parada. */
export function vagasDaConta(conta: ContaNaFila): number {
  if (!consumoDaFila(conta).consumir) return 0
  return Math.max(0, conta.max_concurrent - conta.ativas)
}

/** O recuo depois da falha de número `falhas` (a primeira é 1), em minutos. */
export function recuoEmMinutos(falhas: number): number {
  return Math.min(RECUO_MAXIMO_EM_MINUTOS, 2 ** Math.max(0, falhas - 1))
}

/**
 * O pedido a `call-place` a partir da linha da fila. A chave se lê da linha
 * sem tradutor (T-07): `source:source_ref` é exatamente a chave de
 * idempotência que `call-place` vai formar. Linha cuja chave não se lê devolve
 * nulo, e é recusa definitiva sem ir a `call-place`.
 */
export function pedidoDoItem(item: ItemDaFila): PedidoAoCallPlace | null {
  const leitura = lerChave(`${item.source}:${item.source_ref}`)
  if (!leitura.ok) return null

  const chave = leitura.pedido
  let referencia: string
  let ordinal: number | null = null
  switch (chave.fonte) {
    case 'manual':
      referencia = chave.uuidDoCliente
      break
    case 'stl':
      referencia = chave.leadId
      break
    case 'rem':
      referencia = chave.meetingId
      break
    case 'rescue':
      referencia = chave.meetingId
      ordinal = chave.ordinal
      break
    case 'cad':
      referencia = chave.enrollmentId
      ordinal = chave.passo
      break
    case 'camp':
      referencia = chave.targetId
      ordinal = chave.tentativa
      break
  }

  return {
    contaId: item.account_id,
    proposito: item.purpose,
    fonte: chave.fonte,
    referencia,
    ordinal,
    tentativa: item.attempt,
    leadId: item.lead_id,
    motivo: `fila de discagem, item ${item.id}`,
  }
}

/** A resposta de `call-place` (ou a falta dela) no desfecho do item. */
export function desfechoDaResposta(resposta: RespostaDoCallPlace | null, erro?: unknown): DesfechoDoItem {
  if (!resposta) return { tipo: 'transitoria', motivo: mensagemDe(erro ?? 'call-place não respondeu') }

  const corpo = (typeof resposta.corpo === 'object' && resposta.corpo !== null
    ? resposta.corpo
    : {}) as Record<string, unknown>
  const chamadaId = typeof corpo.chamadaId === 'string' && corpo.chamadaId !== '' ? corpo.chamadaId : null
  const motivo = typeof corpo.motivo === 'string' && corpo.motivo !== '' ? corpo.motivo : null

  if (corpo.ok === true) {
    if (chamadaId) return { tipo: 'discada', chamadaId, erro: null }
    return { tipo: 'transitoria', motivo: 'call-place aceitou sem devolver a chamada' }
  }

  // O provedor falhou depois do insert: a chamada existe e é da recuperação.
  if (chamadaId) return { tipo: 'discada', chamadaId, erro: motivo ?? `status ${resposta.status}` }

  if (motivo && RECUSAS_DA_GUARDA.has(motivo)) return { tipo: 'recusada', motivo }
  if (motivo && RECUSAS_DEFINITIVAS.has(motivo)) return { tipo: 'definitiva', motivo }
  return { tipo: 'transitoria', motivo: motivo ?? `status ${resposta.status}` }
}

interface ItemReivindicado extends ItemDaRotina {
  readonly linha: ItemDaFila
}

export interface PedidoDeDespacho {
  readonly porta: PortaDoDespacho
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-dial`, dentro do envelope das rotinas. */
export function despacharFila(pedido: PedidoDeDespacho): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  const agora = pedido.agora ?? Date.now

  return executarRotina<ItemReivindicado>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const contas = await porta.situacaoDaFila(instante)
        const tomados: ItemReivindicado[] = []
        for (const conta of contas) {
          const restante = limite - tomados.length
          if (restante <= 0) break
          const vagas = vagasDaConta(conta)
          if (vagas === 0) continue
          const itens = await porta.reivindicarDaConta(conta.account_id, Math.min(vagas, restante), instante)
          for (const linha of itens) tomados.push({ chave: linha.id, linha })
        }
        return tomados
      },

      async processar({ linha }, instante) {
        const pedidoAoCallPlace = pedidoDoItem(linha)
        let desfecho: DesfechoDoItem
        if (!pedidoAoCallPlace) {
          desfecho = { tipo: 'definitiva', motivo: 'referencia_invalida' }
        } else {
          try {
            desfecho = desfechoDaResposta(await porta.discar(pedidoAoCallPlace))
          } catch (erro) {
            desfecho = desfechoDaResposta(null, erro)
          }
        }
        await registrarDesfecho(porta, linha, desfecho, instante)
        // O pré-contato só depois da guarda: antes dela, a mensagem prometeria
        // uma ligação que a guarda pode recusar.
        if (desfecho.tipo === 'discada' && desfecho.erro === null && porta.preContato) {
          try {
            await porta.preContato(linha)
          } catch {
            // Cortesia que falha não muda o item: ver `pre-contato.ts`.
          }
        }
      },
    },
  })
}

async function registrarDesfecho(
  porta: PortaDoDespacho,
  linha: ItemDaFila,
  desfecho: DesfechoDoItem,
  instante: string,
): Promise<void> {
  switch (desfecho.tipo) {
    case 'discada':
      await porta.concluirItem(linha.id, {
        call_id: desfecho.chamadaId,
        last_error: desfecho.erro === null ? null : cortar(`provedor: ${desfecho.erro}`),
      })
      return
    case 'recusada':
      await porta.concluirItem(linha.id, {
        call_id: null,
        last_error: cortar(`recusa da guarda: ${desfecho.motivo}`),
      })
      return
    case 'definitiva':
      await porta.falharItem(linha.id, {
        last_error: cortar(`recusa definitiva: ${desfecho.motivo}`),
        failures: linha.failures,
      })
      return
    case 'transitoria': {
      const falhas = linha.failures + 1
      const erro = cortar(`falha ${falhas} de ${MAXIMO_DE_FALHAS}: ${desfecho.motivo}`)
      if (falhas >= MAXIMO_DE_FALHAS) {
        await porta.falharItem(linha.id, { last_error: erro, failures: falhas })
        return
      }
      const runAt = new Date(Date.parse(instante) + recuoEmMinutos(falhas) * 60_000).toISOString()
      await porta.reprogramarItem(linha.id, { run_at: runAt, last_error: erro, failures: falhas })
      return
    }
  }
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
 * porta: sem ele, nem `job_runs` recebe linha, porque acordar a rotina é
 * discar.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  despacho: PedidoDeDespacho,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await despacharFila(despacho)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}

function mensagemDe(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : String(erro)
  return texto.trim() === '' ? 'erro sem mensagem' : texto
}

function cortar(texto: string): string {
  return texto.slice(0, TAMANHO_DO_ERRO)
}
