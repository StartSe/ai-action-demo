/**
 * A linha do tempo da ficha do lead (US-147, RF-113, quarto critério da F4).
 *
 * **Uma lista, uma comparação.** Ligação, mudança de etapa, bloqueio, nota e
 * reunião viram `ItemDaLinhaDoTempo` e se ordenam por `compararItens`, e só
 * por ela: `occurred_at` do mais recente para o mais antigo, depois `kind`,
 * depois `id`. Os dois desempates existem para a ordem não dançar entre
 * recargas — dois eventos no mesmo instante (o bloqueio e a nota que o
 * explica) sairiam em ordem de chegada do banco, que não é contrato.
 *
 * **A fonte é `lead_events`.** A ligação entra pelo evento `call`, que aponta a
 * chamada (`call_id`); a linha de `calls` só completa o que o evento não sabe
 * (duração de agora, gravação ainda no ar ou expurgada). Sem a linha, o item
 * se desenha pelo retrato do evento, e nunca some.
 *
 * **A história não se reescreve.** A mudança de etapa diz o rótulo gravado no
 * `payload` do evento, o de então, e não o rótulo atual da etapa: renomear
 * "Qualificado" para "Tem fit" não muda o que aconteceu na semana passada.
 *
 * **Nenhum item vazio.** Evento que não tem o que dizer (nota sem texto,
 * mudança sem destino, `kind` que a tela não conhece) fica fora da lista, em
 * vez de virar uma linha em branco. `lead_updated` e `merged` ficam fora pela
 * mesma razão: "o lead foi atualizado" sem dizer o quê não ajuda a decidir o
 * próximo passo.
 */

export type AtorDoEvento = 'user' | 'agent' | 'system'

/** Uma linha de `lead_events` como o serviço a lê, sem interpretar o payload. */
export interface EventoDoLead {
  id: string
  /** `lead_events.kind`. */
  kind: string
  /** `occurred_at`, em ISO 8601. */
  ocorridoEm: string
  ator: AtorDoEvento
  /** `actor_id`: quem agiu, quando foi gente. */
  autorId: string | null
  /** `call_id`: a chamada que o evento aponta. */
  chamadaId: string | null
  payload: Readonly<Record<string, unknown>>
}

/** A linha de `calls` que o evento `call` aponta, no recorte que a ficha desenha. */
export interface LigacaoDoLead {
  id: string
  direcao: string
  proposito: string
  iniciadaEm: string
  duracaoSeg: number | null
  motivoDoFim: string | null
  caminhoDaGravacao: string | null
  gravacaoExpiraEm: string | null
}

/**
 * Uma reunião do lead. O tipo já existe para a lista a aceitar no dia em que a
 * agenda (F5) encher `meetings`; até lá o serviço não manda nenhuma, e a razão
 * está no cabeçalho de `app/src/copy/lead.ts`.
 */
export interface ReuniaoDoLead {
  id: string
  /** Início da reunião, em ISO 8601. */
  em: string
  estado: string
}

export interface AutorDoItem {
  ator: AtorDoEvento
  /** O nome de quem agiu, quando foi gente e ainda é membro da conta. */
  nome: string | null
}

interface BaseDoItem {
  id: string
  /** O `kind` do evento, que é o segundo critério da ordem. */
  kind: string
  em: string
}

/**
 * As seis ações que `lead_events` grava com `kind = 'whatsapp'`
 * (`supabase/functions/_shared`, migração do canal): a conversa nasceu, foi
 * assumida por gente, voltou para a assistente, foi encerrada, o pré-contato
 * foi avisado antes de uma ligação, ou o lead pediu para falar com alguém
 * (que é também o que abre item na fila, kind `pedido_humano`). Ação que a
 * tela ainda não conhece vira `null` em `itemDoEvento` e cai no genérico da
 * copy, em vez de sumir — é o "trata desconhecido sem quebrar".
 */
export type AcaoDoWhatsapp =
  | 'iniciada'
  | 'assumida'
  | 'devolvida'
  | 'encerrada'
  | 'pre_contato'
  | 'pedido_humano'

/**
 * As ações que `lead_events` grava com `kind = 'automation'` (F6): a decisão
 * de uma rotina ou de uma ferramenta sobre o lead. Ação desconhecida vira
 * `null` e cai no genérico da copy.
 */
export type AcaoDaAutomacao =
  | 'retentativas_esgotadas'
  | 'resgates_esgotados'
  | 'reuniao_confirmada'
  | 'reuniao_remarcada'
  | 'reuniao_cancelada'

const ACOES_DA_AUTOMACAO: readonly AcaoDaAutomacao[] = [
  'retentativas_esgotadas',
  'resgates_esgotados',
  'reuniao_confirmada',
  'reuniao_remarcada',
  'reuniao_cancelada',
]

export type ItemDaLinhaDoTempo =
  | (BaseDoItem & { tipo: 'ligacao'; ligacao: LigacaoDoLead })
  | (BaseDoItem & { tipo: 'etapa'; de: string | null; para: string; autor: AutorDoItem })
  | (BaseDoItem & { tipo: 'bloqueio'; motivo: string | null; autor: AutorDoItem })
  | (BaseDoItem & { tipo: 'desbloqueio'; autor: AutorDoItem })
  | (BaseDoItem & { tipo: 'nota'; texto: string; autor: AutorDoItem })
  | (BaseDoItem & { tipo: 'entrada'; como: 'cadastro' | 'importacao'; autor: AutorDoItem })
  | (BaseDoItem & { tipo: 'reuniao'; reuniao: ReuniaoDoLead })
  | (BaseDoItem & {
      tipo: 'whatsapp'
      /** `null` é ação que o payload não trouxe reconhecível: mostra o genérico. */
      acao: AcaoDoWhatsapp | null
      conversaId: string | null
      motivo: string | null
      autor: AutorDoItem
    })
  | (BaseDoItem & {
      tipo: 'automacao'
      acao: AcaoDaAutomacao | null
      /** `payload.tentativas`, quando a ação conta tentativas. */
      tentativas: number | null
      autor: AutorDoItem
    })

