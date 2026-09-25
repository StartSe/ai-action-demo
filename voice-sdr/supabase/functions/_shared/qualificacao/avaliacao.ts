// Avaliação automática da chamada por critérios objetivos (US-134, RF-314,
// RF-909).
//
// Cada critério é `{ key, rotulo, obrigatorio, como }`. O que se decide por
// presença de trecho na fala da Sarah (`como: 'trecho'`) se decide aqui, em
// processo e sem modelo; o que exige julgamento (`como: 'modelo'`) vai para o
// modelo pela `PortaDeAvaliacao`. `key` é imutável e `rotulo` é editável, na
// mesma regra do funil.
//
// **CLASSIFICAÇÃO POR MODELO NÃO É DETERMINÍSTICA.** A prova em processo é do
// contrato e do caminho, com o modelo dublado: a forma da resposta, a nota
// agregada e o comportamento quando o modelo devolve campo faltando, nota fora
// da faixa, critério desconhecido ou texto no lugar de JSON. Nunca o acerto do
// julgamento. A medição da qualidade é do CI e de revisão humana.
//
// **A nota é nossa, de 0 a 10** (a escala de `calls.evaluation_score`).
// Critério obrigatório reprovado derruba a nota para zero; os demais pesam por
// igual entre os que tiveram decisão. Critério sem decisão (o modelo não
// respondeu por ele) não aprova nem reprova: inventar a decisão seria pior do
// que deixá-la em branco. Nota que o modelo devolva é ignorada.
//
// **Aviso de gravação devolve o instante do turno** em que a frase aparece,
// que é o que preenche `calls.consent_notice_at` (L-23, RF-420). Quem grava é a
// finalização, não este módulo.
//
// **Critério por registro** (`como: 'registro'`) não se decide pela fala: o que
// ele confere é o registro de ferramentas da chamada (`qualificacao_registrada`,
// de `obrigatoriedade.ts`). Quem o decide é o módulo dele, e o item chega pronto
// em `registrados`; sem item, o critério fica sem decisão em vez de reprovar.
//
// **CONJUNTO MÍNIMO, PROVISÓRIO.** DEPENDE DA PERGUNTA 1 EM ABERTO (seção 13 de
// docs/PRD.md): a lista concreta depende da oferta. `CRITERIOS_MINIMOS` traz só
// os que não dependem dela: aviso de gravação dado, identificação honesta na
// abertura, e nada afirmado fora da base de conhecimento.
//
// Módulo portável, sem Deno e sem import de rede, importável pela interface por
// `@compartilhado/qualificacao/avaliacao.ts`.

export interface CriterioObjetivo {
  readonly key: string
  readonly rotulo: string
  readonly obrigatorio: boolean
  readonly como: 'trecho' | 'modelo' | 'registro'
  /** Para `como: 'trecho'`: basta um destes aparecer numa fala da Sarah. */
  readonly trechos?: readonly string[]
}

/**
 * Uma linha de `evaluation_criteria`, com as chaves da tabela. A semente da
 * conta é `CRITERIOS_MINIMOS`, e o teste da migração compara as duas.
 */
export interface LinhaDeCriterio {
  readonly key: string
  readonly label: string
  readonly obrigatorio: boolean
  readonly como: 'trecho' | 'modelo'
  readonly trechos: readonly string[]
  readonly position: number
}

export interface TurnoDaConversa {
  readonly papel: 'sarah' | 'interlocutor'
  readonly texto: string
  /** Instante do turno, em ISO 8601, quando a transcrição o traz. */
  readonly instante?: string | null
}

export interface ItemDaAvaliacao {
  readonly criterio: string
  /** `null` quando não houve decisão. */
  readonly aprovado: boolean | null
  readonly evidencia: string | null
  readonly motivo?: 'nao_informado' | 'resposta_ilegivel' | 'tipo_invalido' | 'nao_se_aplica'
}

export interface AvaliacaoDaChamada {
  readonly nota: number
  readonly itens: readonly ItemDaAvaliacao[]
  /** Instante do turno com o aviso de gravação, quando aprovado por trecho. */
  readonly avisoDeGravacaoEm: string | null
  /** As chaves reprovadas, que é o que o gatilho da fila consome. */
  reprovados(): readonly string[]
}

/** O modelo recebe a transcrição e os critérios de julgamento, e devolve texto. */
export interface PortaDeAvaliacao {
  julgar(
    transcricao: readonly TurnoDaConversa[],
    criterios: readonly CriterioObjetivo[],
  ): Promise<string>
}

