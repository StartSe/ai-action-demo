// As propostas de correção do diagnóstico: a lista fechada de alvos e o crivo
// do que o modelo devolve.
//
// **O ALVO É LISTA FECHADA, E COBRE O AGENTE INTEIRO.** Cada alvo é um nível de
// configuração com tela própria — identidade, roteiro (camada 2), jeito da
// casa (camada 3), voz, política de discagem, privacidade —, mais
// `republicar`, para quando o que está gravado já está certo e o que está no
// ar é outra coisa. Quem aplica é `aplicar_proposta_do_diagnostico`, no banco,
// e ele conhece a mesma lista (`20261002100000_diagnostico_da_chamada.sql`):
// alvo novo entra nos dois lados, e o teste de banco cobra que cada alvo desta
// lista tenha caminho de aplicação lá.
//
// **O VALOR PROPOSTO PASSA POR VOCABULÁRIO, NUNCA POR APROXIMAÇÃO**, como em
// `call-classify`. Alvo fora da lista, número fora da faixa do `check` da
// coluna, texto com marcador que ninguém preenche, roteiro que promete horário
// (O-06), proposta que não muda nada: a proposta sai, e o motivo vira achado
// sem proposta. Recortar o número para dentro da faixa seria aplicar um valor
// que ninguém propôs.
//
// **O "ANTES" É DO BANCO, NÃO DO MODELO.** O modelo diz só o valor novo; o
// valor atual sai de `EstadoAtual`, lido pela borda. É ele que o banco confere
// na hora de aplicar: se a tela daquele nível mudou o valor depois do
// diagnóstico, a aplicação recusa em vez de passar por cima.
//
// **VOZ GUARDA A COLUNA INTEIRA.** `depois` de `voz.ajustes` é o
// `agents.voice_settings` completo, na forma que `@voz/` grava
// (`ajustesParaGravar`): o banco troca a coluna, e o que a proposta não tocou
// continua como estava.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import { marcadoresDe, MARCADORES_DA_PRIMEIRA_FALA } from '../_shared/agente/primeira-fala.ts'
import { trechoQuePrometeHorario } from '../_shared/agente/rascunho-de-roteiro.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import { AJUSTES_DE_VOZ, ajustesParaGravar, lerAjustesGravados, type NomeDeAjuste } from '../voice-catalog/formato-do-provedor.ts'

/** Os campos da política de discagem que o diagnóstico pode propor, com a faixa do `check`. */
export const CAMPOS_DA_POLITICA = {
  duracao_maxima: { coluna: 'max_duration_seconds', minimo: 30, maximo: 3600 },
  intervalo_minimo: { coluna: 'min_interval_minutes', minimo: 0, maximo: 10080 },
  tentativas_por_numero: { coluna: 'daily_attempts_per_number', minimo: 1, maximo: 20 },
  teto_diario: { coluna: 'daily_calls_cap', minimo: 1, maximo: 100000 },
  simultaneidade: { coluna: 'max_concurrent', minimo: 1, maximo: 10 },
} as const

export type CampoDaPolitica = keyof typeof CAMPOS_DA_POLITICA

/** Os tamanhos máximos de cada texto proposto. Acima disso é modelo divagando. */
export const LIMITES_DE_TEXTO = {
  'identidade.nome': 60,
  'identidade.primeira_fala': 500,
  'identidade.oferta': 300,
  'identidade.nunca_afirmar': 200,
  roteiro: 20_000,
  jeito_da_casa: 20_000,
  'privacidade.aviso_de_gravacao': 500,
} as const

/** Quantas propostas um diagnóstico guarda. Mais do que isso ninguém revisa. */
export const MAXIMO_DE_PROPOSTAS = 6

/** Quantos itens a lista do que a Sarah nunca afirma aceita. */
export const MAXIMO_DE_NUNCA_AFIRMAR = 20

export const ALVOS = [
  'identidade.primeira_fala',
  'identidade.oferta',
  'identidade.nunca_afirmar',
  'identidade.nome',
  ...PROPOSITOS.map((proposito) => `roteiro.${proposito}` as const),
  ...PROPOSITOS.map((proposito) => `jeito_da_casa.${proposito}` as const),
  'voz.ajustes',
  ...(Object.keys(CAMPOS_DA_POLITICA) as CampoDaPolitica[]).map((campo) => `politica.${campo}` as const),
  'privacidade.aviso_de_gravacao',
  'republicar',
] as const

