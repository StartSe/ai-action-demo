// A primeira via da retaguarda: a finalização decide, ao fim, se aciona
// `call-classify` (US-140, RF-410).
//
// **Houve `tool-qualify`? Então nada.** Quem ouviu a conversa foi a ferramenta,
// e a retaguarda não a sobrescreve. **Faltou, pelo módulo da US-138? Então
// aciona**, na mesma passagem. Faltar a qualificação não é erro: é o gatilho
// (`faltouQualificar`, em `_shared/qualificacao/obrigatoriedade.ts`).
//
// Fora de descoberta, a qualificação não é obrigatória, e a retaguarda vale
// como valia desde a F2: atendida por gente, com fala do lead e sem
// classificação, aciona. Atendida por máquina nunca aciona: a saudação da
// caixa postal chega como fala do interlocutor, e seria classificada como
// lead.
//
// **Esta decisão não garante uma classificação só.** Quem garante é a
// reivindicação de `call-classify` (`reivindicar_classificacao`, T-15): a
// finalização e `cron-call-recovery` podem acionar no mesmo segundo, e a que
// perde lê 409.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  FERRAMENTA_DE_QUALIFICACAO,
  faltouQualificar,
  type ChamadaParaQualificacao,
  type InvocacaoRegistrada,
} from '../_shared/qualificacao/obrigatoriedade.ts'

/**
 * Por que a retaguarda foi acionada ou não.
 *
 * - `qualificada`: `tool-qualify` gravou durante a conversa, ou a chamada já
 *   tem classificação.
 * - `faltou_qualificar`: descoberta atendida que terminou sem qualificação.
 * - `sem_classificacao`: outro propósito, com fala do lead e sem classificação.
 * - `dispensada`: máquina, ninguém atendeu, ou o lead não falou.
 */
export type MotivoDaRetaguarda = 'qualificada' | 'faltou_qualificar' | 'sem_classificacao' | 'dispensada'

export interface ChamadaParaARetaguarda extends ChamadaParaQualificacao {
  readonly classification_source: string | null
}

export interface ConversaParaARetaguarda {
  /** Falso quando a detecção de caixa postal decidiu máquina. */
  readonly atendidaPorGente: boolean
  readonly leadFalou: boolean
}

export function decidirRetaguarda(
  chamada: ChamadaParaARetaguarda,
  conversa: ConversaParaARetaguarda,
  invocacoes: readonly InvocacaoRegistrada[],
): MotivoDaRetaguarda {
  if (!conversa.atendidaPorGente) return 'dispensada'
  const qualificou = invocacoes.some((i) => i.tool === FERRAMENTA_DE_QUALIFICACAO && i.error === null)
  if (qualificou || chamada.classification_source !== null) return 'qualificada'
  if (faltouQualificar(chamada, invocacoes)) return 'faltou_qualificar'
  return conversa.leadFalou ? 'sem_classificacao' : 'dispensada'
}

/** Os motivos que acionam `call-classify`. */
export function acionaRetaguarda(motivo: MotivoDaRetaguarda): boolean {
  return motivo === 'faltou_qualificar' || motivo === 'sem_classificacao'
}
