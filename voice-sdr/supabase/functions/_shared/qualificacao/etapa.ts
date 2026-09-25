// O mapeamento único de desfecho de conversa para etapa do funil (US-132,
// RF-203, segundo e terceiro critérios de aceite da F4).
//
// **Um lugar só decide qual desfecho vira qual etapa.** tool-qualify (a
// conversa ao vivo) e call-classify (a retaguarda) importam este módulo. Se
// cada um tivesse o seu mapeamento, os dois caminhos do segundo critério da F4
// deixariam de produzir o mesmo tipo de resultado no primeiro ajuste, e a
// divergência só apareceria como lead parado na etapa errada.
//
// **A função nunca olha `label`.** O catálogo traz o rótulo porque é a linha
// inteira da conta, mas a decisão é pela chave: renomear "Qualificado" para
// "Tem fit" não muda saída nenhuma, e o teste prova isso renomeando todas.
//
// **Catálogo sem a etapa alvo devolve motivo**, e nunca cai na primeira nem na
// última etapa: escolher por proximidade é inventar classificação.
//
// O motivo é código (`etapa_ausente_no_catalogo`, `desfecho_desconhecido`); a
// frase em português mora em `app/src/copy/` e na resposta da função de borda.
//
// Módulo portável: sem Deno e sem import de rede, importável pela interface por
// `@compartilhado/qualificacao/etapa.ts`.

/** Uma etapa do funil da conta, como `pipeline_stages` a guarda. */
export interface EtapaDoCatalogo {
  readonly key: string
  readonly label: string
  readonly is_won: boolean
  readonly is_lost: boolean
}

/** As seis chaves canônicas, iguais ao check de `pipeline_stages`. */
export const CHAVES_CANONICAS = [
  'new',
  'contacted',
  'qualified',
  'meeting_booked',
  'won',
  'lost',
] as const

export type ChaveCanonica = (typeof CHAVES_CANONICAS)[number]

/**
 * O desfecho de conversa que a ferramenta e a retaguarda sabem nomear, e a
 * etapa canônica de cada um. É dado, não `switch`: desfecho novo entra aqui.
 */
export const DESFECHO_PARA_ETAPA: Readonly<Record<string, ChaveCanonica>> = Object.freeze({
  atendeu_sem_qualificar: 'contacted',
  qualificado: 'qualified',
  reuniao_marcada: 'meeting_booked',
  ganho: 'won',
  sem_fit: 'lost',
  sem_interesse: 'lost',
  perdido: 'lost',
})

export type MotivoDaEtapa = 'etapa_ausente_no_catalogo' | 'desfecho_desconhecido'

export type EtapaResolvida =
  | { readonly ok: true; readonly stageKey: string }
  | { readonly ok: false; readonly motivo: MotivoDaEtapa }

const SLUG = /^[a-z][a-z0-9_]{2,31}$/

/**
 * Resolve o desfecho em chave de etapa do catálogo da conta. Aceita o nome do
 * desfecho (`qualificado`) ou a própria chave de uma etapa (canônica ou da
 * conta), que é o que a ferramenta manda em `stage_key`.
 */
export function resolverEtapa(
  desfecho: string,
  catalogo: readonly EtapaDoCatalogo[],
): EtapaResolvida {
  const chaves = new Set(catalogo.map((etapa) => etapa.key))
  const mapeada = Object.prototype.hasOwnProperty.call(DESFECHO_PARA_ETAPA, desfecho)
    ? DESFECHO_PARA_ETAPA[desfecho]
    : undefined

  if (mapeada !== undefined) {
    return chaves.has(mapeada)
      ? { ok: true, stageKey: mapeada }
      : { ok: false, motivo: 'etapa_ausente_no_catalogo' }
  }

  if ((CHAVES_CANONICAS as readonly string[]).includes(desfecho)) {
    return chaves.has(desfecho)
      ? { ok: true, stageKey: desfecho }
      : { ok: false, motivo: 'etapa_ausente_no_catalogo' }
  }

  if (SLUG.test(desfecho) && chaves.has(desfecho)) {
    return { ok: true, stageKey: desfecho }
  }

  return { ok: false, motivo: 'desfecho_desconhecido' }
}