export const CHAVE_DO_AVISO_DE_GRAVACAO = 'aviso_gravacao'

/** PROVISÓRIO: o conjunto mínimo que não depende da oferta. */
export const CRITERIOS_MINIMOS: readonly CriterioObjetivo[] = Object.freeze([
  {
    key: CHAVE_DO_AVISO_DE_GRAVACAO,
    rotulo: 'Avisou que a ligação é gravada',
    obrigatorio: true,
    como: 'trecho',
    trechos: ['ligacao e gravada', 'ligacao esta sendo gravada', 'estou gravando', 'vou gravar'],
  },
  {
    key: 'identificacao_honesta',
    rotulo: 'Disse quem é e de onde fala na abertura',
    obrigatorio: true,
    como: 'trecho',
    trechos: ['aqui e a', 'sou a', 'meu nome e'],
  },
  {
    key: 'nada_fora_da_base',
    rotulo: 'Não afirmou nada fora da base de conhecimento',
    obrigatorio: false,
    como: 'modelo',
  },
])

/** As colunas de `evaluation_criteria` que as bordas e a tela leem. */
export const COLUNAS_DO_CRITERIO = 'key, label, obrigatorio, como, trechos, position'

/**
 * Uma linha de `evaluation_criteria` vinda do PostgREST, lida sem confiar na
 * forma. É a mesma leitura em `agent-publish`, `call-classify`,
 * `call-finalize` e na tela que mede a publicação: com quatro leituras, o
 * hash de uma divergiria do da outra no primeiro ajuste.
 */
export function lerLinhaDeCriterio(linha: Readonly<Record<string, unknown>>): LinhaDeCriterio {
  return {
    key: String(linha.key),
    label: String(linha.label),
    obrigatorio: linha.obrigatorio === true,
    como: linha.como === 'trecho' ? 'trecho' : 'modelo',
    trechos: Array.isArray(linha.trechos) ? linha.trechos.map(String) : [],
    position: Number(linha.position),
  }
}

/**
 * A semente de `evaluation_criteria`, linha a linha: `CRITERIOS_MINIMOS` na
 * ordem, com `position` pela ordem. A migração
 * (`20260929190000_criterios_de_avaliacao.sql`) insere exatamente isto, e o
 * teste de banco compara as duas.
 */
export const LINHAS_DA_SEMENTE: readonly LinhaDeCriterio[] = Object.freeze(
  CRITERIOS_MINIMOS.map((criterio, posicao) => ({
    key: criterio.key,
    label: criterio.rotulo,
    obrigatorio: criterio.obrigatorio,
    como: criterio.como === 'trecho' ? ('trecho' as const) : ('modelo' as const),
    trechos: [...(criterio.trechos ?? [])],
    position: posicao,
  })),
)

/**
 * O juízo que `call-classify` gravou em `calls.evaluation.criterios`
 * (`{ <chave>: { aprovado, justificativa } }`) servido como porta: a avaliação
 * automática da finalização não pergunta ao modelo de novo, lê o que ele já
 * respondeu na mesma passagem. Sem juízo gravado, a resposta é ilegível e todo
 * critério por modelo fica sem decisão, que é o estado honesto.
 */
export function portaDoJuizoGravado(evaluation: unknown): PortaDeAvaliacao {
  return {
    julgar(_transcricao, criterios) {
      const gravados = juizoGravado(evaluation)
      if (!gravados) return Promise.resolve('')
      const resposta: Record<string, unknown> = {}
      for (const criterio of criterios) {
        const item = gravados[criterio.key]
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue
        const { aprovado, justificativa } = item as { aprovado?: unknown; justificativa?: unknown }
        if (typeof aprovado !== 'boolean') continue
        resposta[criterio.key] = { aprovado, evidencia: typeof justificativa === 'string' ? justificativa : null }
      }
      return Promise.resolve(JSON.stringify({ criterios: resposta }))
    },
  }
}

/** `calls.evaluation.criterios`, quando é objeto. Nulo é juízo que ainda não houve. */
export function juizoGravado(evaluation: unknown): Record<string, unknown> | null {
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) return null
  const criterios = (evaluation as Record<string, unknown>).criterios
  if (!criterios || typeof criterios !== 'object' || Array.isArray(criterios)) return null
  return criterios as Record<string, unknown>
}

