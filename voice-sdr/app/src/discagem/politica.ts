// A regra da tela `/config/discagem`, em funções puras.
//
// Três decisões atravessam o arquivo:
//
// 1. **O check do banco se espelha aqui** (`FAIXAS`), para a recusa chegar ao
//    campo antes do servidor. Quem recusa de verdade continua sendo a coluna, e
//    `testes/banco/politica-de-discagem.test.ts` prova isso do lado dela.
// 2. **O limite do provedor é da tela** (L-20, RNF-13). O banco não sabe quantas
//    sessões a conta contratou no provedor de voz nem quantos canais tem na
//    telefonia; `integrations-status` sabe. O teto da simultaneidade é o menor
//    dos dois, e sem nenhum deles é o check da coluna — indisponibilidade de
//    provedor não trava a configuração inteira.
// 3. **A prévia da janela usa o módulo da guarda** (`fraseDaJanela`, US-056).
//    Uma segunda formatação de hora aqui seria a segunda verdade sobre a mesma
//    faixa.

import { fraseDaJanela } from '@compartilhado/discagem/janela.ts'

import type { Integracao } from '@/integracoes/tipos'
import type {
  CampoDaPolitica,
  JanelaDeDiscagem,
  PoliticaDeDiscagem,
} from '@/discagem/tipos'

// Faixas das colunas -------------------------------------------------------------

type CampoNumerico = Exclude<CampoDaPolitica, 'janela' | 'tetoDeGastoCentavos'>

/** O `check` de cada coluna em `account_settings`, na migração da política. */
export const FAIXAS: Readonly<Record<CampoNumerico, { minimo: number; maximo: number }>> = {
  intervaloMinimoMinutos: { minimo: 0, maximo: 10080 },
  tentativasPorNumero: { minimo: 1, maximo: 20 },
  tetoDiarioDeLigacoes: { minimo: 1, maximo: 100000 },
  duracaoMaximaSegundos: { minimo: 30, maximo: 3600 },
  simultaneidade: { minimo: 1, maximo: 10 },
}

/** A ordem em que a tela desenha e em que o resumo do que mudou é escrito. */
export const CAMPOS: readonly CampoDaPolitica[] = [
  'janela',
  'intervaloMinimoMinutos',
  'tentativasPorNumero',
  'tetoDiarioDeLigacoes',
  'tetoDeGastoCentavos',
  'duracaoMaximaSegundos',
  'simultaneidade',
]

/** Segunda a domingo, que é como a semana de trabalho se lê. */
export const DIAS_NA_ORDEM = ['1', '2', '3', '4', '5', '6', '0'] as const

// Padrão das colunas ------------------------------------------------------------

/**
 * A política com que a conta nasce: o `default` de cada coluna em
 * `account_settings`, na migração da política. É o que o assistente chama de
 * padrão. `padroes-da-configuracao.test.ts` compara as duas fontes, e mudar o
 * default na migração sem mudar aqui derruba o teste.
 */
export const POLITICA_PADRAO: PoliticaDeDiscagem = {
  janela: {
    '1': { start: '09:00', end: '18:00' },
    '2': { start: '09:00', end: '18:00' },
    '3': { start: '09:00', end: '18:00' },
    '4': { start: '09:00', end: '18:00' },
    '5': { start: '09:00', end: '18:00' },
  },
  intervaloMinimoMinutos: 60,
  tentativasPorNumero: 3,
  tetoDiarioDeLigacoes: 200,
  tetoDeGastoCentavos: null,
  duracaoMaximaSegundos: 600,
  simultaneidade: 5,
}

// Limite do provedor --------------------------------------------------------------

export type QuemLimita = 'voz' | 'telefonia' | 'ambos' | 'coluna'

export interface LimiteDeSimultaneidade {
  /** O maior valor que a tela aceita agora. */
  teto: number
  /** Quem está mandando no teto. */
  manda: QuemLimita
  /** Sessões simultâneas no provedor de voz; nulo quando não se leu. */
  voz: number | null
  /** Canais na telefonia; nulo quando não se leu. */
  telefonia: number | null
}

function limiteDe(integracoes: readonly Integracao[] | null, provedor: 'voz' | 'telefonia') {
  const limite = integracoes?.find((item) => item.provedor === provedor)?.cota?.limite
  return typeof limite === 'number' && Number.isFinite(limite) && limite > 0 ? limite : null
}

/**
 * O teto da simultaneidade: o menor entre sessões do provedor de voz e canais
 * da telefonia, e nunca acima do check da coluna. `integracoes` nulo é
 * `integrations-status` fora do ar, e aí vale só a coluna.
 */
export function limiteDeSimultaneidade(
  integracoes: readonly Integracao[] | null,
): LimiteDeSimultaneidade {
  const voz = limiteDe(integracoes, 'voz')
  const telefonia = limiteDe(integracoes, 'telefonia')
  const daColuna = FAIXAS.simultaneidade.maximo
  const lidos = [voz, telefonia].filter((valor): valor is number => valor !== null)

  if (lidos.length === 0) return { teto: daColuna, manda: 'coluna', voz, telefonia }

  const menor = Math.min(...lidos)
  if (menor > daColuna) return { teto: daColuna, manda: 'coluna', voz, telefonia }

  const manda: QuemLimita =
    voz === menor && telefonia === menor ? 'ambos' : voz === menor ? 'voz' : 'telefonia'
  return { teto: menor, manda, voz, telefonia }
}

