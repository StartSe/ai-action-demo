// A tradução do catálogo de vozes: o que o provedor devolve vira o que a tela
// desenha, e o que a tela pede vira o corpo que o provedor aceita.
//
// **O único lugar desta função com os nomes do provedor.** É a mesma regra de
// `agent-publish/formato-do-provedor.ts`: `stability`, `similarity_boost`,
// `preview_url` e `verified_languages` moram aqui e não atravessam para
// `catalogo.ts`. Trocar de provedor de voz é reescrever este arquivo.
//
// **A leitura é defensiva de propósito.** O catálogo vem de fora e ninguém o
// versiona conosco: voz sem `voice_id`, `labels` que veio como lista, campo de
// idioma que mudou de nome. Nada disso pode derrubar o pedido inteiro — a voz
// ilegível é descartada, e a conta continua vendo as outras. A alternativa é
// uma tela vazia toda vez que o provedor acrescenta um campo.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** Os ajustes que a conta controla (RF-303), com o nome que a tela usa. */
export type NomeDeAjuste = 'estabilidade' | 'similaridade' | 'velocidade'

export interface AjusteDeVoz {
  readonly nome: NomeDeAjuste
  /** Como a tela chama o ajuste. Em português, como todo literal de interface. */
  readonly rotulo: string
  /** O que ele faz, em uma frase, para quem nunca mexeu em síntese de voz. */
  readonly explicacao: string
  /** O campo correspondente no provedor. Não sai desta função. */
  readonly campoDoProvedor: string
  readonly minimo: number
  readonly maximo: number
  readonly padrao: number
  readonly passo: number
}

/**
 * A faixa aceita é contrato do provedor, e por isso mora aqui junto com o nome
 * do campo. A tela desenha um controle por entrada desta lista em vez de
 * guardar um catálogo próprio: ajuste novo do provedor nasce com controle, e
 * faixa que ele mudar muda num arquivo só.
 *
 * Só três, e não tudo o que o provedor aceita: são os que RF-303 põe na mão de
 * quem configura. Estilo e exagero de estilo ficam de fora enquanto ninguém
 * souber dizer numa frase o que eles mudam na ligação.
 */
export const AJUSTES_DE_VOZ: readonly AjusteDeVoz[] = [
  {
    nome: 'estabilidade',
    rotulo: 'estabilidade',
    explicacao: 'Quanto mais alta, mais igual a voz soa de uma frase para a outra.',
    campoDoProvedor: 'stability',
    minimo: 0,
    maximo: 1,
    padrao: 0.5,
    passo: 0.05,
  },
  {
    nome: 'similaridade',
    rotulo: 'similaridade',
    explicacao: 'Quanto mais alta, mais perto da voz original do catálogo.',
    campoDoProvedor: 'similarity_boost',
    minimo: 0,
    maximo: 1,
    padrao: 0.75,
    passo: 0.05,
  },
  {
    nome: 'velocidade',
    rotulo: 'velocidade',
    explicacao: 'A pressa da fala. Acima de 1 ela fala mais rápido que o normal.',
    campoDoProvedor: 'speed',
    minimo: 0.7,
    maximo: 1.2,
    padrao: 1,
    passo: 0.05,
  },
]

const POR_NOME = new Map<string, AjusteDeVoz>(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, ajuste]))

/** O ajuste deste nome, ou null. Nome vindo do corpo do pedido passa por aqui. */
export function ajustePorNome(nome: string): AjusteDeVoz | null {
  return POR_NOME.get(nome.trim().toLowerCase()) ?? null
}

/** Gênero percebido da voz, como a tela o mostra. Null quando o provedor não diz. */
export type GeneroDaVoz = 'feminina' | 'masculina' | 'neutra' | null

