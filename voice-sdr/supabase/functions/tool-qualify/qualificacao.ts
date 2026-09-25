// tool-qualify: a qualificação registrada durante a ligação (US-136, RF-203,
// primeiro e segundo critérios de aceite da F4).
//
// **Uma passagem só de escrita.** Score e temperatura saem de
// `_shared/qualificacao/pontuacao.ts`, a etapa de `_shared/qualificacao/etapa.ts`
// (o mesmo mapeamento que call-classify usa), e as escritas são três, todas em
// `efeitos`: o lead (briefing com pain, fit, objections e next_action, score,
// temperature e last_sentiment), a etapa pelo RPC mover_lead_de_etapa com
// actor='agent', e a classificação da chamada com classification_source='tool'
// e confiança nula — quem qualificou foi a conversa, não um modelo julgando
// depois. Nenhum segundo caminho de escrita existe. O formato do que se grava é
// de `_shared/qualificacao/resultado.ts`, o mesmo que call-classify usa.
//
// **Campo não confirmado vai vazio.** pain ausente não vira frase genérica; o
// briefing só leva o que veio na entrada.
//
// **meeting_outcome é aceito e ignorado** enquanto o contexto da chamada não
// trouxer `meeting_id`: o vínculo da chamada com a reunião é da F5, e sem ele não
// há a que atribuir comparecimento. Nenhum efeito lê o campo.
//
// **Ensaio** (T-16): o esqueleto pula `efeitos` quando `calls.direction` é
// rehearsal, então o ensaio lê de verdade, responde a mesma fala e não escreve.
//
// DEPENDE DA PERGUNTA 1 EM ABERTO (seção 13 de docs/PRD.md): o que caracteriza
// um lead qualificado, e portanto qual stage_key cada desfecho produz, vem da
// resposta dela. A régua entra pela leitura da conta.
//
// Módulo portável: o `index.ts` é o adaptador Deno.

import { DESCRITOR_DA_QUALIFICACAO } from '../_shared/ferramentas/tool-qualify.ts'
import { resolverEtapa, type EtapaDoCatalogo } from '../_shared/qualificacao/etapa.ts'
import { calcularPontuacao, type Regua } from '../_shared/qualificacao/pontuacao.ts'
import {
  briefingDaEntrada,
  classificacaoDaQualificacao,
  respostasDaEntrada,
  sentimentoNaFaixa,
  type BriefingDoLead,
  type GravacaoDoLead,
} from '../_shared/qualificacao/resultado.ts'
import { FALAS_DA_QUALIFICACAO } from '../_shared/speech/qualificacao.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import {
  criarFerramenta,
  type ExecutorDaFerramenta,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** Os propósitos em que a ferramenta existe: os do descritor, que o catálogo da publicação lê. */
export const PROPOSITOS_DA_QUALIFICACAO = DESCRITOR_DA_QUALIFICACAO.propositos

/** Os códigos de recusa da ferramenta. A frase é da resposta, nunca o código. */
export type RecusaDaQualificacao = 'etapa_desconhecida' | 'lead_ausente' | 'regua_invalida'

/** O que `ler` consulta. Nunca escreve. */
export interface LeituraDaQualificacao {
  catalogoDeEtapas(contaId: string): Promise<readonly EtapaDoCatalogo[]>
  reguaDaConta(contaId: string): Promise<Regua>
}

export type { BriefingDoLead, GravacaoDoLead }

/** O que `efeitos` escreve. O esqueleto a entrega só fora do ensaio. */
export interface EscritaDaQualificacao {
  gravarLead(gravacao: GravacaoDoLead): Promise<void>
  /** Pelo RPC mover_lead_de_etapa, com actor='agent'. */
  moverEtapa(leadId: string, stageKey: string): Promise<void>
  /** classification com classification_source='tool' e confiança nula. */
  gravarClassificacao(
    contaId: string,
    chamadaId: string,
    classificacao: Readonly<Record<string, unknown>>,
  ): Promise<void>
}

export interface PlanoDaQualificacao {
  readonly leadId: string
  readonly stageKey: string
  readonly gravacao: GravacaoDoLead
  readonly classificacao: Readonly<Record<string, unknown>>
}

/** O briefing só com o que veio preenchido. Mora em `_shared/qualificacao/resultado.ts`. */
export { briefingDaEntrada }

function recusa(erro: RecusaDaQualificacao): ResultadoDoExecutor<PlanoDaQualificacao> {
  return { ok: false, erro, data: null, speech: FALAS_DAS_FERRAMENTAS.falha }
}

/** Os campos que o esqueleto cobra, também lidos pelo canal de WhatsApp. */
export const OBRIGATORIOS_DA_QUALIFICACAO = [{ chave: 'stage_key', nome: 'etapa' }] as const

export function criarToolQualify(
  leitura: LeituraDaQualificacao,
): TratadorDeFerramenta<EscritaDaQualificacao> {
  return criarFerramenta<EscritaDaQualificacao, PlanoDaQualificacao>({
    nome: DESCRITOR_DA_QUALIFICACAO.nome,
    propositos: [...PROPOSITOS_DA_QUALIFICACAO],
    obrigatorios: OBRIGATORIOS_DA_QUALIFICACAO,
    executar: executorDaQualificacao(leitura),
  })
}

/**
 * O executor da ferramenta, sem o tratador HTTP. É o mesmo que o esqueleto
 * roda na ligação, e o canal de WhatsApp o roda por `execucao-direta.ts`.
 */
export function executorDaQualificacao(
  leitura: LeituraDaQualificacao,
): ExecutorDaFerramenta<EscritaDaQualificacao, PlanoDaQualificacao> {
  return {
    async ler(contexto) {
      const leadId = contexto.chamada.lead_id
      if (leadId === null) return recusa('lead_ausente')

      const [catalogo, regua] = await Promise.all([
        leitura.catalogoDeEtapas(contexto.contaId),
        leitura.reguaDaConta(contexto.contaId),
      ])

      const etapa = resolverEtapa(String(contexto.entrada.stage_key), catalogo)
      if (!etapa.ok) return recusa('etapa_desconhecida')

      const pontuacao = calcularPontuacao(respostasDaEntrada(contexto.entrada.criterios), regua)
      if (!pontuacao.ok) return recusa('regua_invalida')

      const briefing = briefingDaEntrada(contexto.entrada)
      const sentimento = sentimentoNaFaixa(contexto.entrada.sentiment)
      const gravacao: GravacaoDoLead = {
        contaId: contexto.contaId,
        leadId,
        score: pontuacao.score,
        temperatura: pontuacao.temperatura,
        sentimento,
        briefing,
      }
      const classificacao = classificacaoDaQualificacao({ stageKey: etapa.stageKey, pontuacao, briefing, sentimento })

      return {
        data: { lead_id: leadId, score: pontuacao.score },
        speech: FALAS_DA_QUALIFICACAO.registrada,
        plano: { leadId, stageKey: etapa.stageKey, gravacao, classificacao },
      }
    },

    async efeitos(contexto, leitura) {
      const plano = leitura.plano
      if (leitura.ok === false || plano === undefined) return
      await contexto.escrita.gravarLead(plano.gravacao)
      await contexto.escrita.moverEtapa(plano.leadId, plano.stageKey)
      await contexto.escrita.gravarClassificacao(contexto.contaId, contexto.chamada.id, plano.classificacao)
    },
  }
}