// Rascunho do formulário ----------------------------------------------------------

export interface FaixaDoRascunho {
  ligado: boolean
  inicio: string
  fim: string
}

/** O que está nos campos: texto, como a pessoa digitou. */
export interface RascunhoDaPolitica {
  janela: Record<string, FaixaDoRascunho>
  intervaloMinimoMinutos: string
  tentativasPorNumero: string
  tetoDiarioDeLigacoes: string
  /** Em reais, com vírgula. Em branco é sem teto. */
  tetoDeGastoReais: string
  duracaoMaximaSegundos: string
  simultaneidade: string
}

const FAIXA_PADRAO = { inicio: '09:00', fim: '18:00' }

export function rascunhoDe(politica: PoliticaDeDiscagem): RascunhoDaPolitica {
  const janela: Record<string, FaixaDoRascunho> = {}
  for (const dia of DIAS_NA_ORDEM) {
    const faixa = politica.janela[dia]
    janela[dia] = faixa
      ? { ligado: true, inicio: faixa.start, fim: faixa.end }
      : { ligado: false, ...FAIXA_PADRAO }
  }
  return {
    janela,
    intervaloMinimoMinutos: String(politica.intervaloMinimoMinutos),
    tentativasPorNumero: String(politica.tentativasPorNumero),
    tetoDiarioDeLigacoes: String(politica.tetoDiarioDeLigacoes),
    tetoDeGastoReais:
      politica.tetoDeGastoCentavos === null ? '' : reaisDe(politica.tetoDeGastoCentavos),
    duracaoMaximaSegundos: String(politica.duracaoMaximaSegundos),
    simultaneidade: String(politica.simultaneidade),
  }
}

function reaisDe(centavos: number): string {
  const reais = Math.floor(centavos / 100)
  const resto = centavos % 100
  return resto === 0 ? String(reais) : `${reais},${String(resto).padStart(2, '0')}`
}

// Validação -----------------------------------------------------------------------

export type MotivoDoCampo =
  | 'nao-e-numero'
  | 'fora-da-faixa'
  | 'acima-do-provedor'
  | 'hora-invalida'
  | 'faixa-sem-duracao'

export type ErrosDaPolitica = Partial<Record<CampoDaPolitica, MotivoDoCampo>>

export type ValidacaoDaPolitica =
  | { ok: true; politica: PoliticaDeDiscagem }
  | { ok: false; erros: ErrosDaPolitica; diasComErro: string[] }

const INTEIRO = /^[0-9]+$/
const REAIS = /^[0-9]+(,[0-9]{1,2})?$/
/** As mesmas regras de `validar_janela_de_discagem` e de `janela.ts`. */
const HORA_DO_RELOGIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const FIM_DO_DIA = '24:00'

function inteiroNaFaixa(
  texto: string,
  faixa: { minimo: number; maximo: number },
): number | MotivoDoCampo {
  const limpo = texto.trim()
  if (!INTEIRO.test(limpo)) return 'nao-e-numero'
  const valor = Number(limpo)
  if (valor < faixa.minimo || valor > faixa.maximo) return 'fora-da-faixa'
  return valor
}

function motivoDaFaixa(faixa: FaixaDoRascunho): MotivoDoCampo | null {
  if (!HORA_DO_RELOGIO.test(faixa.inicio)) return 'hora-invalida'
  if (!HORA_DO_RELOGIO.test(faixa.fim) && faixa.fim !== FIM_DO_DIA) return 'hora-invalida'
  // Largura fixa faz a comparação de texto ordenar como o relógio.
  if (faixa.fim <= faixa.inicio) return 'faixa-sem-duracao'
  return null
}

/**
 * Só os dias marcados com faixa válida. É o que a prévia desenha enquanto a
 * pessoa digita: dia com hora pela metade fica fora da prévia, e não a derruba.
 */
export function janelaValidaDoRascunho(rascunho: RascunhoDaPolitica): JanelaDeDiscagem {
  const janela: Record<string, { start: string; end: string }> = {}
  for (const dia of DIAS_NA_ORDEM) {
    const faixa = rascunho.janela[dia]
    if (faixa?.ligado && motivoDaFaixa(faixa) === null) {
      janela[dia] = { start: faixa.inicio, end: faixa.fim }
    }
  }
  return janela
}

/**
 * Converte o rascunho em política, ou diz o que está torto campo a campo. A
 * simultaneidade é conferida contra `tetoDeSimultaneidade`, que vem de
 * `limiteDeSimultaneidade`: acima dele é `acima-do-provedor`, e não
 * `fora-da-faixa`, porque a saída é outra — contratar mais no provedor, e não
 * digitar outro número.
 */