/** Sem acento, sem caixa, sem pontuação e com espaço único. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function porTrecho(criterio: CriterioObjetivo, transcricao: readonly TurnoDaConversa[]): {
  item: ItemDaAvaliacao
  instante: string | null
} {
  const trechos = (criterio.trechos ?? []).map(normalizar).filter((t) => t !== '')
  for (const turno of transcricao) {
    if (turno.papel !== 'sarah') continue
    const texto = normalizar(turno.texto)
    const achado = trechos.find((t) => texto.includes(t))
    if (achado) {
      return {
        item: { criterio: criterio.key, aprovado: true, evidencia: turno.texto },
        instante: turno.instante ?? null,
      }
    }
  }
  return { item: { criterio: criterio.key, aprovado: false, evidencia: null }, instante: null }
}

function lerJulgamento(
  texto: string,
  criterios: readonly CriterioObjetivo[],
): ItemDaAvaliacao[] {
  let dado: unknown
  try {
    dado = JSON.parse(texto)
  } catch {
    dado = undefined
  }
  const objeto =
    dado && typeof dado === 'object' && !Array.isArray(dado)
      ? ((dado as Record<string, unknown>).criterios ?? dado)
      : undefined
  if (!objeto || typeof objeto !== 'object' || Array.isArray(objeto)) {
    return criterios.map((c) => ({ criterio: c.key, aprovado: null, evidencia: null, motivo: 'resposta_ilegivel' }))
  }
  const bruto = objeto as Record<string, unknown>
  return criterios.map((c) => {
    const valor = Object.prototype.hasOwnProperty.call(bruto, c.key) ? bruto[c.key] : undefined
    if (valor === undefined || valor === null) {
      return { criterio: c.key, aprovado: null, evidencia: null, motivo: 'nao_informado' }
    }
    if (typeof valor !== 'object' || Array.isArray(valor)) {
      return { criterio: c.key, aprovado: null, evidencia: null, motivo: 'tipo_invalido' }
    }
    const registro = valor as Record<string, unknown>
    if (typeof registro.aprovado !== 'boolean') {
      return { criterio: c.key, aprovado: null, evidencia: null, motivo: 'tipo_invalido' }
    }
    const evidencia = typeof registro.evidencia === 'string' && registro.evidencia.trim() !== '' ? registro.evidencia : null
    return { criterio: c.key, aprovado: registro.aprovado, evidencia }
  })
}

/** A nota de 0 a 10, com uma casa decimal. */
export function notaDosItens(itens: readonly ItemDaAvaliacao[], criterios: readonly CriterioObjetivo[]): number {
  const obrigatorios = new Set(criterios.filter((c) => c.obrigatorio).map((c) => c.key))
  if (itens.some((i) => i.aprovado === false && obrigatorios.has(i.criterio))) return 0
  const decididos = itens.filter((i) => i.aprovado !== null)
  if (decididos.length === 0) return 0
  const aprovados = decididos.filter((i) => i.aprovado === true).length
  return Math.round((100 * aprovados) / decididos.length) / 10
}

export async function avaliarChamada(
  transcricao: readonly TurnoDaConversa[],
  criterios: readonly CriterioObjetivo[],
  porta: PortaDeAvaliacao,
  /** Os itens dos critérios por registro, já decididos pelo módulo de cada um. */
  registrados: readonly ItemDaAvaliacao[] = [],
): Promise<AvaliacaoDaChamada> {
  const porItem = new Map<string, ItemDaAvaliacao>()
  let avisoDeGravacaoEm: string | null = null

  for (const criterio of criterios) {
    if (criterio.como !== 'registro') continue
    const item = registrados.find((i) => i.criterio === criterio.key)
    porItem.set(
      criterio.key,
      item ?? { criterio: criterio.key, aprovado: null, evidencia: null, motivo: 'nao_informado' },
    )
  }

  for (const criterio of criterios) {
    if (criterio.como !== 'trecho') continue
    const { item, instante } = porTrecho(criterio, transcricao)
    porItem.set(criterio.key, item)
    if (criterio.key === CHAVE_DO_AVISO_DE_GRAVACAO && item.aprovado) avisoDeGravacaoEm = instante
  }

  const deModelo = criterios.filter((c) => c.como === 'modelo')
  if (deModelo.length > 0) {
    let texto: string
    try {
      texto = await porta.julgar(transcricao, deModelo)
    } catch {
      texto = ''
    }
    for (const item of lerJulgamento(texto, deModelo)) porItem.set(item.criterio, item)
  }

  const itens = criterios.map((c) => porItem.get(c.key)!)
  const nota = notaDosItens(itens, criterios)
  return {
    nota,
    itens,
    avisoDeGravacaoEm,
    reprovados: () => itens.filter((i) => i.aprovado === false).map((i) => i.criterio),
  }
}
