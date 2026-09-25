// As decisões puras do cartão do quadro (US-145, RF-205): de onde sai o sinal
// da Sarah e para onde o cartão pode ir. Nada aqui toca React nem rede, e é
// por isso que tudo se prova em `cartao.test.ts`.
//
// O sinal do agente é a **última** mudança de etapa, e só ela. Um lead que a
// Sarah qualificou e que alguém depois devolveu para "Contatado" foi movido
// por gente: manter o sinal ali atribuiria à Sarah uma posição que ela não
// escolheu.

import type {
  EtapaDoFunil,
  LeadDoFunil,
  MudancaDeEtapa,
} from '@/leads/tipos'

/** Um `stage_change` como a consulta o devolve, com o lead a que pertence. */
export interface MudancaDoLead extends MudancaDeEtapa {
  leadId: string
}

/**
 * A mudança mais recente de cada lead, pelo instante do fato. A ordem de
 * chegada não decide: a consulta pede `occurred_at desc`, mas quem escreve o
 * dublê ou muda a consulta não precisa lembrar disso para o sinal continuar
 * certo. Empate fica com a primeira que chegou.
 */
export function ultimaMudancaPorLead(
  mudancas: readonly MudancaDoLead[],
): Map<string, MudancaDeEtapa> {
  const ultimas = new Map<string, MudancaDeEtapa>()
  for (const { leadId, ator, em } of mudancas) {
    const atual = ultimas.get(leadId)
    if (!atual || Date.parse(em) > Date.parse(atual.em)) {
      ultimas.set(leadId, { ator, em })
    }
  }
  return ultimas
}

/** O cartão traz o sinal da Sarah quando a última mudança foi dela. */
export function movidoPelaSarah(
  lead: Pick<LeadDoFunil, 'ultimaMudancaDeEtapa'>,
): boolean {
  return lead.ultimaMudancaDeEtapa?.ator === 'agent'
}

/**
 * Para onde o cartão pode ir pelo teclado: toda etapa do funil menos a atual,
 * na ordem das colunas. Oferecer a etapa em que ele já está daria um
 * `mesma_etapa` a quem só queria ver a lista.
 */
export function destinosDoCartao(
  etapas: readonly EtapaDoFunil[],
  lead: Pick<LeadDoFunil, 'etapa'>,
): EtapaDoFunil[] {
  return etapas.filter((etapa) => etapa.chave !== lead.etapa?.chave)
}
