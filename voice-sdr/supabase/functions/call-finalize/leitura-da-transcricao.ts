// O que a finalização conclui da transcrição já lida (T-02, T-03, US-107): as
// linhas de `call_tool_invocations` e o fim da chamada. Não conhece o formato
// do provedor — recebe a `ConversaDoProvedor` que o adaptador de
// `formato-do-provedor.ts` montou, e por isso é testado sobre fixtures de
// transcrição (`transcricoes-de-exemplo.ts`) que declaram o formato que usam.
//
// **O INSTANTE É A ORDEM.** A tela do ensaio mostra as ferramentas ordenadas
// por `at` (US-114), então `at` sai do instante lido da transcrição e nunca da
// ordem em que as linhas foram gravadas. O provedor escreve o instante do turno
// em segundos, e duas invocações do mesmo turno — `tool-dnc` e `end_call`, o
// caso da pessoa errada — cairiam no mesmo `at`: a ordem entre elas ficaria por
// conta do banco, e duas da mesma ferramenta colidiriam no único
// `(call_id, tool, at)` e uma seria descartada calada. Por isso o instante é
// **estritamente crescente** na ordem da transcrição: cada invocação recebe o
// milissegundo do turno ou, se ele já foi usado, o seguinte ao da anterior. É
// determinístico — a mesma transcrição dá os mesmos instantes em toda passagem
// —, e é isso que mantém a idempotência pelo único.
//
// **O desempate conta todas as invocações lidas**, inclusive as nossas que deram
// certo e não viram linha: o instante é propriedade da invocação, e não do
// filtro que decide o que é gravado.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { CATALOGO_DE_FERRAMENTAS } from '../_shared/agente/compilador.ts'

import { FERRAMENTAS_DE_SISTEMA, type ConversaDoProvedor, type InvocacaoLida } from './formato-do-provedor.ts'

export type MotivoDoFim =
  | 'completed'
  | 'voicemail'
  | 'max_duration'
  | 'no_answer'
  | 'transferred'
  | 'canceled'

export type AtendidaPor = 'human' | 'machine' | 'unknown'

/** Uma linha de `call_tool_invocations`, lida da transcrição. */
export interface LinhaDeInvocacao {
  readonly account_id: string
  readonly call_id: string
  /** `system:<nome>` para o que o provedor executou; o nome do catálogo para as nossas. */
  readonly tool: string
  readonly request: Readonly<Record<string, unknown>>
  /** Vazio; `nome_recebido` quando o nome que veio precisou ser ajustado para a coluna. */
  readonly response: Readonly<Record<string, unknown>>
  /** Nulo: a invocação lida da transcrição não é cronometrada por nós (ver a migração). */
  readonly latency_ms: null
  /** O erro que o provedor registrou. Nulo quando deu certo. */
  readonly error: string | null
  readonly at: string
}

/** A chamada, no que a leitura precisa dela. */
export interface ChamadaDaLeitura {
  readonly account_id: string
  readonly id: string
}

/** Os nomes das nossas sete, que a própria ferramenta registra quando dá certo. */
const NOSSAS_FERRAMENTAS: ReadonlySet<string> = new Set(CATALOGO_DE_FERRAMENTAS.map((f) => f.nome))

/**
 * O que `call_tool_invocations_tool_check` aceita depois do prefixo `system:`.
 * O teste de banco compara esta expressão com a da restrição: réguas
 * diferentes fariam a finalização gravar o que o banco recusa.
 */
export const NOME_DE_SISTEMA = /^[A-Za-z0-9_.]{1,100}$/

/**
 * O instante de cada invocação, em milissegundos Unix, na ordem da transcrição
 * e estritamente crescente (ver o cabeçalho). A ordem da lista devolvida é a
 * do instante; empate de segundo mantém a ordem em que a transcrição as trouxe.
 */
export function instantesDasInvocacoes(
  lidas: readonly InvocacaoLida[],
  inicioMs: number,
): { readonly invocacao: InvocacaoLida; readonly ms: number }[] {
  const ordenadas = lidas
    .map((invocacao, indice) => ({ invocacao, indice, base: inicioMs + Math.round(invocacao.segundo * 1000) }))
    .sort((a, b) => a.base - b.base || a.indice - b.indice)

  let anterior = Number.NEGATIVE_INFINITY
  return ordenadas.map(({ invocacao, base }) => {
    const ms = base > anterior ? base : anterior + 1
    anterior = ms
    return { invocacao, ms }
  })
}