export function validarPolitica(
  rascunho: RascunhoDaPolitica,
  tetoDeSimultaneidade: number,
): ValidacaoDaPolitica {
  const erros: ErrosDaPolitica = {}
  const diasComErro: string[] = []

  const janela: Record<string, { start: string; end: string }> = {}
  for (const dia of DIAS_NA_ORDEM) {
    const faixa = rascunho.janela[dia]
    if (!faixa?.ligado) continue
    const motivo = motivoDaFaixa(faixa)
    if (motivo) {
      erros.janela ??= motivo
      diasComErro.push(dia)
      continue
    }
    janela[dia] = { start: faixa.inicio, end: faixa.fim }
  }

  const numericos = {} as Record<CampoNumerico, number>
  for (const campo of Object.keys(FAIXAS) as CampoNumerico[]) {
    const lido = inteiroNaFaixa(rascunho[campo], FAIXAS[campo])
    if (typeof lido === 'number') numericos[campo] = lido
    else erros[campo] = lido
  }

  if (erros.simultaneidade === undefined && numericos.simultaneidade > tetoDeSimultaneidade) {
    erros.simultaneidade = 'acima-do-provedor'
  }

  let tetoDeGastoCentavos: number | null = null
  const gasto = rascunho.tetoDeGastoReais.trim()
  if (gasto !== '') {
    if (!REAIS.test(gasto)) {
      erros.tetoDeGastoCentavos = 'nao-e-numero'
    } else {
      const [reais = '0', centavos = ''] = gasto.split(',')
      const total = Number(reais) * 100 + Number(centavos.padEnd(2, '0'))
      if (total <= 0) erros.tetoDeGastoCentavos = 'fora-da-faixa'
      else tetoDeGastoCentavos = total
    }
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros, diasComErro }

  return {
    ok: true,
    politica: { janela, tetoDeGastoCentavos, ...numericos },
  }
}

// O que mudou ---------------------------------------------------------------------

/** Chaves ordenadas: `jsonb` não promete ordem, e a mesma janela daria duas leituras. */
function janelaCanonica(janela: JanelaDeDiscagem): string {
  return JSON.stringify(
    Object.keys(janela)
      .sort()
      .map((dia) => [dia, janela[dia]?.start, janela[dia]?.end]),
  )
}

function igual(campo: CampoDaPolitica, antes: PoliticaDeDiscagem, depois: PoliticaDeDiscagem) {
  if (campo === 'janela') return janelaCanonica(antes.janela) === janelaCanonica(depois.janela)
  return antes[campo] === depois[campo]
}

/** Os campos que diferem, na ordem da tela. */
export function camposMudados(
  antes: PoliticaDeDiscagem,
  depois: PoliticaDeDiscagem,
): CampoDaPolitica[] {
  return CAMPOS.filter((campo) => !igual(campo, antes, depois))
}

/** Só o que mudou, para o RPC gravar e a trilha registrar só isso. */
export function mudancasDe(
  antes: PoliticaDeDiscagem,
  depois: PoliticaDeDiscagem,
): Partial<PoliticaDeDiscagem> {
  const mudancas: Partial<PoliticaDeDiscagem> = {}
  for (const campo of camposMudados(antes, depois)) {
    Object.assign(mudancas, { [campo]: depois[campo] })
  }
  return mudancas
}

// Prévia da janela ----------------------------------------------------------------

/** Os dois fusos que a prévia mostra (T-21, R-10). */
export const FUSOS_DA_PREVIA = ['America/Sao_Paulo', 'America/Manaus'] as const

export interface PreviaDoDia {
  dia: string
  frases: { fuso: (typeof FUSOS_DA_PREVIA)[number]; frase: string }[]
}

const DIA_EM_MS = 86_400_000

/**
 * O meio-dia em UTC do próximo dia da semana pedido, a partir de `agora`. Ao
 * meio-dia em UTC todo fuso do Brasil (UTC−2 a UTC−5) está na mesma data civil,
 * e por isso o dia da semana de UTC é o do lead.
 */
function meioDiaDo(dia: number, agora: number): string {
  const hoje = Math.floor(agora / DIA_EM_MS) * DIA_EM_MS + DIA_EM_MS / 2
  const diaDeHoje = new Date(hoje).getUTCDay()
  const adiante = (dia - diaDeHoje + 7) % 7
  return new Date(hoje + adiante * DIA_EM_MS).toISOString()
}

/**
 * Como cada faixa fica para um lead em São Paulo e para um em Manaus, lida do
 * relógio da conta. A janela vale no fuso do lead: a mesma faixa das 9h às 18h
 * é das 10h às 19h para quem administra em São Paulo e liga para Manaus.
 */
export function previaDaJanela(
  janela: JanelaDeDiscagem,
  fusoDaConta: string,
  agora: number,
): PreviaDoDia[] {
  return DIAS_NA_ORDEM.filter((dia) => janela[dia]).map((dia) => {
    const instante = meioDiaDo(Number(dia), agora)
    return {
      dia,
      frases: FUSOS_DA_PREVIA.map((fuso) => ({
        fuso,
        frase: fraseDaJanela({ janela, instante, fusoDoLead: fuso, fusoDaConta }),
      })),
    }
  })
}
