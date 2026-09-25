// O corpo do webhook de fim, traduzido para português.
//
// A mesma razão de `call-init/formato-do-provedor.ts`: os nomes do provedor num
// arquivo só, e `eventos.ts` não sabe como o provedor chama nada.
//
// **Suposição declarada sobre o formato do provedor**, no estado de T-01
// (`assumida-nao-verificada`, docs/decisao-do-agente.md), que o degrau 3
// verifica com o webhook real: o aviso de fim chega como
// `{ type, event_timestamp, data: { conversation_id, agent_id, status,
// metadata: { phone_call: { call_sid } } } }`. O `call_sid` também é procurado
// em `metadata.call_sid`, porque o provedor já o mandou nos dois lugares
// conforme o tipo de linha. Se o webhook real mostrar outra forma, a mudança é
// aqui, e `eventos.ts` não muda.
//
// **A transcrição não é lida aqui**, e o corpo inteiro não vai para o rastro:
// quem puxa a transcrição é `call-finalize`, pela API do provedor, e guardar o
// corpo do aviso em `integration_events` faria a conversa inteira do lead morar
// numa tabela de observabilidade, fora do expurgo que vale para `calls`.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** O aviso do provedor, já em português. */
export interface AvisoDoProvedor {
  /** `type`: qual aviso chegou. Nulo quando o provedor não disse. */
  readonly tipo: string | null
  /** `data.conversation_id`. */
  readonly conversaId: string | null
  /** `data.metadata.phone_call.call_sid`, ou `data.metadata.call_sid`. */
  readonly chamadaDaTelefoniaId: string | null
  /** `data.status`, como o provedor o escreve. Só vai para o rastro. */
  readonly situacao: string | null
  /** `event_timestamp`, em segundos. Só vai para o rastro. */
  readonly instanteDoEvento: number | null
}

/**
 * O corpo em aviso nosso, ou nulo quando ele não é sequer um objeto.
 *
 * Campo ausente vira nulo em vez de recusa: aviso sem identificador nenhum é
 * uma conversa que não sabemos achar, e quem decide o que fazer com ela é
 * `eventos.ts` — a resposta é 200, pela razão escrita lá.
 */
export function lerAvisoDoProvedor(corpo: unknown): AvisoDoProvedor | null {
  const campos = objeto(corpo)
  if (!campos) return null

  const dados = objeto(campos.data) ?? {}
  const metadados = objeto(dados.metadata) ?? {}
  const telefonia = objeto(metadados.phone_call) ?? {}

  const instante = campos.event_timestamp
  return {
    tipo: texto(campos.type),
    conversaId: texto(dados.conversation_id),
    chamadaDaTelefoniaId: texto(telefonia.call_sid) ?? texto(metadados.call_sid),
    situacao: texto(dados.status),
    instanteDoEvento: typeof instante === 'number' && Number.isFinite(instante) ? instante : null,
  }
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}