/**
 * Qual invocação vira linha, e com que nome. As três de sistema e a
 * desconhecida entram com o prefixo `system:`; as nossas só quando voltaram
 * com erro, porque quando dão certo quem as registra, com a latência, é a
 * própria ferramenta. Transcrição sem invocação nenhuma devolve lista vazia, e
 * isso é o caso normal.
 */
export function linhasDeInvocacao(
  chamada: ChamadaDaLeitura,
  lidas: readonly InvocacaoLida[],
  inicioMs: number,
): LinhaDeInvocacao[] {
  const linhas: LinhaDeInvocacao[] = []
  for (const { invocacao, ms } of instantesDasInvocacoes(lidas, inicioMs)) {
    const nossa = NOSSAS_FERRAMENTAS.has(invocacao.nome)
    if (nossa && invocacao.erro === null) continue

    const nome = nossa ? { tool: invocacao.nome, ajustado: false } : nomeDeSistema(invocacao.nome)
    linhas.push({
      account_id: chamada.account_id,
      call_id: chamada.id,
      tool: nome.tool,
      request: invocacao.parametros,
      response: nome.ajustado ? { nome_recebido: invocacao.nome } : {},
      latency_ms: null,
      error: invocacao.erro,
      at: new Date(ms).toISOString(),
    })
  }
  return linhas
}

/**
 * O nome com o prefixo de quem executou. As três conhecidas pelo mapa; a
 * desconhecida com o nome que veio, e com o caractere que a coluna não aceita
 * trocado por `_` — o nome original viaja em `response.nome_recebido`, porque
 * recusar a linha por causa do nome derrubaria a finalização inteira.
 */
function nomeDeSistema(nome: string): { tool: string; ajustado: boolean } {
  if (Object.hasOwn(FERRAMENTAS_DE_SISTEMA, nome)) {
    return { tool: FERRAMENTAS_DE_SISTEMA[nome as keyof typeof FERRAMENTAS_DE_SISTEMA], ajustado: false }
  }
  if (NOME_DE_SISTEMA.test(nome)) return { tool: `system:${nome}`, ajustado: false }
  return { tool: `system:${nome.replace(/[^A-Za-z0-9_.]/g, '_').slice(0, 100)}`, ajustado: true }
}

export interface LeituraDoFim {
  readonly motivo: MotivoDoFim
  readonly atendidaPor: AtendidaPor
}

/**
 * Por que terminou e quem atendeu. As ferramentas de sistema decidem primeiro,
 * porque são o fato registrado na conversa (T-02, T-03), e só as que deram
 * certo: transferência que voltou com erro não transferiu ninguém. A caixa
 * postal é `machine` e `voicemail`; depois vem a transferência, o encerramento
 * pela Sarah (`end_call`, que é conversa concluída), o teto de duração, e por
 * fim a transcrição: com ela, `completed`; sem ela, ninguém atendeu.
 */
export function lerFim(conversa: ConversaDoProvedor, duracaoMaximaEmSegundos: number): LeituraDoFim {
  const usadas = new Set(
    conversa.invocacoes.filter((invocacao) => invocacao.erro === null).map((invocacao) => invocacao.nome),
  )
  const leadFalou = conversa.turnos.some((turno) => turno.quem === 'lead')

  if (usadas.has('voicemail_detection')) return { motivo: 'voicemail', atendidaPor: 'machine' }

  const atendidaPor = leadFalou ? 'human' : 'unknown'
  if (usadas.has('transfer_to_number')) return { motivo: 'transferred', atendidaPor }
  if (usadas.has('end_call')) return { motivo: 'completed', atendidaPor }
  if (conversa.duracaoEmSegundos !== null && conversa.duracaoEmSegundos >= duracaoMaximaEmSegundos) {
    return { motivo: 'max_duration', atendidaPor }
  }
  if (conversa.turnos.length === 0) return { motivo: 'no_answer', atendidaPor: 'unknown' }
  return { motivo: 'completed', atendidaPor }
}
