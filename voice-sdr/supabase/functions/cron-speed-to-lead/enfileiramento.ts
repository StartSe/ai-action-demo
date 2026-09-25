// cron-speed-to-lead: o lead que acabou de chegar pelo formulário vira item de
// `dial_queue` dentro da janela que a conta configurou (RF-610, seção 4.6).
//
// **Esta rotina enfileira e não disca.** Quem disca é `cron-dial`, o único
// consumidor da fila (L-14); a varredura de `cron-dial/despacho.test.ts`
// reprova qualquer outra função que chame `call-place`. A pressa do lead novo
// não fura nada do que a guarda decide — janela de discagem, bloqueio, tetos —
// porque o item passa pela mesma `guard_dial` que qualquer outro.
//
// **Por que aqui, e não em `lead-intake`.** A F1 deliberadamente não enfileirou
// (está escrito no cabeçalho de `lead-intake/entrada.ts`): `dial_queue` e esta
// rotina eram da F2, e escrever numa tabela que não existia era código morto.
// Esta história fecha o par, e por uma rotina em vez de uma linha a mais no
// intake, por três razões:
//
// 1. O lead gravado e a ligação enfileirada são efeitos diferentes. No intake,
//    falhar em enfileirar obrigaria a escolher entre desfazer o lead ou
//    devolver sucesso escondendo a falha; aqui, a rotina do minuto seguinte
//    tenta de novo e o lead nunca some.
// 2. A decisão lê `account_settings` num lugar só. A janela de resposta, o
//    sinalizador e as recusas de lead inelegível vivem neste módulo, e não
//    espalhados por cada caminho que cria lead.
// 3. O freio de R-09 fica no banco: `dial_queue_unica_por_fonte` (US-054) é
//    único em (conta, `stl`, lead, tentativa 1). O intake que recebe o mesmo
//    formulário duas vezes não cria lead novo (a duplicata preenche o
//    existente), e duas passagens sobrepostas desta rotina que leiam o mesmo
//    lead escrevem a mesma chave — a segunda é `ja_existia`, e nunca uma
//    segunda ligação.
//
// **Só quando a conta pede.** `speed_to_lead_enabled` falso não enfileira
// nada. A consulta de candidatos já filtra por ele, que é o que impede conta
// desligada de gastar o teto de 25 da passagem; o módulo confere de novo, e a
// conferência é o que o teste mede.
//
// **A janela de resposta conta da criação do lead.** Dentro de
// `speed_to_lead_minutes`, enfileira; passado o prazo, registra e ignora. Ligar
// duas horas depois dizendo que viu o pedido agora é pior do que não ligar — a
// ligação fora da janela é outra conversa, e quem a decide é a cadência (F6).
//
// **Lead inelegível não entra na fila, e fica registrado com a razão.** Lead
// mesclado (quem responde pelo número é o destino), bloqueado (na própria linha
// ou na lista de não perturbe) e sem telefone que `_shared/telefone.ts` aceite.
// A guarda recusaria todos depois, mas enfileirar para ser recusado enche a
// fila de lixo e gasta uma linha de `call_attempts` por lead. O registro vai
// para `speed_to_lead_skips`, que é também o que tira o lead da consulta da
// passagem seguinte: sem ele, o mesmo lead fora da janela seria examinado e
// registrado a cada minuto até sair do horizonte.
//
// A precedência entre as razões é a ordem de `ELEGIBILIDADE`, e a janela vem
// por último: lead bloqueado que também passou do prazo é registrado como
// bloqueado, porque é essa a razão que responde "por que a Sarah não ligou".
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados entra por
// `PortaDoFalaRapido`, implementada em `index.ts` e dublada no teste.

import { chaveDeDiscagem } from '../_shared/chamada/idempotencia.ts'
import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'
import { normalizarTelefone } from '../_shared/telefone.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-speed-to-lead'

/** A fonte desta rotina em `dial_queue.source` (T-07). */
export const FONTE = 'stl'

/** Uma linha de `candidatos_do_fala_rapido`. */
export interface LeadCandidato {
  readonly lead_id: string
  readonly account_id: string
  readonly phone_e164: string
  /** ISO. É daqui que a janela de resposta conta. */
  readonly created_at: string
  /** `leads.blocked_at` preenchido ou número na lista de não perturbe ativa. */
  readonly bloqueado: boolean
  /** `leads.merged_into_id` preenchido. */
  readonly mesclado: boolean
  readonly speed_to_lead_enabled: boolean
  readonly speed_to_lead_minutes: number
}

/** A linha que vai para `dial_queue`, nas chaves da tabela. */
export interface LinhaDaFila {
  readonly account_id: string
  readonly lead_id: string
  readonly purpose: 'discovery'
  readonly source: typeof FONTE
  readonly source_ref: string
  readonly attempt: 1
}

/** Por que um lead não virou item de fila. */
export type MotivoDeIgnorar = 'mesclado' | 'bloqueado' | 'telefone_invalido' | 'fora_da_janela'

/** O código de cada motivo em `speed_to_lead_skips.reason`. */
export const CODIGO_DO_MOTIVO: Readonly<Record<MotivoDeIgnorar, string>> = {
  mesclado: 'merged',
  bloqueado: 'blocked',
  telefone_invalido: 'invalid_phone',
  fora_da_janela: 'outside_window',
}

/** A linha de `speed_to_lead_skips`. */
export interface LinhaIgnorada {
  readonly lead_id: string
  readonly account_id: string
  readonly reason: string
  readonly detail: string
}

