/**
 * A classificação na ficha da chamada (RF-414, RF-415), fora do componente
 * para ser testada sem montar a tela.
 *
 * Três regras:
 *
 * 1. **A fonte vira frase.** `classification_source` é código de banco; a
 *    tela diz "registrada na conversa", "classificada depois da conversa, com
 *    confiança de 72%" ou "corrigida por Ana em 21/09 às 14h12". Fonte que
 *    este arquivo não conhece não ganha frase inventada: devolve nulo.
 * 2. **A etapa viaja pela chave.** A correção mostra o rótulo e manda a chave,
 *    e a classificação corrigida é a atual com `stage_key` trocado: o resumo e
 *    o que mais o modelo gravou continuam, porque a correção é da etapa.
 * 3. **O rótulo se lê do funil de hoje.** A chave que não existe mais no funil
 *    aparece como tal, e nunca como a primeira etapa da lista.
 */

import type { EtapaDaCorrecao, FichaDaChamada } from '@/chamadas/tipos'
import { fonte as copy } from '@/copy/chamada'

export type FonteDaClassificacao =
  | { tipo: 'conversa' }
  | { tipo: 'retaguarda'; confianca: number | null }
  | { tipo: 'correcao'; por: string | null; em: string | null }

type CamposDaFonte = Pick<
  FichaDaChamada,
  'origemDaClassificacao' | 'confiancaDaClassificacao' | 'corrigidaPor' | 'corrigidaEm'
>

export function fonteDaClassificacao(ficha: CamposDaFonte): FonteDaClassificacao | null {
  switch (ficha.origemDaClassificacao) {
    case 'tool':
      return { tipo: 'conversa' }
    case 'backfill':
      return { tipo: 'retaguarda', confianca: ficha.confiancaDaClassificacao }
    case 'human':
      return { tipo: 'correcao', por: ficha.corrigidaPor, em: ficha.corrigidaEm }
    default:
      return null
  }
}

/** A confiança de 0 a 1 em porcentagem inteira. Fora da faixa é nulo. */
export function porcentagem(confianca: number | null): number | null {
  if (confianca === null || !Number.isFinite(confianca) || confianca < 0 || confianca > 1) {
    return null
  }
  return Math.round(confianca * 100)
}

/**
 * Dia e hora no formato da frase de correção: `21/09` e `14h12`. `fuso` fica
 * aberto para o teste fixar um; a tela usa o de quem olha.
 */
export function diaEHora(iso: string | null, fuso?: string): { dia: string; hora: string } | null {
  if (!iso) return null
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  const partes = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(fuso ? { timeZone: fuso } : {}),
  }).formatToParts(data)
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((item) => item.type === tipo)?.value ?? ''
  return { dia: `${parte('day')}/${parte('month')}`, hora: `${parte('hour')}h${parte('minute')}` }
}

export function fraseDaFonte(ficha: CamposDaFonte, fuso?: string): string | null {
  const fonte = fonteDaClassificacao(ficha)
  if (fonte === null) return null
  switch (fonte.tipo) {
    case 'conversa':
      return copy.conversa
    case 'retaguarda':
      return copy.retaguarda(porcentagem(fonte.confianca))
    case 'correcao': {
      const quando = diaEHora(fonte.em, fuso)
      return quando
        ? copy.correcao(fonte.por, quando.dia, quando.hora)
        : copy.correcaoSemHora(fonte.por)
    }
  }
}

/** O rótulo vigente de uma chave, ou nulo quando a etapa não existe mais. */
export function rotuloDaEtapa(etapas: readonly EtapaDaCorrecao[], chave: string): string | null {
  return etapas.find((etapa) => etapa.chave === chave)?.rotulo ?? null
}

/** A classificação que vai para `corrigir_classificacao`: a atual, com a etapa trocada. */
export function classificacaoCorrigida(
  atual: Readonly<Record<string, unknown>>,
  chave: string,
): Record<string, unknown> {
  return { ...atual, stage_key: chave }
}
