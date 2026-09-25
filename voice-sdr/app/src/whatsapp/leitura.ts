/**
 * A leitura pura de `whatsapp_conversations` e `whatsapp_messages`, sem
 * React nem rede: o que casa com o domínio vira o tipo da tela, e o que não
 * casa fica de fora, nunca `undefined` desenhado no meio de um balão.
 */

import type {
  AutorDaMensagem,
  ConversaDaLista,
  ConversaDetalhe,
  DirecaoDaMensagem,
  EstadoDaLeitura,
  FiltroDeStatus,
  MensagemDaConversa,
  StatusDaConversa,
  StatusDaMensagem,
  TipoDeMidia,
} from '@/whatsapp/tipos'

export const STATUS_DA_CONVERSA: readonly StatusDaConversa[] = ['assistente', 'humano', 'encerrada']

/** O filtro da tela: os três status mais "todas". */
export const FILTROS_DE_STATUS: readonly FiltroDeStatus[] = ['todas', ...STATUS_DA_CONVERSA]

const TIPOS_DE_MIDIA: readonly TipoDeMidia[] = [
  'audio',
  'imagem',
  'video',
  'documento',
  'figurinha',
  'localizacao',
  'contato',
  'outro',
]

function umDe<T extends string>(valor: unknown, validos: readonly T[]): T | null {
  return typeof valor === 'string' && (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : null
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const aparado = valor.trim()
  return aparado === '' ? null : aparado
}

export interface LinhaDaConversa {
  id: string
  lead_id: string | null
  phone_e164: string
  status: string
  purpose: string | null
  started_by: string | null
  last_message_at: string
  created_at: string
  leads?: { name: string | null } | { name: string | null }[] | null
}

export interface LinhaDaMensagem {
  id: string
  direction: string
  author: string
  body: string | null
  media_kind: string | null
  media_text?: string | null
  media_status?: string | null
  status: string
  error: string | null
  created_at: string
}

/** A tabela embutida pelo PostgREST: objeto, lista de um ou nulo. */
function embutido(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return valor.length ? (valor[0] as Record<string, unknown>) : null
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null
}

function nomeDoLead(linha: LinhaDaConversa): string | null {
  return texto(embutido(linha.leads)?.name)
}

export function paraMensagem(linha: LinhaDaMensagem): MensagemDaConversa | null {
  const direcao = umDe<DirecaoDaMensagem>(linha.direction, ['in', 'out'])
  const autor = umDe<AutorDaMensagem>(linha.author, ['lead', 'assistente', 'humano', 'sistema'])
  const status = umDe<StatusDaMensagem>(linha.status, [
    'recebida',
    'enviada',
    'entregue',
    'lida',
    'falhou',
  ])
  if (direcao === null || autor === null || status === null) return null

  return {
    id: linha.id,
    direcao,
    autor,
    corpo: linha.body ?? '',
    midia: umDe<TipoDeMidia>(linha.media_kind, TIPOS_DE_MIDIA),
    leituraDaMidia: texto(linha.media_text),
    estadoDaLeitura: umDe<EstadoDaLeitura>(linha.media_status ?? null, ['pendente', 'lida', 'falhou']),
    status,
    erro: texto(linha.error),
    criadaEm: linha.created_at,
  }
}

export function paraConversaDaLista(linha: LinhaDaConversa): ConversaDaLista | null {
  const status = umDe<StatusDaConversa>(linha.status, STATUS_DA_CONVERSA)
  if (status === null) return null

  return {
    id: linha.id,
    leadId: linha.lead_id,
    leadNome: nomeDoLead(linha),
    telefone: linha.phone_e164,
    status,
    proposito: texto(linha.purpose),
    // A prévia entra depois, de uma segunda consulta (a última mensagem por
    // conversa não é coluna nenhuma): ver `ultimaMensagemPorConversa`.
    ultimaMensagem: null,
    atualizadaEm: linha.last_message_at ?? linha.created_at,
  }
}

/**
 * A última mensagem de cada conversa, a partir de uma lista de mensagens
 * ordenada da mais recente para a mais antiga (a mesma ordem que a consulta
 * pede): a primeira ocorrência de cada `conversation_id` é a mais nova.
 */
export function ultimaMensagemPorConversa(
  linhas: readonly { conversation_id: string; body: string | null; media_kind: string | null; created_at: string }[],
): ReadonlyMap<string, { corpo: string; midia: TipoDeMidia | null; em: string }> {
  const mapa = new Map<string, { corpo: string; midia: TipoDeMidia | null; em: string }>()
  for (const linha of linhas) {
    if (mapa.has(linha.conversation_id)) continue
    mapa.set(linha.conversation_id, {
      corpo: linha.body ?? '',
      midia: umDe<TipoDeMidia>(linha.media_kind, TIPOS_DE_MIDIA),
      em: linha.created_at,
    })
  }
  return mapa
}

export function paraConversaDetalhe(
  linha: LinhaDaConversa,
  mensagens: MensagemDaConversa[],
): ConversaDetalhe | null {
  const status = umDe<StatusDaConversa>(linha.status, STATUS_DA_CONVERSA)
  if (status === null) return null

  return {
    id: linha.id,
    leadId: linha.lead_id,
    leadNome: nomeDoLead(linha),
    telefone: linha.phone_e164,
    status,
    proposito: texto(linha.purpose),
    iniciadaPor: umDe(linha.started_by, ['lead', 'assistente', 'humano'] as const),
    criadaEm: linha.created_at,
    mensagens,
  }
}

/** A lista ordenada: mais recente primeiro, pela última mensagem. */
export function ordenarConversas(conversas: readonly ConversaDaLista[]): ConversaDaLista[] {
  return [...conversas].sort((a, b) => (a.atualizadaEm < b.atualizadaEm ? 1 : -1))
}

export function filtrarPorStatus(
  conversas: readonly ConversaDaLista[],
  filtro: FiltroDeStatus,
): ConversaDaLista[] {
  return filtro === 'todas' ? [...conversas] : conversas.filter((item) => item.status === filtro)
}

/** O nome ou telefone que identifica a conversa na lista e no cabeçalho. */
export function identificacaoDaConversa(conversa: {
  leadNome: string | null
  telefone: string
}): string {
  return conversa.leadNome?.trim() || conversa.telefone
}
