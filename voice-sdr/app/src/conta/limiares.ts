// Os quatro limiares da fila de exceções (RF-915), como a tela de /config/conta
// os lê, edita e confere.
//
// Quem decide o que entra na fila é `_shared/fila/gatilhos.ts`, na finalização
// da chamada; este módulo só converte o que está nos campos em configuração e
// diz o que está fora do domínio. A conferência daqui existe para a tela
// recusar antes de mandar, com a frase certa; a fronteira continua sendo o
// `check` de cada coluna em `account_settings`, e os dois lados existem de
// propósito (a tela explica, o banco garante).

/** `account_settings`, pelos nomes da interface. */
export interface LimiaresDaFila {
  /** `sentiment_floor`, de -1 a 1. */
  pisoDeSentimento: number
  /** `consecutive_failures_cap`, maior que zero. */
  tetoDeFalhas: number
  /** `failed_criteria_cap`, maior que zero. */
  tetoDeCriterios: number
  /** `credit_alert_cents`. Nulo é "sem aviso de crédito", nunca zero. */
  avisoDeCreditoCentavos: number | null
}

export type CampoDoLimiar = keyof LimiaresDaFila

/** A ordem em que a tela os mostra. */
export const CAMPOS_DOS_LIMIARES: readonly CampoDoLimiar[] = [
  'pisoDeSentimento',
  'tetoDeFalhas',
  'tetoDeCriterios',
  'avisoDeCreditoCentavos',
]

/** A coluna de cada limiar. O serviço lê e grava por aqui. */
export const COLUNA_DO_LIMIAR: Readonly<Record<CampoDoLimiar, string>> = {
  pisoDeSentimento: 'sentiment_floor',
  tetoDeFalhas: 'consecutive_failures_cap',
  tetoDeCriterios: 'failed_criteria_cap',
  avisoDeCreditoCentavos: 'credit_alert_cents',
}

/**
 * O `default` de cada coluna. Espelho das migrações
 * `20260929100000_limiares_da_fila.sql` e `20260921230000_politica_da_conta.sql`;
 * `padroes-da-configuracao.test.ts` compara os dois lados.
 */
export const LIMIARES_PADRAO: LimiaresDaFila = {
  pisoDeSentimento: -0.5,
  tetoDeFalhas: 3,
  tetoDeCriterios: 1,
  avisoDeCreditoCentavos: null,
}

/** O maior `smallint`: os dois tetos são dessa largura. */
const MAIOR_SMALLINT = 32767
/** O maior `integer`, em centavos. */
const MAIOR_INTEGER = 2147483647

// Rascunho --------------------------------------------------------------------

/** O que está nos campos, como a pessoa digitou. O crédito vai em reais. */
export type RascunhoDosLimiares = Record<CampoDoLimiar, string>

/** Número com vírgula, sem zero à direita desnecessário (`-0,5`, `1`). */
function decimalDe(numero: number): string {
  return String(numero).replace('.', ',')
}

function reaisDe(centavos: number): string {
  const reais = Math.floor(centavos / 100)
  const resto = centavos % 100
  return resto === 0 ? String(reais) : `${reais},${String(resto).padStart(2, '0')}`
}

export function rascunhoDe(limiares: LimiaresDaFila): RascunhoDosLimiares {
  return {
    pisoDeSentimento: decimalDe(limiares.pisoDeSentimento),
    tetoDeFalhas: String(limiares.tetoDeFalhas),
    tetoDeCriterios: String(limiares.tetoDeCriterios),
    avisoDeCreditoCentavos:
      limiares.avisoDeCreditoCentavos === null ? '' : reaisDe(limiares.avisoDeCreditoCentavos),
  }
}

// Validação -------------------------------------------------------------------

export type ErrosDosLimiares = Partial<Record<CampoDoLimiar, 'fora-do-dominio'>>

export type ValidacaoDosLimiares =
  | { ok: true; limiares: LimiaresDaFila }
  | { ok: false; erros: ErrosDosLimiares }

/** Até duas casas, com vírgula ou ponto, e sinal opcional. */
const DECIMAL = /^-?[0-9]+([,.][0-9]{1,2})?$/
const INTEIRO = /^[0-9]+$/
const REAIS = /^[0-9]+(,[0-9]{1,2})?$/

function lerPiso(texto: string): number | null {
  const limpo = texto.trim()
  if (!DECIMAL.test(limpo)) return null
  const valor = Number(limpo.replace(',', '.'))
  // `-0` vira 0: o banco gravaria 0 de qualquer forma.
  return valor >= -1 && valor <= 1 ? valor + 0 : null
}

