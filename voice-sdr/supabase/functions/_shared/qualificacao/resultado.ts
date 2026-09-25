// O resultado de uma qualificação, na forma que os dois caminhos gravam (US-139,
// segundo critério de aceite da F4).
//
// **Um formato só para a conversa e para a retaguarda.** tool-qualify (a Sarah
// qualificando ao vivo) e call-classify (o modelo lendo a transcrição depois)
// montam aqui o que vai para `leads` e para `calls.classification`. A etapa
// sai de `etapa.ts`, a pontuação de `pontuacao.ts`, e este módulo só junta as
// duas coisas com o briefing e o sentimento. Com dois montadores, "o mesmo
// tipo de resultado" deixaria de ser verdade no primeiro campo acrescentado a
// um lado só, e a ficha passaria a ler duas formas.
//
// O que cada caminho tem de próprio fica fora daqui: a retaguarda acrescenta a
// confiança do modelo, o modelo que respondeu e os campos que saíram vazios.
//
// Módulo portável, sem Deno e sem import de rede.

import type { Pontuacao, Temperatura } from './pontuacao.ts'

/** As chaves do briefing do lead que uma qualificação preenche. */
export const CHAVES_DO_BRIEFING = ['pain', 'fit', 'objections', 'next_action'] as const
export type ChaveDoBriefing = (typeof CHAVES_DO_BRIEFING)[number]

export type BriefingDoLead = Readonly<Partial<Record<ChaveDoBriefing, string>>>

/** O que se grava no lead, com a conta e o lead da chamada. */
export interface GravacaoDoLead {
  readonly contaId: string
  readonly leadId: string
  readonly score: number
  readonly temperatura: Temperatura
  readonly sentimento: number | null
  readonly briefing: BriefingDoLead
}

export type PontuacaoCalculada = Extract<Pontuacao, { ok: true }>

function textoConfirmado(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined
}

/** O briefing só com o que veio preenchido: campo não confirmado não vira frase genérica. */
export function briefingDaEntrada(entrada: Readonly<Record<string, unknown>>): BriefingDoLead {
  const briefing: Partial<Record<ChaveDoBriefing, string>> = {}
  for (const chave of CHAVES_DO_BRIEFING) {
    const valor = textoConfirmado(entrada[chave])
    if (valor !== undefined) briefing[chave] = valor
  }
  return briefing
}

/** Sentimento entre -1 e 1; fora disso é nulo, e não recortado. */
export function sentimentoNaFaixa(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= -1 && valor <= 1 ? valor : null
}

/**
 * As respostas por critério da régua: `true` atende, `false` desqualifica, e
 * qualquer outra coisa é não confirmado.
 */
export function respostasDaEntrada(valor: unknown): Record<string, boolean | null> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const saida: Record<string, boolean | null> = {}
  for (const [chave, resposta] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = typeof resposta === 'boolean' ? resposta : null
  }
  return saida
}

/**
 * O núcleo de `calls.classification`, igual nos dois caminhos. `stageKey` nulo
 * é etapa não confirmada: a retaguarda grava assim, a ferramenta recusa antes.
 */
export function classificacaoDaQualificacao(entrada: {
  readonly stageKey: string | null
  readonly pontuacao: PontuacaoCalculada
  readonly briefing: BriefingDoLead
  readonly sentimento: number | null
}): Record<string, unknown> {
  return {
    stage_key: entrada.stageKey,
    temperature: entrada.pontuacao.temperatura,
    score: entrada.pontuacao.score,
    ...entrada.briefing,
    sentiment: entrada.sentimento,
    criterios_atendidos: entrada.pontuacao.criteriosAtendidos,
    criterios_faltando: entrada.pontuacao.criteriosFaltando,
    criterios_reprovados: entrada.pontuacao.criteriosReprovados,
  }
}
