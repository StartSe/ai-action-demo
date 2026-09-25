// Os gatilhos da fila de exceções que uma chamada finalizada dispara (US-135,
// RF-909, RF-915, L-24). Função pura: sem banco e sem rede.
//
// **Os limiares vêm da conta, nunca de constante.** `itensDaChamada` recebe os
// quatro limiares de `account_settings` (sentiment_floor,
// consecutive_failures_cap, failed_criteria_cap e credit_alert_cents, que é o
// credit_floor_cents de RF-915) e não conhece valor padrão nenhum. É o quinto
// critério de aceite da F4: a mesma chamada com sentimento -0,6 gera item com o
// piso em -0,5 e não gera com o piso em -0,8.
//
// **Pedido de humano e pedido de bloqueio não nascem aqui.** Eles nascem na
// hora, pelas ferramentas da F3 (tool-transfer e tool-dnc), enquanto a pessoa
// ainda está na linha; repeti-los na finalização duplicaria o item com outra
// chave.
//
// **A chave é por causa, nunca por instante**: sentimento:<call_id>,
// avaliacao:<call_id>, falha:<telefone>:<dia> e credito:<provedor>:<dia>.
// Rodar a mesma finalização duas vezes produz as mesmas chaves, e
// `registrar_item_de_fila` não cria segundo item.
//
// **O limiar vigente viaja no item** (`thresholdSnapshot`): mudar o limiar
// depois não reescreve a fila de ontem, e o novo vale para a chamada seguinte.
//
// **A sequência de falhas entra pronta** (`historico`), contada de
// `call_attempts`, que é da F2. Um contador próprio aqui divergiria dela.
//
// **Ensaio não gera item** (T-16).
//
// Módulo portável, sem Deno e sem import de rede, importável pela interface por
// `@compartilhado/fila/gatilhos.ts`.

export interface LimiaresDaFila {
  readonly sentiment_floor: number
  readonly consecutive_failures_cap: number
  readonly failed_criteria_cap: number
  /** Nulo é sem gatilho de crédito, e não zero. */
  readonly credit_alert_cents: number | null
}

export interface ChamadaParaGatilhos {
  readonly id: string
  readonly direction: 'outbound' | 'inbound' | 'rehearsal'
  /** Atendida por gente: sentimento e avaliação só existem aí. */
  readonly atendida: boolean
  readonly sentimento: number | null
  /** Chaves dos critérios de avaliação reprovados. */
  readonly criteriosReprovados: readonly string[]
  readonly telefone: string
  /** Dia da chamada no fuso da conta, AAAA-MM-DD. */
  readonly dia: string
  readonly leadId: string | null
  /** Trecho da conversa que explica o item, nunca a transcrição inteira. */
  readonly trecho?: string | null
}

export interface HistoricoDaChamada {
  /** Tentativas consecutivas sem sucesso ao mesmo número, desta inclusive. */
  readonly falhasConsecutivas: number
  /** Saldo lido do provedor na finalização, quando lido. */
  readonly credito?: { readonly provedor: string; readonly saldoCents: number } | null
}

export type GeneroDoGatilho = 'sentimento_negativo' | 'avaliacao_reprovada' | 'falha_repetida' | 'credito_baixo'

export interface ItemDeFila {
  readonly kind: GeneroDoGatilho
  readonly severity: 'baixa' | 'media' | 'alta'
  readonly deduplicacaoKey: string
  readonly context: Readonly<Record<string, unknown>>
  readonly thresholdSnapshot: Readonly<Record<string, unknown>>
  readonly leadId: string | null
  readonly callId: string
}

export function itensDaChamada(
  chamada: ChamadaParaGatilhos,
  limiares: LimiaresDaFila,
  historico: HistoricoDaChamada,
): ItemDeFila[] {
  if (chamada.direction === 'rehearsal') return []

  const itens: ItemDeFila[] = []
  const base = { leadId: chamada.leadId, callId: chamada.id }
  const trecho = chamada.trecho ?? null

  if (chamada.atendida && chamada.sentimento !== null && chamada.sentimento <= limiares.sentiment_floor) {
    itens.push({
      ...base,
      kind: 'sentimento_negativo',
      severity: 'alta',
      deduplicacaoKey: `sentimento:${chamada.id}`,
      context: { call_id: chamada.id, sentimento: chamada.sentimento, trecho },
      thresholdSnapshot: { sentiment_floor: limiares.sentiment_floor },
    })
  }

  if (chamada.atendida && chamada.criteriosReprovados.length >= limiares.failed_criteria_cap) {
    itens.push({
      ...base,
      kind: 'avaliacao_reprovada',
      severity: 'media',
      deduplicacaoKey: `avaliacao:${chamada.id}`,
      context: { call_id: chamada.id, criterios: [...chamada.criteriosReprovados], trecho },
      thresholdSnapshot: { failed_criteria_cap: limiares.failed_criteria_cap },
    })
  }

  if (!chamada.atendida && historico.falhasConsecutivas >= limiares.consecutive_failures_cap) {
    itens.push({
      ...base,
      kind: 'falha_repetida',
      severity: 'media',
      deduplicacaoKey: `falha:${chamada.telefone}:${chamada.dia}`,
      context: { call_id: chamada.id, phone_e164: chamada.telefone, falhas: historico.falhasConsecutivas },
      thresholdSnapshot: { consecutive_failures_cap: limiares.consecutive_failures_cap },
    })
  }

  const credito = historico.credito
  if (limiares.credit_alert_cents !== null && credito && credito.saldoCents < limiares.credit_alert_cents) {
    itens.push({
      ...base,
      kind: 'credito_baixo',
      severity: 'alta',
      deduplicacaoKey: `credito:${credito.provedor}:${chamada.dia}`,
      context: { provedor: credito.provedor, saldo_cents: credito.saldoCents },
      thresholdSnapshot: { credit_alert_cents: limiares.credit_alert_cents },
    })
  }

  return itens
}
