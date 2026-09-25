// A leitura de uma linha de `exception_items` para a tela da fila.
//
// O `context` é `jsonb`, e o tipo dele é promessa de quem o escreveu: cada
// ferramenta põe a sua parte (tool-transfer põe `recorte`, `urgencia` e
// `pendencia`; tool-dnc e call-finalize põem `recorte` e `origem`;
// `abrir_item_de_falha_repetida` põe `phone_e164`, `limiar` e a lista
// `tentativas`; os gatilhos da F4, em `_shared/fila/gatilhos.ts`, põem
// `trecho`, `sentimento`, `criterios`, `falhas`, `provedor` e `saldo_cents`;
// call-classify põe `motivo`). Cada campo se lê conferindo, e o que não casa
// sai nulo: `undefined` impresso no meio de uma frase é pior do que a frase
// sem o dado.
//
// O gênero da F3 vira o tipo de RF-909 aqui (`SINONIMOS_DA_F3`), e o limiar
// sai de `threshold_snapshot`. A falha repetida da F3 é anterior à coluna e
// guardava o limiar no `context` (`limiar`): ele é lido como o mesmo
// `consecutive_failures_cap`, senão o item antigo apareceria sem porquê.
//
// A gravação se decide pela régua da ficha (`estadoDaGravacao`), a mesma de
// `call-audio`: o reprodutor só aparece quando há o que tocar.

import { estadoDaGravacao } from '@/chamadas/ficha'
import {
  CHAVES_DO_LIMIAR,
  SEVERIDADES,
  SINONIMOS_DA_F3,
  TIPOS,
  type ContextoDoItem,
  type ItemDaFila,
  type LimiarDoItem,
  type Resolucao,
  type Severidade,
  type TipoDoItem,
} from '@/fila/tipos'

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const aparado = valor.trim()
  return aparado === '' ? null : aparado
}

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

function umDe<T extends string>(valor: unknown, validos: readonly T[]): T | null {
  return typeof valor === 'string' && (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/** A lista `tentativas` da F3 ou o número `falhas` dos gatilhos da F4. */
function tentativasDe(contexto: Record<string, unknown>): number | null {
  const lista = contexto.tentativas
  if (Array.isArray(lista) && lista.length > 0) return lista.length
  const falhas = numero(contexto.falhas)
  return falhas !== null && falhas > 0 ? falhas : null
}

export function lerContexto(bruto: unknown): ContextoDoItem {
  const contexto = objeto(bruto)
  const criterios = Array.isArray(contexto.criterios) ? contexto.criterios : []
  return {
    recorte: texto(contexto.recorte) ?? texto(contexto.trecho),
    urgencia: umDe(contexto.urgencia, ['alta', 'normal'] as const),
    pendencia: umDe(contexto.pendencia, ['destino_ausente', 'destino_invalido'] as const),
    origem: umDe(contexto.origem, ['lead_request', 'wrong_number'] as const),
    tentativas: tentativasDe(contexto),
    telefone: texto(contexto.phone_e164),
    sentimento: numero(contexto.sentimento),
    criterios: criterios.map(texto).filter((chave): chave is string => chave !== null),
    provedor: texto(contexto.provedor),
    saldoCents: numero(contexto.saldo_cents),
    motivo: umDe(contexto.motivo, [
      'modelo_indisponivel',
      'resposta_ilegivel',
      'modelo_nao_conectado',
      'falha_da_assistente',
      'assistente_nao_publicada',
    ] as const),
  }
}

/**
 * O limiar que criou o item, de `threshold_snapshot`. Chave desconhecida ou
 * valor que não é número fica de fora.
 */
export function lerLimiares(snapshot: unknown, contextoBruto: unknown): LimiarDoItem[] {
  const retrato = objeto(snapshot)
  const limiares = CHAVES_DO_LIMIAR.flatMap((chave) => {
    const valor = numero(retrato[chave])
    return valor === null ? [] : [{ chave, valor }]
  })
  if (limiares.length > 0) return limiares

  const legado = numero(objeto(contextoBruto).limiar)
  return legado === null ? [] : [{ chave: 'consecutive_failures_cap', valor: legado }]
}

/** O gênero gravado, traduzido para o tipo de RF-909. */
export function tipoDoGenero(kind: unknown): TipoDoItem | null {
  if (typeof kind !== 'string') return null
  return SINONIMOS_DA_F3[kind] ?? umDe<TipoDoItem>(kind, TIPOS)
}

/** A tabela embutida pelo PostgREST: objeto, lista de um ou nulo. */
function embutido(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) return valor.length ? objeto(valor[0]) : null
  return typeof valor === 'object' && valor !== null ? objeto(valor) : null
}

function resolucaoDa(linha: Record<string, unknown>): Resolucao | null {
  const autor = texto(linha.resolved_by)
  const em = texto(linha.resolved_at)
  if (linha.status !== 'resolvido' || autor === null || em === null) return null
  return { autor, em, texto: texto(linha.resolution) ?? '' }
}

/**
 * Uma linha como o Supabase a entrega, com `leads` e `calls` embutidos. Gênero
 * ou severidade fora do domínio devolvem nulo: o check do banco os recusa, e
 * uma linha assim é defeito que a tela não tem como explicar.
 */
export function paraItemDaFila(
  linha: Record<string, unknown>,
  agora: string,
): ItemDaFila | null {
  const tipo = tipoDoGenero(linha.kind)
  const severidade = umDe<Severidade>(linha.severity, SEVERIDADES)
  if (tipo === null || severidade === null) return null

  const lead = embutido(linha.leads)
  const chamada = embutido(linha.calls)
  const chamadaId = texto(linha.call_id)
  const leadId = texto(linha.lead_id)

  return {
    id: String(linha.id),
    tipo,
    severidade,
    criadoEm: String(linha.created_at),
    lead:
      lead && leadId
        ? { id: leadId, nome: texto(lead.name), telefone: texto(lead.phone_e164) }
        : null,
    chamadaId,
    gravacao:
      chamadaId === null || chamada === null
        ? 'sem_gravacao'
        : estadoDaGravacao(
            {
              caminhoDaGravacao: texto(chamada.recording_path),
              gravacaoExpiraEm: texto(chamada.recording_expires_at),
            },
            agora,
          ).tipo,
    contexto: lerContexto(linha.context),
    limiares: lerLimiares(linha.threshold_snapshot, linha.context),
    resolucao: resolucaoDa(linha),
  }
}

/**
 * O texto que vai para `resolver_item_de_fila`. O campo da tela é opcional, e o
 * banco exige texto (`exception_items_resolucao_completa`): em branco vai a
 * frase padrão, que a tela recebe da copy.
 */
export function textoDaResolucao(escrito: string, padrao: string): string {
  return escrito.trim() === '' ? padrao : escrito.trim()
}