/** O `kind` com que uma reunião entra na comparação. */
export const KIND_DA_REUNIAO = 'meeting'

function instante(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms
}

/**
 * A ordem única: `occurred_at` decrescente, depois `kind`, depois `id`. O
 * instante se compara em milissegundos, e não em texto, porque o banco devolve
 * `+00:00` e o relógio da tela escreve `Z`.
 */
export function compararItens(
  a: Pick<BaseDoItem, 'em' | 'kind' | 'id'>,
  b: Pick<BaseDoItem, 'em' | 'kind' | 'id'>,
): number {
  const diferenca = instante(b.em) - instante(a.em)
  if (diferenca !== 0) return diferenca
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? -1 : 1
  return 0
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/** O rótulo gravado num lado da mudança (`de` ou `para`), senão a chave. */
function rotuloGravado(lado: unknown): string | null {
  if (typeof lado !== 'object' || lado === null) return null
  const registro = lado as Record<string, unknown>
  return texto(registro.label) ?? texto(registro.key)
}

/** A ligação pelo retrato do evento, quando a linha de `calls` não veio. */
function ligacaoDoPayload(evento: EventoDoLead, chamadaId: string): LigacaoDoLead {
  return {
    id: chamadaId,
    direcao: texto(evento.payload.direction) ?? 'outbound',
    proposito: texto(evento.payload.purpose) ?? '',
    iniciadaEm: evento.ocorridoEm,
    duracaoSeg: numero(evento.payload.duration_sec),
    motivoDoFim: texto(evento.payload.end_reason),
    caminhoDaGravacao: null,
    gravacaoExpiraEm: null,
  }
}

/** Um evento como item, ou `null` quando ele não tem o que dizer. */
export function itemDoEvento(
  evento: EventoDoLead,
  ligacoes: ReadonlyMap<string, LigacaoDoLead>,
  nomes: ReadonlyMap<string, string>,
): ItemDaLinhaDoTempo | null {
  const base = { id: evento.id, kind: evento.kind, em: evento.ocorridoEm }
  const autor: AutorDoItem = {
    ator: evento.ator,
    nome: evento.autorId === null ? null : (nomes.get(evento.autorId) ?? null),
  }

  switch (evento.kind) {
    case 'call': {
      if (evento.chamadaId === null) return null
      const ligacao = ligacoes.get(evento.chamadaId) ?? ligacaoDoPayload(evento, evento.chamadaId)
      return { ...base, tipo: 'ligacao', ligacao }
    }
    case 'stage_change': {
      const para = rotuloGravado(evento.payload.para)
      if (para === null) return null
      return { ...base, tipo: 'etapa', de: rotuloGravado(evento.payload.de), para, autor }
    }
    case 'blocked':
      return { ...base, tipo: 'bloqueio', motivo: texto(evento.payload.motivo), autor }
    case 'unblocked':
      return { ...base, tipo: 'desbloqueio', autor }
    case 'note': {
      const nota = texto(evento.payload.texto)
      if (nota === null) return null
      return { ...base, tipo: 'nota', texto: nota, autor }
    }
    case 'lead_created':
      return { ...base, tipo: 'entrada', como: 'cadastro', autor }
    case 'lead_imported':
      return { ...base, tipo: 'entrada', como: 'importacao', autor }
    case 'whatsapp': {
      const acaoBruta = evento.payload.acao
      const acao: AcaoDoWhatsapp | null =
        acaoBruta === 'iniciada' ||
        acaoBruta === 'assumida' ||
        acaoBruta === 'devolvida' ||
        acaoBruta === 'encerrada' ||
        acaoBruta === 'pre_contato' ||
        acaoBruta === 'pedido_humano'
          ? acaoBruta
          : null
      return {
        ...base,
        tipo: 'whatsapp',
        acao,
        conversaId: texto(evento.payload.conversation_id),
        motivo: texto(evento.payload.motivo),
        autor,
      }
    }
    case 'automation': {
      const acaoBruta = evento.payload.acao
      const acao = ACOES_DA_AUTOMACAO.find((conhecida) => conhecida === acaoBruta) ?? null
      return { ...base, tipo: 'automacao', acao, tentativas: numero(evento.payload.tentativas), autor }
    }
    default:
      return null
  }
}

export interface InsumoDaLinhaDoTempo {
  eventos: readonly EventoDoLead[]
  ligacoes: readonly LigacaoDoLead[]
  /** Nome de cada membro da conta, pelo id. */
  nomes: ReadonlyMap<string, string>
  /** Vazio até a F5: ver o cabeçalho de `app/src/copy/lead.ts`. */
  reunioes?: readonly ReuniaoDoLead[]
}

/** A lista única, já na ordem de `compararItens`. */
export function montarLinhaDoTempo(insumo: InsumoDaLinhaDoTempo): ItemDaLinhaDoTempo[] {
  const ligacoes = new Map(insumo.ligacoes.map((ligacao) => [ligacao.id, ligacao]))
  const itens: ItemDaLinhaDoTempo[] = []
  for (const evento of insumo.eventos) {
    const item = itemDoEvento(evento, ligacoes, insumo.nomes)
    if (item) itens.push(item)
  }
  for (const reuniao of insumo.reunioes ?? []) {
    itens.push({ id: reuniao.id, kind: KIND_DA_REUNIAO, em: reuniao.em, tipo: 'reuniao', reuniao })
  }
  return itens.sort(compararItens)
}