/** Uma voz do provedor, já lida e sem nome de campo dele. */
export interface VozDoProvedor {
  readonly id: string
  readonly nome: string
  readonly genero: GeneroDaVoz
  /** Sotaque declarado pelo provedor, quando há. `brasileiro`, por exemplo. */
  readonly sotaque: string | null
  /** A descrição curta do provedor, quando há. */
  readonly descricao: string | null
  /** A amostra genérica do provedor. É dele e não diz nada sobre a abertura. */
  readonly previa: string | null
  /** Ajustes que o provedor declarou para esta voz. Vazio é normal. */
  readonly ajustesGravados: Partial<Record<NomeDeAjuste, number>>
  /** Os idiomas que a voz declara, normalizados em duas letras. */
  readonly idiomas: readonly string[]
}

/** O idioma da Sarah. Fixo, como em `agent-publish` (RF-302). */
export const IDIOMA_DO_CATALOGO = 'pt'

export interface CatalogoDoProvedor {
  /**
   * Quantas entradas o provedor mandou, inclusive as ilegíveis. Vai junto
   * porque a lista sozinha não distingue "a biblioteca desta conta está vazia"
   * de "o provedor mandou quarenta vozes e nenhuma serviu" — e são dois
   * problemas com dois próximos passos diferentes.
   */
  readonly recebidas: number
  readonly vozes: readonly VozDoProvedor[]
}

/**
 * Lê a resposta bruta do provedor. Aceita `{ voices: [...] }` e a lista solta,
 * porque as duas formas aparecem entre versões da API, e uma delas virando a
 * outra não é motivo para a tela de voz parar.
 */
export function lerCatalogoDoProvedor(bruto: unknown): CatalogoDoProvedor {
  const lista = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { voices?: unknown } | null)?.voices)
      ? ((bruto as { voices: unknown[] }).voices)
      : []

  const vozes: VozDoProvedor[] = []
  for (const item of lista) {
    const voz = lerVoz(item)
    if (voz) vozes.push(voz)
  }
  return { recebidas: lista.length, vozes }
}

/**
 * A voz fala português?
 *
 * Três fontes, porque o provedor declara idioma em três lugares conforme a voz
 * seja do catálogo dele, clonada ou ajustada: a lista de idiomas verificados, o
 * idioma do ajuste fino e o rótulo de sotaque. Basta uma. Exigir as três
 * esconderia metade do catálogo; não olhar o sotaque deixaria de fora as vozes
 * brasileiras que o provedor marca só ali.
 */
export function eEmPortugues(voz: VozDoProvedor): boolean {
  if (voz.idiomas.includes(IDIOMA_DO_CATALOGO)) return true
  // `brazilian` com z: o rótulo de sotaque vem em inglês, e escrever só a
  // forma em português deixaria de fora exatamente as vozes brasileiras que o
  // provedor marca apenas ali.
  return voz.sotaque !== null && /portug|bra[sz]il/i.test(voz.sotaque)
}

/** O corpo da síntese da amostra, com os nomes do provedor. */
export interface CorpoDaAmostra {
  readonly text: string
  readonly model_id: string
  readonly language_code: string
  readonly voice_settings: Readonly<Record<string, number>>
}

/**
 * O modelo de síntese da amostra. O mesmo que a conversa usa: uma amostra
 * gerada por outro modelo soaria diferente da ligação, que é justamente o que
 * ouvir antes tenta evitar.
 */
export const MODELO_DA_AMOSTRA = 'eleven_multilingual_v2'

/** O pedido de amostra, com os nomes e o aninhamento do provedor. */
export function corpoDaAmostra(
  texto: string,
  ajustes: Readonly<Record<NomeDeAjuste, number>>,
): CorpoDaAmostra {
  const voice_settings: Record<string, number> = {}
  for (const ajuste of AJUSTES_DE_VOZ) {
    const valor = ajustes[ajuste.nome]
    if (typeof valor === 'number') voice_settings[ajuste.campoDoProvedor] = valor
  }

  return {
    text: texto,
    model_id: MODELO_DA_AMOSTRA,
    language_code: IDIOMA_DO_CATALOGO,
    voice_settings,
  }
}

/**
 * Os ajustes que a conta já gravou em `agents.voice_settings`.
 *
 * A coluna guarda a forma do provedor — é ela que o compilador manda inteira na
 * publicação —, então é aqui que ela se lê. Valor que não é número é ignorado
 * em silêncio: a coluna é `jsonb` e aceita qualquer coisa, e um ajuste ilegível
 * não pode impedir a audição.
 */
