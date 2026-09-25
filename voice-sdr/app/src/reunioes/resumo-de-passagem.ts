// O resumo de passagem em blocos legíveis (US-180, RF-511).
//
// `meetings.handoff_summary` é `jsonb` sem forma fixa: quem o escreve é a
// finalização da chamada, com o modelo, e a forma pode mudar sem migração.
// Por isso a tela nunca desenha o JSON. Este módulo parte o que vier em
// blocos com rótulo:
//
// - Texto solto vira um bloco só, o resumo.
// - Objeto vira um bloco por chave. As chaves conhecidas (em português ou em
//   inglês, com ou sem acento) ganham o rótulo da copy e vêm primeiro, na
//   ordem de quem vai entrar na conversa: resumo, dor, contexto e o resto. As
//   desconhecidas vêm depois, na ordem em que chegaram, com a própria chave
//   escrita como gente (`proximo_passo` vira "Proximo passo").
// - Lista vira itens. Objeto dentro de bloco vira item por chave; objeto
//   dentro de lista vira um item com os valores lado a lado.
// - Vazio e nulo somem. Sem nada legível, a lista de blocos volta vazia e a
//   tela diz que não há resumo, em vez de desenhar um cartão em branco.
//
// Sem rótulo escrito aqui: o texto de cada campo mora em `copy/reunioes.ts`.

export const CAMPOS_DO_RESUMO = [
  'resumo',
  'dor',
  'contexto',
  'interesse',
  'orcamento',
  'prazo',
  'decisor',
  'objecoes',
  'proximosPassos',
] as const

export type CampoDoResumo = (typeof CAMPOS_DO_RESUMO)[number]

/** Os nomes com que cada campo pode chegar, já normalizados por `normalizar`. */
const SINONIMOS: Record<CampoDoResumo, readonly string[]> = {
  resumo: ['resumo', 'summary', 'texto', 'text'],
  dor: ['dor', 'dores', 'pain', 'pains', 'painpoints', 'problema'],
  contexto: ['contexto', 'context', 'situacao'],
  interesse: ['interesse', 'interest', 'motivacao'],
  orcamento: ['orcamento', 'budget'],
  prazo: ['prazo', 'timeline', 'urgencia'],
  decisor: ['decisor', 'decisionmaker', 'quemdecide'],
  objecoes: ['objecoes', 'objecao', 'objections'],
  proximosPassos: ['proximospassos', 'proximopasso', 'nextsteps'],
}

/** Um item de lista. `chave` presente quando o item veio de um objeto. */
export interface ItemDoResumo {
  chave: string | null
  texto: string
}

export type ConteudoDoBloco =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'lista'; itens: readonly ItemDoResumo[] }

export interface BlocoDoResumo {
  /** Nulo quando a chave não é conhecida: o rótulo sai de `escreverChave`. */
  campo: CampoDoResumo | null
  chave: string
  conteudo: ConteudoDoBloco
}

/** As palavras de valor lógico, vindas da copy. */
export interface PalavrasDoResumo {
  sim: string
  nao: string
}

function normalizar(chave: string): string {
  return chave
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export function campoDaChave(chave: string): CampoDoResumo | null {
  const normalizada = normalizar(chave)
  return CAMPOS_DO_RESUMO.find((campo) => SINONIMOS[campo].includes(normalizada)) ?? null
}

/** `proximo_passo`, `proximoPasso` e `proximo-passo` viram "Proximo passo". */
export function escreverChave(chave: string): string {
  const palavras = chave
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase()
  return palavras.charAt(0).toUpperCase() + palavras.slice(1)
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
}

/** Valor escalar como texto; nulo para vazio e para o que não é escalar. */
function textoDoEscalar(valor: unknown, palavras: PalavrasDoResumo): string | null {
  if (typeof valor === 'string') return valor.trim() || null
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor === 'boolean') return valor ? palavras.sim : palavras.nao
  return null
}

/** Objeto dentro de lista: os valores escalares lado a lado, sem as chaves. */
function textoDoObjeto(objeto: Record<string, unknown>, palavras: PalavrasDoResumo): string | null {
  const partes = Object.values(objeto)
    .map((valor) => textoDoEscalar(valor, palavras))
    .filter((parte): parte is string => parte !== null)
  return partes.length > 0 ? partes.join(' · ') : null
}

function itensDaLista(lista: readonly unknown[], palavras: PalavrasDoResumo): ItemDoResumo[] {
  const itens: ItemDoResumo[] = []
  for (const valor of lista) {
    const texto = ehObjeto(valor) ? textoDoObjeto(valor, palavras) : textoDoEscalar(valor, palavras)
    if (texto !== null) itens.push({ chave: null, texto })
  }
  return itens
}

function conteudoDe(valor: unknown, palavras: PalavrasDoResumo): ConteudoDoBloco | null {
  const texto = textoDoEscalar(valor, palavras)
  if (texto !== null) return { tipo: 'texto', texto }

  if (Array.isArray(valor)) {
    const itens = itensDaLista(valor, palavras)
    return itens.length > 0 ? { tipo: 'lista', itens } : null
  }

  if (ehObjeto(valor)) {
    const itens: ItemDoResumo[] = []
    for (const [chave, interno] of Object.entries(valor)) {
      const textoInterno = ehObjeto(interno)
        ? textoDoObjeto(interno, palavras)
        : Array.isArray(interno)
          ? itensDaLista(interno, palavras).map((item) => item.texto).join(', ') || null
          : textoDoEscalar(interno, palavras)
      if (textoInterno !== null) itens.push({ chave, texto: textoInterno })
    }
    return itens.length > 0 ? { tipo: 'lista', itens } : null
  }

  return null
}

export function blocosDoResumo(resumo: unknown, palavras: PalavrasDoResumo): BlocoDoResumo[] {
  if (!ehObjeto(resumo)) {
    const conteudo = conteudoDe(resumo, palavras)
    return conteudo ? [{ campo: 'resumo', chave: 'resumo', conteudo }] : []
  }

  const conhecidos: BlocoDoResumo[] = []
  const desconhecidos: BlocoDoResumo[] = []
  for (const [chave, valor] of Object.entries(resumo)) {
    const conteudo = conteudoDe(valor, palavras)
    if (!conteudo) continue
    const campo = campoDaChave(chave)
    ;(campo ? conhecidos : desconhecidos).push({ campo, chave, conteudo })
  }

  const ordem = (bloco: BlocoDoResumo) => CAMPOS_DO_RESUMO.indexOf(bloco.campo as CampoDoResumo)
  // `sort` é estável: dois sinônimos do mesmo campo ficam na ordem de chegada.
  return [...conhecidos.sort((a, b) => ordem(a) - ordem(b)), ...desconhecidos]
}