export interface PortaDoFalaRapido {
  /**
   * `candidatos_do_fala_rapido(instante, limite)`: leads do formulário das
   * contas com o fala-rápido ligado, criados no horizonte, sem item `stl` na
   * fila e sem registro de ignorado. O mais novo primeiro, até `limite`.
   */
  candidatos(instante: string, limite: number): Promise<readonly LeadCandidato[]>
  /**
   * Insere na fila com `on conflict do nothing` no único de R-09. `criado`
   * quando a linha entrou, `ja_existia` quando o único a barrou.
   */
  enfileirar(linha: LinhaDaFila): Promise<'criado' | 'ja_existia'>
  /** Insere em `speed_to_lead_skips` com `on conflict do nothing`. */
  registrarIgnorado(linha: LinhaIgnorada): Promise<void>
}

/** O que o módulo decide para um candidato. */
export type DecisaoDoLead =
  | { readonly tipo: 'enfileirar'; readonly linha: LinhaDaFila }
  | { readonly tipo: 'ignorar'; readonly motivo: MotivoDeIgnorar; readonly detalhe: string }
  | { readonly tipo: 'conta_desligada' }

/** As recusas de lead inelegível, na ordem em que se conferem. */
const ELEGIBILIDADE: readonly {
  readonly motivo: MotivoDeIgnorar
  readonly recusa: (lead: LeadCandidato) => string | null
}[] = [
  {
    motivo: 'mesclado',
    recusa: (lead) => (lead.mesclado ? 'lead mesclado em outro; quem responde pelo número é o destino' : null),
  },
  {
    motivo: 'bloqueado',
    recusa: (lead) => (lead.bloqueado ? 'lead bloqueado ou número na lista de não perturbe' : null),
  },
  {
    motivo: 'telefone_invalido',
    recusa: (lead) => {
      const numero = normalizarTelefone(lead.phone_e164)
      return numero.ok ? null : `telefone não normaliza: ${numero.motivo}`
    },
  },
]

/** Decide o que fazer com um candidato no instante da passagem. Não grava. */
export function decidirLead(lead: LeadCandidato, instante: string): DecisaoDoLead {
  if (!lead.speed_to_lead_enabled) return { tipo: 'conta_desligada' }

  for (const regra of ELEGIBILIDADE) {
    const detalhe = regra.recusa(lead)
    if (detalhe !== null) return { tipo: 'ignorar', motivo: regra.motivo, detalhe }
  }

  const criadoEm = Date.parse(lead.created_at)
  const agora = Date.parse(instante)
  if (Number.isNaN(criadoEm)) {
    throw new Error(`lead ${lead.lead_id} com created_at ilegível: ${lead.created_at}`)
  }
  const prazo = criadoEm + lead.speed_to_lead_minutes * 60_000
  if (agora > prazo) {
    const atraso = Math.round((agora - criadoEm) / 60_000)
    return {
      tipo: 'ignorar',
      motivo: 'fora_da_janela',
      detalhe: `examinado ${atraso} min depois de chegar, com janela de resposta de ${lead.speed_to_lead_minutes} min`,
    }
  }

  // `source_ref` é o lead, e `stl:<lead>` é a chave que `cron-dial` vai ler da
  // linha para `call-place` (T-07). Formar a chave pelo módulo de T-07 é a
  // conferência de que o id tem a forma que a leitura aceita: id torto levanta
  // aqui, em vez de entrar na fila e virar recusa definitiva lá.
  chaveDeDiscagem({ fonte: 'stl', leadId: lead.lead_id })
  return {
    tipo: 'enfileirar',
    linha: {
      account_id: lead.account_id,
      lead_id: lead.lead_id,
      purpose: 'discovery',
      source: FONTE,
      source_ref: lead.lead_id,
      attempt: 1,
    },
  }
}

interface CandidatoReivindicado extends ItemDaRotina {
  readonly lead: LeadCandidato
}

export interface PedidoDeEnfileiramento {
  readonly porta: PortaDoFalaRapido
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-speed-to-lead`, dentro do envelope das rotinas. */
export function enfileirarLeadsNovos(pedido: PedidoDeEnfileiramento): Promise<ResultadoDaExecucao> {
  const { porta } = pedido

  return executarRotina<CandidatoReivindicado>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora: pedido.agora,
    trabalho: {
      // Aqui a reivindicação é leitura, e não `for update skip locked`: o
      // estado pendente do lead é a *ausência* de linha (nem item `stl` na
      // fila, nem registro de ignorado), e não há linha pendente para travar.
      // O que torna inofensiva a sobreposição de duas passagens (P-09) é o
      // único da fila e a chave primária de `speed_to_lead_skips`: as duas
      // escrevem a mesma chave, e a segunda não tem efeito.
      async reivindicar(limite, instante) {
        const candidatos = await porta.candidatos(instante, limite)
        return candidatos.map((lead) => ({ chave: lead.lead_id, lead }))
      },

      async processar({ lead }, instante) {
        const decisao = decidirLead(lead, instante)
        switch (decisao.tipo) {
          case 'conta_desligada':
            return
          case 'ignorar':
            await porta.registrarIgnorado({
              lead_id: lead.lead_id,
              account_id: lead.account_id,
              reason: CODIGO_DO_MOTIVO[decisao.motivo],
              detail: decisao.detalhe,
            })
            return
          case 'enfileirar':
            await porta.enfileirar(decisao.linha)
            return
        }
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

/** O que o `index.ts` chama. O segredo é conferido antes de tocar em qualquer porta. */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  enfileiramento: PedidoDeEnfileiramento,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await enfileirarLeadsNovos(enfileiramento)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