export function lerAjustesGravados(
  gravados: Readonly<Record<string, unknown>>,
): Partial<Record<NomeDeAjuste, number>> {
  const lidos: Partial<Record<NomeDeAjuste, number>> = {}
  for (const ajuste of AJUSTES_DE_VOZ) {
    const valor = gravados[ajuste.campoDoProvedor]
    if (typeof valor === 'number' && Number.isFinite(valor)) lidos[ajuste.nome] = valor
  }
  return lidos
}

/**
 * Os mesmos ajustes na forma em que a coluna os guarda. Par de
 * `lerAjustesGravados`, e existe para a escrita e a leitura de
 * `agents.voice_settings` nunca divergirem: a tela de voz grava por aqui, o
 * catálogo lê por lá, e o compilador manda a coluna inteira na publicação.
 *
 * Ajuste ausente **não** vira padrão: gravar o padrão como se fosse escolha
 * apagaria a diferença entre "a conta não mexeu" e "a conta escolheu o valor
 * que por acaso é o padrão", e a segunda precisa sobreviver a uma mudança de
 * padrão do provedor.
 */
export function ajustesParaGravar(
  ajustes: Readonly<Partial<Record<NomeDeAjuste, number>>>,
): Record<string, number> {
  const gravados: Record<string, number> = {}
  for (const ajuste of AJUSTES_DE_VOZ) {
    const valor = ajustes[ajuste.nome]
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      gravados[ajuste.campoDoProvedor] = valor
    }
  }
  return gravados
}

// A leitura de uma voz ---------------------------------------------------------------

function lerVoz(item: unknown): VozDoProvedor | null {
  if (typeof item !== 'object' || item === null) return null
  const bruto = item as Record<string, unknown>

  const id = texto(bruto.voice_id ?? bruto.id)
  if (!id) return null

  const rotulos = objeto(bruto.labels)

  return {
    id,
    // Voz sem nome aparece pelo identificador em vez de sumir: quem está
    // escolhendo consegue pelo menos ouvi-la.
    nome: texto(bruto.name) ?? id,
    genero: lerGenero(texto(rotulos.gender)),
    sotaque: texto(rotulos.accent),
    descricao: texto(rotulos.description) ?? texto(bruto.description),
    previa: texto(bruto.preview_url),
    ajustesGravados: lerAjustesGravados(objeto(bruto.settings)),
    idiomas: lerIdiomas(bruto),
  }
}

/**
 * O gênero como o provedor o rotula. `neutra` cobre tanto a voz que ele marca
 * como neutra quanto a não binária: a tela mostra o que se percebe ao ouvir, e
 * não uma classificação de pessoa.
 */
function lerGenero(bruto: string | null): GeneroDaVoz {
  if (!bruto) return null
  const valor = bruto.trim().toLowerCase()
  if (/female|feminin|mulher/.test(valor)) return 'feminina'
  if (/male|masculin|homem/.test(valor)) return 'masculina'
  if (/neutral|neutro|neutra|non[-_\s]?binary/.test(valor)) return 'neutra'
  return null
}

/**
 * Os idiomas declarados, em duas letras minúsculas. `pt-BR`, `pt_br` e `pt`
 * são o mesmo idioma para quem escolhe voz em português.
 */
function lerIdiomas(bruto: Record<string, unknown>): readonly string[] {
  const candidatos: (string | null)[] = [
    texto(bruto.language),
    texto(objeto(bruto.fine_tuning).language),
  ]

  const verificados = bruto.verified_languages
  if (Array.isArray(verificados)) {
    for (const item of verificados) {
      candidatos.push(typeof item === 'string' ? item : texto(objeto(item).language))
    }
  }

  const idiomas: string[] = []
  for (const candidato of candidatos) {
    const codigo = candidato?.trim().toLowerCase().slice(0, 2)
    if (codigo && !idiomas.includes(codigo)) idiomas.push(codigo)
  }
  return idiomas
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}