export type Alvo = (typeof ALVOS)[number]

/** O nível de configuração do alvo: é por ele que a tela escolhe como publicar. */
export type NivelDoAlvo = 'identidade' | 'roteiro' | 'jeito_da_casa' | 'voz' | 'politica' | 'privacidade' | 'republicar'

export function nivelDoAlvo(alvo: Alvo): NivelDoAlvo {
  const [nivel] = alvo.split('.')
  return nivel as NivelDoAlvo
}

/** O propósito de um alvo de roteiro ou de jeito da casa; nulo nos outros. */
export function propositoDoAlvo(alvo: Alvo): Proposito | null {
  const [nivel, proposito] = alvo.split('.')
  return nivel === 'roteiro' || nivel === 'jeito_da_casa' ? (proposito as Proposito) : null
}

export function eAlvo(valor: unknown): valor is Alvo {
  return typeof valor === 'string' && (ALVOS as readonly string[]).includes(valor)
}

/** O valor de um alvo: texto, lista de textos, número, a coluna de voz, ou nada. */
export type ValorDoAlvo = string | readonly string[] | number | Readonly<Record<string, number>> | null

/** O que está gravado hoje em cada alvo. A borda lê; o crivo compara. */
export interface EstadoAtual {
  readonly identidade: {
    readonly nome: string
    readonly primeiraFala: string | null
    readonly oferta: string | null
    readonly nuncaAfirmar: readonly string[]
  } | null
  /** A versão vigente de cada propósito: a publicada, senão a mais nova. */
  readonly roteiros: Readonly<Partial<Record<Proposito, { readonly roteiro: string; readonly jeitoDaCasa: string }>>>
  /** `agents.voice_settings`, como a coluna o guarda. */
  readonly voz: Readonly<Record<string, number>>
  readonly politica: Readonly<Record<CampoDaPolitica, number>> | null
  readonly avisoDeGravacao: string | null
}

export type OrigemDaProposta = 'modelo' | 'regra'

export interface Proposta {
  readonly id: string
  readonly alvo: Alvo
  readonly titulo: string
  readonly razao: string
  readonly antes: ValorDoAlvo
  readonly depois: ValorDoAlvo
  readonly origem: OrigemDaProposta
}

/** Uma proposta que o crivo recusou, com o motivo em uma frase. */
export interface PropostaRecusada {
  readonly alvo: string
  readonly titulo: string
  readonly motivo: string
}

/** O valor atual de um alvo, lido do estado. Nulo quando o nível não existe ainda. */
export function valorAtual(alvo: Alvo, estado: EstadoAtual): ValorDoAlvo | undefined {
  const proposito = propositoDoAlvo(alvo)
  if (proposito) {
    const vigente = estado.roteiros[proposito]
    if (!vigente) return undefined
    return nivelDoAlvo(alvo) === 'roteiro' ? vigente.roteiro : vigente.jeitoDaCasa
  }
  switch (alvo) {
    case 'identidade.nome':
      return estado.identidade?.nome
    case 'identidade.primeira_fala':
      return estado.identidade ? estado.identidade.primeiraFala : undefined
    case 'identidade.oferta':
      return estado.identidade ? estado.identidade.oferta : undefined
    case 'identidade.nunca_afirmar':
      return estado.identidade?.nuncaAfirmar
    case 'voz.ajustes':
      return estado.voz
    case 'privacidade.aviso_de_gravacao':
      return estado.avisoDeGravacao
    case 'republicar':
      return null
    default: {
      const campo = alvo.slice('politica.'.length) as CampoDaPolitica
      return estado.politica ? estado.politica[campo] : undefined
    }
  }
}

/**
 * Uma proposta crua como o modelo a devolve. O esquema pede um campo por
 * forma de valor, todos presentes e nulos quando não se aplicam, porque o
 * modo estrito do esquema não aceita campo de tipo livre.
 */
export interface PropostaCrua {
  readonly alvo?: unknown
  readonly titulo?: unknown
  readonly razao?: unknown
  readonly texto?: unknown
  readonly lista?: unknown
  readonly numero?: unknown
  readonly ajustes?: unknown
}

type Crivo = { ok: true; depois: ValorDoAlvo } | { ok: false; motivo: string }

