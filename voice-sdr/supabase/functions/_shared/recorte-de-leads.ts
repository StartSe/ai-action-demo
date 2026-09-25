// O recorte da lista de leads: quais leads estão à vista, e em que ordem.
//
// Duas telas dependem deste arquivo e precisam concordar. A lista (US-032)
// monta o recorte a partir da busca da rota e pede as linhas ao Supabase; a
// exportação (`lead-export`) recebe o mesmo recorte e precisa devolver
// exatamente aquelas linhas, nem uma a mais. Recorte declarado em dois lugares
// diverge na primeira correção, e a divergência aparece como planilha que não
// bate com a tela de onde saiu — que é o pior jeito de descobrir o problema,
// porque ninguém confere 1.200 linhas.
//
// Por isso ele mora em `_shared/`: é o único código que a interface pode
// importar (pelo alias `@compartilhado/`) e a borda também. Sem `Deno`, sem
// import de rede.
//
// O que este módulo **não** faz é montar consulta. Filtro vira `.eq()` no
// PostgREST do lado da interface e do lado da borda, e cada um usa o cliente
// que tem; o que viaja aqui é a decisão de quais campos existem e o que conta
// como valor válido para cada um.
//
// A lista de valores de `etapa`, `origem` e `temperatura` **não** é conferida
// aqui de propósito. O domínio dessas colunas é do banco — `pipeline_stages.key`
// tem check, `leads.temperature` tem check, `source` é livre —, e repeti-lo em
// TypeScript criaria uma segunda fonte de verdade que envelhece calada: etapa
// nova no funil passaria a ser recusada pelo filtro sem ninguém tocar no filtro.
// Valor que o banco não conhece devolve zero linha, que é a resposta honesta.

/** Como a lista ordena, e o que a exportação repete (RF-110, RF-111). */
export const ORDENACOES = ['nome', 'atividade', 'criacao'] as const

export type Ordenacao = (typeof ORDENACOES)[number]

/**
 * A ordem padrão é a última atividade, decrescente: quem está trabalhando a
 * lista quer ver primeiro o que se mexeu.
 */
export const ORDENACAO_PADRAO: Ordenacao = 'atividade'

/**
 * O recorte inteiro. Toda chave é opcional, e ausente quer dizer "sem filtro
 * nesta dimensão" — não "filtro vazio". Objeto sem nenhuma chave é a conta
 * inteira, que é o estado em que a lista abre.
 */
export interface RecorteDeLeads {
  /** Busca por nome, telefone e e-mail (RF-110). */
  readonly termo?: string
  /** Chave da etapa do funil, não o rótulo: rótulo é editável (RF-203). */
  readonly etapa?: string
  readonly temperatura?: string
  readonly origem?: string
  /** Última atividade a partir deste instante, em ISO 8601. */
  readonly atividadeDesde?: string
  /** `true` só os bloqueados, `false` só os liberados, ausente os dois. */
  readonly bloqueado?: boolean
  readonly ordenacao?: Ordenacao
}

/** O recorte sem nenhum filtro: a conta inteira, na ordem padrão. */
export const RECORTE_ABERTO: RecorteDeLeads = {}

/**
 * Por que o recorte não foi aceito. Código, nunca frase: a frase é da tela
 * (`app/src/copy/leads.ts`) e da resposta da borda (`lead-export/respostas.ts`).
 */
export type MotivoDoRecorte = 'filtro_invalido'

export type LeituraDoRecorte =
  | { readonly ok: true; readonly recorte: RecorteDeLeads }
  | { readonly ok: false; readonly motivo: MotivoDoRecorte; readonly campo: string }

/** Os campos de texto, com o nome que eles têm no recorte. */
const CAMPOS_DE_TEXTO = ['termo', 'etapa', 'temperatura', 'origem'] as const

/**
 * Lê o recorte de um valor que veio de fora — corpo de requisição, busca da
 * rota, dado gravado em sessão anterior.
 *
 * Recusar é melhor do que ignorar. Um `temperatura: 42` descartado em silêncio
 * exportaria a conta inteira para quem pediu só os quentes, e a diferença entre
 * as duas planilhas é justamente a que ninguém confere. Chave desconhecida é a
 * exceção e passa: formulário e barra de endereço carregam bagagem (`utm_*`, o
 * cursor da paginação), e recusar por causa dela seria recusar pedido legítimo.
 */
export function lerRecorteDeLeads(valor: unknown): LeituraDoRecorte {
  if (valor === undefined || valor === null) return { ok: true, recorte: RECORTE_ABERTO }
  if (typeof valor !== 'object' || Array.isArray(valor)) {
    return { ok: false, motivo: 'filtro_invalido', campo: 'recorte' }
  }

  const bruto = valor as Readonly<Record<string, unknown>>
  const recorte: {
    -readonly [Campo in keyof RecorteDeLeads]: RecorteDeLeads[Campo]
  } = {}

  for (const campo of CAMPOS_DE_TEXTO) {
    const texto = lerTexto(bruto[campo])
    if (texto === null) return { ok: false, motivo: 'filtro_invalido', campo }
    // Texto em branco é filtro não preenchido, e é assim que o campo de busca
    // chega quando alguém apaga o que digitou.
    if (texto !== undefined) recorte[campo] = texto
  }

  const atividadeDesde = lerInstante(bruto.atividadeDesde)
  if (atividadeDesde === null) {
    return { ok: false, motivo: 'filtro_invalido', campo: 'atividadeDesde' }
  }
  if (atividadeDesde !== undefined) recorte.atividadeDesde = atividadeDesde

  const bloqueado = lerBooleano(bruto.bloqueado)
  if (bloqueado === null) return { ok: false, motivo: 'filtro_invalido', campo: 'bloqueado' }
  if (bloqueado !== undefined) recorte.bloqueado = bloqueado

  const ordenacao = lerOrdenacao(bruto.ordenacao)
  if (ordenacao === null) return { ok: false, motivo: 'filtro_invalido', campo: 'ordenacao' }
  if (ordenacao !== undefined) recorte.ordenacao = ordenacao

  return { ok: true, recorte }
}

/**
 * `null` é valor recusado, `undefined` é campo ausente. Juntar os dois é o que
 * transforma filtro digitado errado em filtro que não existe.
 */
function lerTexto(valor: unknown): string | undefined | null {
  if (valor === undefined || valor === null) return undefined
  if (typeof valor !== 'string') return null
  return valor.trim() || undefined
}

function lerInstante(valor: unknown): string | undefined | null {
  const texto = lerTexto(valor)
  if (texto === undefined || texto === null) return texto
  return Number.isFinite(Date.parse(texto)) ? texto : null
}

function lerBooleano(valor: unknown): boolean | undefined | null {
  if (valor === undefined || valor === null) return undefined
  if (typeof valor === 'boolean') return valor
  // A barra de endereço não tem booleano; ela tem `bloqueado=true`.
  if (valor === 'true') return true
  if (valor === 'false') return false
  return null
}

function lerOrdenacao(valor: unknown): Ordenacao | undefined | null {
  const texto = lerTexto(valor)
  if (texto === undefined || texto === null) return texto
  return ORDENACOES.find((ordenacao) => ordenacao === texto) ?? null
}