function lerTeto(texto: string): number | null {
  const limpo = texto.trim()
  if (!INTEIRO.test(limpo)) return null
  const valor = Number(limpo)
  return valor >= 1 && valor <= MAIOR_SMALLINT ? valor : null
}

/** Em branco é "sem aviso" (`null`), e nunca zero; zero é recusado. */
function lerCredito(texto: string): { valor: number | null } | null {
  const limpo = texto.trim()
  if (limpo === '') return { valor: null }
  if (!REAIS.test(limpo)) return null
  const [reais = '0', centavos = ''] = limpo.split(',')
  const valor = Number(reais) * 100 + Number(centavos.padEnd(2, '0'))
  return valor >= 1 && valor <= MAIOR_INTEGER ? { valor } : null
}

/** Converte o rascunho em limiares, ou diz qual campo está fora do domínio. */
export function validarLimiares(rascunho: RascunhoDosLimiares): ValidacaoDosLimiares {
  const erros: ErrosDosLimiares = {}

  const piso = lerPiso(rascunho.pisoDeSentimento)
  if (piso === null) erros.pisoDeSentimento = 'fora-do-dominio'
  const falhas = lerTeto(rascunho.tetoDeFalhas)
  if (falhas === null) erros.tetoDeFalhas = 'fora-do-dominio'
  const criterios = lerTeto(rascunho.tetoDeCriterios)
  if (criterios === null) erros.tetoDeCriterios = 'fora-do-dominio'
  const credito = lerCredito(rascunho.avisoDeCreditoCentavos)
  if (credito === null) erros.avisoDeCreditoCentavos = 'fora-do-dominio'

  if (piso === null || falhas === null || criterios === null || credito === null) {
    return { ok: false, erros }
  }
  return {
    ok: true,
    limiares: {
      pisoDeSentimento: piso,
      tetoDeFalhas: falhas,
      tetoDeCriterios: criterios,
      avisoDeCreditoCentavos: credito.valor,
    },
  }
}

/** Se algum limiar do rascunho difere do gravado. Sem mudança, não há o que salvar. */
export function limiaresMudaram(gravado: LimiaresDaFila, novo: LimiaresDaFila): boolean {
  return CAMPOS_DOS_LIMIARES.some((campo) => gravado[campo] !== novo[campo])
}

// Leitura para a tela --------------------------------------------------------

/**
 * O valor de um limiar como a tela o escreve: o piso com duas casas, os tetos
 * inteiros, o crédito em reais. `null` só existe no crédito, e quem escreve
 * "sem aviso" é a copy.
 */
export function valorLegivel(campo: CampoDoLimiar, limiares: LimiaresDaFila): string | null {
  switch (campo) {
    case 'pisoDeSentimento':
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(limiares.pisoDeSentimento)
    case 'tetoDeFalhas':
    case 'tetoDeCriterios':
      return String(limiares[campo])
    case 'avisoDeCreditoCentavos':
      return limiares.avisoDeCreditoCentavos === null
        ? null
        : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
            limiares.avisoDeCreditoCentavos / 100,
          )
  }
}

// Leitura da linha ------------------------------------------------------------

function numeroOuNulo(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  // O PostgREST pode devolver `numeric` como texto.
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) {
    return Number(valor)
  }
  return null
}

/** A linha de `account_settings` nos nomes da interface. Coluna ilegível cai no padrão. */
export function limiaresDaLinha(linha: Record<string, unknown>): LimiaresDaFila {
  return {
    pisoDeSentimento:
      numeroOuNulo(linha[COLUNA_DO_LIMIAR.pisoDeSentimento]) ?? LIMIARES_PADRAO.pisoDeSentimento,
    tetoDeFalhas: numeroOuNulo(linha[COLUNA_DO_LIMIAR.tetoDeFalhas]) ?? LIMIARES_PADRAO.tetoDeFalhas,
    tetoDeCriterios:
      numeroOuNulo(linha[COLUNA_DO_LIMIAR.tetoDeCriterios]) ?? LIMIARES_PADRAO.tetoDeCriterios,
    avisoDeCreditoCentavos: numeroOuNulo(linha[COLUNA_DO_LIMIAR.avisoDeCreditoCentavos]),
  }
}

/** Os limiares nas chaves das colunas, para o `update`. */
export function linhaDosLimiares(limiares: LimiaresDaFila): Record<string, number | null> {
  const linha: Record<string, number | null> = {}
  for (const campo of CAMPOS_DOS_LIMIARES) linha[COLUNA_DO_LIMIAR[campo]] = limiares[campo]
  return linha
}