/** Frases do crivo. Registro de interface: quem lê é quem administra a conta. */
export const MOTIVOS_DA_RECUSA = {
  alvo_desconhecido: 'O alvo proposto não é um nível de configuração que o diagnóstico aplica.',
  sem_titulo: 'A proposta veio sem título ou sem razão.',
  nivel_inexistente: 'O nível que a proposta muda ainda não está configurado nesta conta.',
  texto_vazio: 'A proposta veio sem o texto novo.',
  texto_longo: 'O texto proposto passa do tamanho que aquele campo aceita.',
  marcador_desconhecido: 'O texto proposto usa um marcador que ninguém preenche na ligação.',
  marcador_do_provedor: 'O texto proposto usa marcador com chaves duplas, que a assistente leria em voz alta.',
  promete_horario: 'O texto proposto promete horário, e quem marca horário é a ferramenta de agenda.',
  lista_invalida: 'A lista proposta veio vazia, longa demais ou com item em branco.',
  numero_fora_da_faixa: 'O número proposto está fora da faixa que a configuração aceita.',
  ajuste_invalido: 'O ajuste de voz proposto está fora da faixa ou não é um ajuste conhecido.',
  sem_mudanca: 'A proposta repete o valor que já está gravado.',
  repetida: 'Já existe outra proposta para o mesmo alvo neste diagnóstico.',
} as const

/**
 * O crivo inteiro: o que passa vira proposta com o antes do banco; o que não
 * passa volta com o motivo. Nunca levanta.
 */
export function validarPropostas(
  brutas: unknown,
  estado: EstadoAtual,
): { aceitas: Proposta[]; recusadas: PropostaRecusada[] } {
  const aceitas: Proposta[] = []
  const recusadas: PropostaRecusada[] = []
  if (!Array.isArray(brutas)) return { aceitas, recusadas }

  const vistos = new Set<string>()
  for (const itemCru of brutas) {
    if (aceitas.length >= MAXIMO_DE_PROPOSTAS) break
    const item = (typeof itemCru === 'object' && itemCru !== null ? itemCru : {}) as PropostaCrua
    const titulo = textoLimpo(item.titulo)
    const razao = textoLimpo(item.razao)
    const alvoDito = typeof item.alvo === 'string' ? item.alvo : ''

    const recusar = (motivo: string) =>
      recusadas.push({ alvo: alvoDito, titulo: titulo ?? '', motivo })

    if (!eAlvo(item.alvo)) {
      recusar(MOTIVOS_DA_RECUSA.alvo_desconhecido)
      continue
    }
    const alvo = item.alvo
    if (!titulo || !razao) {
      recusar(MOTIVOS_DA_RECUSA.sem_titulo)
      continue
    }
    if (vistos.has(alvo)) {
      recusar(MOTIVOS_DA_RECUSA.repetida)
      continue
    }
    const antes = valorAtual(alvo, estado)
    if (antes === undefined) {
      recusar(MOTIVOS_DA_RECUSA.nivel_inexistente)
      continue
    }

    const crivo = crivar(alvo, item, estado)
    if (!crivo.ok) {
      recusar(crivo.motivo)
      continue
    }
    if (alvo !== 'republicar' && igual(antes, crivo.depois)) {
      recusar(MOTIVOS_DA_RECUSA.sem_mudanca)
      continue
    }

    vistos.add(alvo)
    aceitas.push({
      id: `p${aceitas.length + 1}`,
      alvo,
      titulo: titulo.slice(0, 160),
      razao: razao.slice(0, 1_000),
      antes,
      depois: crivo.depois,
      origem: 'modelo',
    })
  }

  return { aceitas, recusadas }
}

function crivar(alvo: Alvo, item: PropostaCrua, estado: EstadoAtual): Crivo {
  const nivel = nivelDoAlvo(alvo)
  if (alvo === 'republicar') return { ok: true, depois: null }
  if (alvo === 'identidade.nunca_afirmar') return crivarLista(item.lista)
  if (alvo === 'voz.ajustes') return crivarAjustes(item.ajustes, estado.voz)
  if (nivel === 'politica') {
    const campo = CAMPOS_DA_POLITICA[alvo.slice('politica.'.length) as CampoDaPolitica]
    const valor = item.numero
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < campo.minimo || valor > campo.maximo) {
      return { ok: false, motivo: MOTIVOS_DA_RECUSA.numero_fora_da_faixa }
    }
    return { ok: true, depois: valor }
  }

  const limite =
    nivel === 'roteiro' ? LIMITES_DE_TEXTO.roteiro
    : nivel === 'jeito_da_casa' ? LIMITES_DE_TEXTO.jeito_da_casa
    : LIMITES_DE_TEXTO[alvo as keyof typeof LIMITES_DE_TEXTO]
  return crivarTexto(alvo, item.texto, limite)
}

