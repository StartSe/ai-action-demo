// O evento da reunião no calendário do especialista (RF-508).
//
// Quem cria é `tool-book-meeting`, na mesma requisição do agendamento, depois
// do insert; quem tenta de novo é `cron-calendar-sync`, a cada passagem pelo
// calendário do especialista. As duas bordas falam com este módulo, e é por
// isso que a regra da nova tentativa existe uma vez só.
//
// Quatro regras seguram o arquivo:
//
// 1. **O evento não desfaz a reunião.** Falha ao criar grava a frase na linha
//    (`event_error`), soma a tentativa e agenda a próxima. Nada aqui levanta
//    para quem chamou: a Sarah já confirmou o horário ao lead.
// 2. **Idempotente por `external_event_id`** (RNF-06). Reunião que já tem
//    evento não vai ao calendário, e o adaptador deriva o id do evento do id da
//    reunião, então duas tentativas simultâneas (a ferramenta e a rotina)
//    chegam ao mesmo evento.
// 3. **Recuo com teto.** `RECUO_EM_MINUTOS` dá a espera depois de cada falha;
//    na tentativa `TETO_DE_TENTATIVAS` a próxima fica nula e a reunião passa a
//    ser a que desistiu, que a tela de reuniões mostra marcada.
// 4. **Só o necessário no evento**: horário, modalidade, sala, nome do lead,
//    resumo de passagem e as notas da marcação. Nem telefone, nem e-mail, nem
//    transcrição: o evento mora num calendário que outras pessoas podem ver.
//
// Portável: sem Deno, sem rede, sem banco.

import {
  falhaDoCalendario,
  protegerPorta,
  type EventoDaReuniao,
  type FalhaDoCalendario,
  type PortaDeCalendario,
} from './calendario.ts'

/** Espera, em minutos, depois da 1ª, 2ª, 3ª e 4ª falha. */
export const RECUO_EM_MINUTOS: readonly number[] = [1, 5, 15, 60]

/** Na 5ª falha a rotina desiste, e a reunião aparece marcada na tela. */
export const TETO_DE_TENTATIVAS = RECUO_EM_MINUTOS.length + 1

/** O que a borda lê do banco para montar o evento de uma reunião. */
export interface ReuniaoParaEvento {
  readonly id: string
  readonly account_id: string
  readonly specialist_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly modality: 'video' | 'telefone' | 'presencial'
  readonly notes: string | null
  readonly handoff_summary: unknown
  readonly external_event_id: string | null
  readonly event_attempts: number
  /** `leads.name`. */
  readonly nomeDoLead: string | null
  /** `specialists.room_url`. */
  readonly salaDoEspecialista: string | null
}

/**
 * O `select` do PostgREST que traz a reunião com o nome do lead e a sala do
 * especialista. As duas bordas o usam com `lerReuniaoParaEvento`, para a
 * leitura não existir em duas versões.
 */
export const SELECAO_DA_REUNIAO_PARA_EVENTO =
  'id, account_id, specialist_id, starts_at, ends_at, modality, notes, handoff_summary, external_event_id, event_attempts, leads(name), specialists(room_url)'

/** A linha do PostgREST, com os embutidos, como `ReuniaoParaEvento`. */
export function lerReuniaoParaEvento(linha: Readonly<Record<string, unknown>>): ReuniaoParaEvento {
  const embutido = (chave: string, campo: string): string | null => {
    const valor = linha[chave]
    const objeto = Array.isArray(valor) ? valor[0] : valor
    const lido = objeto && typeof objeto === 'object' ? (objeto as Record<string, unknown>)[campo] : null
    return typeof lido === 'string' ? lido : null
  }
  const texto = (chave: string): string | null => (typeof linha[chave] === 'string' ? (linha[chave] as string) : null)
  return {
    id: String(linha.id),
    account_id: String(linha.account_id),
    specialist_id: String(linha.specialist_id),
    starts_at: String(linha.starts_at),
    ends_at: String(linha.ends_at),
    modality: linha.modality as ReuniaoParaEvento['modality'],
    notes: texto('notes'),
    handoff_summary: linha.handoff_summary ?? null,
    external_event_id: texto('external_event_id'),
    event_attempts: typeof linha.event_attempts === 'number' ? linha.event_attempts : 0,
    nomeDoLead: embutido('leads', 'name'),
    salaDoEspecialista: embutido('specialists', 'room_url'),
  }
}

export interface FalhaDoEvento {
  readonly tentativas: number
  /** A frase já traduzida do calendário, para `event_error`. */
  readonly erro: string
  /** Nula quando as tentativas chegaram ao teto. */
  readonly proximaTentativa: string | null
}

/** O que o módulo escreve. Implementado no `index.ts` de cada borda. */
export interface PortaDoEventoDaReuniao {
  /** Grava `external_event_id` só onde ele está nulo, e zera erro e próxima tentativa. */
  gravarEvento(contaId: string, reuniaoId: string, externalEventId: string): Promise<void>
  /** Grava `event_attempts`, `event_error` e `event_retry_at`. */
  registrarFalhaDoEvento(contaId: string, reuniaoId: string, falha: FalhaDoEvento): Promise<void>
  /** Zera `external_event_id` depois de o evento sair do calendário. */
  esquecerEvento(contaId: string, reuniaoId: string): Promise<void>
}

export type DesfechoDoEvento =
  | { readonly situacao: 'ja_existia'; readonly externalEventId: string }
  | { readonly situacao: 'criado'; readonly externalEventId: string }
  | { readonly situacao: 'falhou'; readonly falha: FalhaDoEvento }
  | { readonly situacao: 'sem_calendario' }