/** Chaves duplas: marcador do provedor, que a publicação não preenche. */
const CHAVES_DUPLAS = /\{\{|\}\}/

function crivarTexto(alvo: Alvo, valor: unknown, limite: number): Crivo {
  const texto = textoLimpo(valor)
  if (!texto) return { ok: false, motivo: MOTIVOS_DA_RECUSA.texto_vazio }
  if (texto.length > limite) return { ok: false, motivo: MOTIVOS_DA_RECUSA.texto_longo }
  if (CHAVES_DUPLAS.test(texto)) return { ok: false, motivo: MOTIVOS_DA_RECUSA.marcador_do_provedor }

  // O nome é dito como é: marcador nenhum. O resto aceita só os marcadores que
  // a publicação ou a ligação preenchem, a lista de `primeira-fala.ts`.
  const marcadores = marcadoresDe(texto)
  const conhecidos = new Set(alvo === 'identidade.nome' ? [] : MARCADORES_DA_PRIMEIRA_FALA)
  if (marcadores.some((marcador) => !conhecidos.has(marcador))) {
    return { ok: false, motivo: MOTIVOS_DA_RECUSA.marcador_desconhecido }
  }

  const nivel = nivelDoAlvo(alvo)
  if ((nivel === 'roteiro' || nivel === 'jeito_da_casa' || alvo === 'identidade.primeira_fala') && trechoQuePrometeHorario(texto)) {
    return { ok: false, motivo: MOTIVOS_DA_RECUSA.promete_horario }
  }
  return { ok: true, depois: texto }
}

function crivarLista(valor: unknown): Crivo {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > MAXIMO_DE_NUNCA_AFIRMAR) {
    return { ok: false, motivo: MOTIVOS_DA_RECUSA.lista_invalida }
  }
  const itens: string[] = []
  for (const item of valor) {
    const texto = textoLimpo(item)
    if (!texto || texto.length > LIMITES_DE_TEXTO['identidade.nunca_afirmar'] || CHAVES_DUPLAS.test(texto)) {
      return { ok: false, motivo: MOTIVOS_DA_RECUSA.lista_invalida }
    }
    if (marcadoresDe(texto).length > 0) return { ok: false, motivo: MOTIVOS_DA_RECUSA.marcador_desconhecido }
    if (!itens.includes(texto)) itens.push(texto)
  }
  return { ok: true, depois: itens }
}

function crivarAjustes(valor: unknown, atual: Readonly<Record<string, number>>): Crivo {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    return { ok: false, motivo: MOTIVOS_DA_RECUSA.ajuste_invalido }
  }
  const novos: Partial<Record<NomeDeAjuste, number>> = {}
  for (const [nome, numero] of Object.entries(valor as Record<string, unknown>)) {
    // Nulo é "não mexa neste": o esquema estrito pede os três presentes.
    if (numero === null || numero === undefined) continue
    const ajuste = AJUSTES_DE_VOZ.find((item) => item.nome === nome)
    if (!ajuste || typeof numero !== 'number' || !Number.isFinite(numero) || numero < ajuste.minimo || numero > ajuste.maximo) {
      return { ok: false, motivo: MOTIVOS_DA_RECUSA.ajuste_invalido }
    }
    novos[ajuste.nome] = numero
  }
  if (Object.keys(novos).length === 0) return { ok: false, motivo: MOTIVOS_DA_RECUSA.ajuste_invalido }

  // A coluna inteira, com o que a proposta não tocou como estava.
  const depois = { ...atual, ...ajustesParaGravar({ ...lerAjustesGravados(atual), ...novos }) }
  return { ok: true, depois }
}

function textoLimpo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** Igualdade de valor, para "a proposta não muda nada". */
export function igual(a: ValorDoAlvo, b: ValorDoAlvo): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b))
}

function normalizar(valor: ValorDoAlvo): unknown {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return valor
  return Object.fromEntries(Object.entries(valor).sort(([x], [y]) => x.localeCompare(y)))
}