const NOME_DA_MODALIDADE: Record<ReuniaoParaEvento['modality'], string> = {
  video: 'Vídeo',
  telefone: 'Telefone',
  presencial: 'Presencial',
}

/**
 * O resumo de passagem como texto. Ele ainda não tem forma fixa (é da
 * finalização da chamada), então texto passa como veio, `{ resumo }` ou
 * `{ texto }` passam pelo campo, e o resto fica de fora em vez de virar JSON
 * cru no calendário de alguém.
 */
export function textoDoResumo(resumo: unknown): string | null {
  if (typeof resumo === 'string') return resumo.trim() || null
  if (resumo && typeof resumo === 'object') {
    for (const chave of ['resumo', 'texto', 'summary']) {
      const valor = (resumo as Record<string, unknown>)[chave]
      if (typeof valor === 'string' && valor.trim()) return valor.trim()
    }
  }
  return null
}

/** O evento como vai para a porta. Registro de interface: direto, sem travessão. */
export function montarEventoDaReuniao(reuniao: ReuniaoParaEvento): EventoDaReuniao {
  const nome = reuniao.nomeDoLead?.trim() || 'lead sem nome'
  const sala = reuniao.salaDoEspecialista?.trim() || null
  const resumo = textoDoResumo(reuniao.handoff_summary)
  const notas = reuniao.notes?.trim() || null
  const linhas = [
    `Modalidade: ${NOME_DA_MODALIDADE[reuniao.modality]}`,
    ...(sala ? [`Sala: ${sala}`] : []),
    ...(resumo ? ['', 'Resumo de passagem:', resumo] : []),
    ...(notas ? ['', 'Notas da marcação:', notas] : []),
    '',
    'Marcada pela assistente.',
  ]
  return {
    reuniaoId: reuniao.id,
    inicio: reuniao.starts_at,
    fim: reuniao.ends_at,
    titulo: `Reunião com ${nome}`,
    descricao: linhas.join('\n'),
    local: sala,
  }
}

/** A falha depois de `tentativas` idas sem sucesso, com a próxima pelo recuo. */
export function falhaDepoisDe(tentativas: number, erro: string, agoraMs: number): FalhaDoEvento {
  const espera = tentativas < TETO_DE_TENTATIVAS ? RECUO_EM_MINUTOS[tentativas - 1] : undefined
  return {
    tentativas,
    erro,
    proximaTentativa: espera === undefined ? null : new Date(agoraMs + espera * 60_000).toISOString(),
  }
}

/** Reunião ativa que chegou ao teto sem evento: a que a tela mostra marcada. */
export function eventoDesistiu(reuniao: Pick<ReuniaoParaEvento, 'external_event_id' | 'event_attempts'>): boolean {
  return reuniao.external_event_id === null && reuniao.event_attempts >= TETO_DE_TENTATIVAS
}

export interface PedidoDoEvento {
  readonly reuniao: ReuniaoParaEvento
  /** Nulo: especialista sem calendário conectado, e não há onde criar. */
  readonly calendario: PortaDeCalendario | FalhaDoCalendario | null
  readonly porta: PortaDoEventoDaReuniao
  readonly agora: () => number
}

/**
 * Cria o evento da reunião, ou registra por que não criou. Nunca levanta pelo
 * calendário; só a própria escrita no banco pode levantar, e quem chama decide
 * o que fazer com isso (a ferramenta registra e segue).
 */
export async function criarEventoDaReuniao(pedido: PedidoDoEvento): Promise<DesfechoDoEvento> {
  const { reuniao, calendario, porta } = pedido
  if (reuniao.external_event_id !== null) {
    return { situacao: 'ja_existia', externalEventId: reuniao.external_event_id }
  }
  if (calendario === null) return { situacao: 'sem_calendario' }

  const resultado =
    'ok' in calendario ? calendario : await protegerPorta(calendario).criarEvento(montarEventoDaReuniao(reuniao))
  if (resultado.ok) {
    await porta.gravarEvento(reuniao.account_id, reuniao.id, resultado.valor.externalEventId)
    return { situacao: 'criado', externalEventId: resultado.valor.externalEventId }
  }

  const falha = falhaDepoisDe(reuniao.event_attempts + 1, resultado.mensagem, pedido.agora())
  await porta.registrarFalhaDoEvento(reuniao.account_id, reuniao.id, falha)
  return { situacao: 'falhou', falha }
}

export type DesfechoDoApagamento =
  | { readonly ok: true; readonly situacao: 'apagado' | 'sem_evento' }
  | FalhaDoCalendario

/**
 * Apaga o evento de uma reunião cancelada pelo `external_event_id`. Sem evento
 * não há o que apagar; calendário que falha devolve a falha e a linha fica com
 * o id, para quem chamou tentar de novo.
 */
export async function apagarEventoDaReuniao(pedido: {
  readonly reuniao: Pick<ReuniaoParaEvento, 'id' | 'account_id' | 'external_event_id'>
  readonly calendario: PortaDeCalendario | FalhaDoCalendario | null
  readonly porta: PortaDoEventoDaReuniao
}): Promise<DesfechoDoApagamento> {
  const { reuniao, calendario, porta } = pedido
  if (reuniao.external_event_id === null) return { ok: true, situacao: 'sem_evento' }
  if (calendario === null) return falhaDoCalendario('nao_conectado')
  if ('ok' in calendario) return calendario

  const resultado = await protegerPorta(calendario).apagarEvento(reuniao.external_event_id)
  if (!resultado.ok) return resultado
  await porta.esquecerEvento(reuniao.account_id, reuniao.id)
  return { ok: true, situacao: 'apagado' }
}
