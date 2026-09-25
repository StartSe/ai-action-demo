// Adaptador Deno da função call-classify. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre a API do modelo, e entrega a decisão para
// `classificacao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth interna.** Quem chama é `call-finalize` e, depois, `cron-call-recovery`,
// com a chave de serviço (o gateway continua em `verify_jwt = true`) e o
// cabeçalho `x-internal-secret`, conferido em `classificacao.ts` contra
// `SARAH_INTERNAL_SECRET`. Sem a variável, nenhum pedido passa.
//
// **O modelo é o da conta**, pelo OpenRouter que ela conectou
// (`_shared/modelo/pergunta.ts`). A instalação não tem chave de modelo: conta
// sem modelo conectado recebe a frase que manda conectar, e nenhuma pergunta
// sai com chave que não seja dela.
//
// **O lead e a etapa se gravam como em `tool-qualify/index.ts`**: briefing
// mesclado (a conversa vence nas chaves que confirmou), sentimento nulo não
// apaga o último, e a etapa pelo RPC `mover_lead_de_etapa` com `actor='agent'`,
// em que `mesma_etapa` não é falha. A régua é `REGUA_DE_EXEMPLO`, provisória
// pela pergunta 1 da seção 13 de docs/PRD.md, a mesma da ferramenta. A falha do
// modelo abre a pendência por `registrar_item_de_fila`.
//
// **PARA O CI:** a chamada real ao modelo, a medição de latência sobre
// transcrição de 10 minutos (P-03) e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { perguntarAoModelo as perguntarPelaPorta } from '../_shared/modelo/pergunta.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'
import { COLUNAS_DO_CRITERIO, lerLinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'

import {
  CABECALHO_INTERNO,
  classificarChamada,
  type ChamadaParaClassificar,
  type EtapaDoFunil,
  type PortaDaClassificacao,
} from './classificacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

/** Metade dos 60 s da ficha (P-03). Passou disso, a recuperação tenta de novo. */
const LIMITE_DO_MODELO_MS = 30_000

/** A tarefa desta função na tabela de `_shared/modelo/resolucao.ts` (US-246). */
const TAREFA = 'classify' as const

/** O que `mover_lead_de_etapa` devolve quando o lead terminou na etapa pedida. */
const MOVIMENTOS_ACEITOS = new Set(['movido', 'mesma_etapa'])

/** O teto de saída, o mesmo nas duas portas. */
const TETO_DE_SAIDA = 4_000

/** Como a aplicação se identifica no painel de quem paga a conta do provedor. */
const APLICACAO = {
  url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined,
  nome: NOME_DO_PRODUTO,
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta: PortaDaClassificacao = {
  async lerChamada(chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select(
        'id, account_id, purpose, lead_id, direction, transcript, classification_source, sentiment, evaluation_score, evaluation',
      )
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as ChamadaParaClassificar | null) ?? null
  },

  async reivindicar(chamadaId) {
    const { data, error } = await servico.rpc('reivindicar_classificacao', { p_call_id: chamadaId })
    if (error) throw new Error(error.message)
    return data === chamadaId
  },

  async concluirClassificacao(chamadaId) {
    const { error } = await servico
      .from('calls')
      .update({ classified_at: new Date().toISOString() })
      .eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },

  async liberarReivindicacao(chamadaId) {
    const { error } = await servico.from('calls').update({ classify_started_at: null }).eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },

  async etapasDaConta(contaId) {
    // O funil padrão da conta: é nele que o lead nasce e é dele que a F2 lê.
    const { data, error } = await servico
      .from('pipeline_stages')
      .select('key, label, is_won, is_lost, pipelines!inner(is_default)')
      .eq('account_id', contaId)
      .eq('pipelines.is_default', true)
      .order('position')
    if (error) throw new Error(error.message)
    return ((data ?? []) as EtapaDoFunil[]).map(
      (linha): EtapaDoFunil => ({ key: linha.key, label: linha.label, is_won: linha.is_won, is_lost: linha.is_lost }),
    )
  },

  async reguaDaConta() {
    return REGUA_DE_EXEMPLO
  },

  async criteriosDaConta(contaId) {
    const { data, error } = await servico
      .from('evaluation_criteria')
      .select(COLUNAS_DO_CRITERIO)
      .eq('account_id', contaId)
      .order('position')
    if (error) throw new Error(error.message)
    return (data ?? []).map(lerLinhaDeCriterio)
  },

  async modeloDaConta(contaId) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', {
      p_account_id: contaId,
      p_tarefa: TAREFA,
    })
    if (error) throw new Error(error.message)
    return modeloDaTarefa((data ?? [])[0] ?? null, TAREFA)
  },

  async perguntarAoModelo(pedido) {
    // As duas portas moram em `_shared/modelo/pergunta.ts`: a do OpenRouter
    // inteira, e a da plataforma por este adaptador, que é quem tem o SDK.
    return await perguntarPelaPorta(
      pedido.contaId ?? '',
      { porta: pedido.porta === 'openrouter' ? 'openrouter' : 'platform', modelo: pedido.modelo, escolhidoPelaConta: false },
      { ...pedido, maxTokens: TETO_DE_SAIDA },
      {
        async chaveDoOpenRouter(contaId) {
          const { data, error } = await servico.rpc('get_account_secret', {
            p_account_id: contaId,
            p_provider: PROVEDOR_OPENROUTER,
            p_key_name: CHAVE_NO_COFRE,
          })
          if (error) throw new Error(error.message)
          return typeof data === 'string' && data.trim() !== '' ? data : null
        },
      },
      APLICACAO,
      LIMITE_DO_MODELO_MS,
    )
  },

  async gravarClassificacao(contaId, chamadaId, gravacao, condicao) {
    let consulta = servico.from('calls').update(gravacao).eq('account_id', contaId).eq('id', chamadaId)
    consulta =
      condicao === 'sem_origem'
        ? consulta.is('classification_source', null)
        : consulta.eq('classification_source', 'tool').is('evaluation_score', null)
    const { data, error } = await consulta.select('id')
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  },

  async gravarLead(gravacao) {
    const { data: atual, error: erroDeLeitura } = await servico
      .from('leads')
      .select('briefing')
      .eq('account_id', gravacao.contaId)
      .eq('id', gravacao.leadId)
      .maybeSingle()
    if (erroDeLeitura) throw new Error(erroDeLeitura.message)
    if (!atual) throw new Error('lead_ausente')

    const briefing = { ...((atual.briefing as Record<string, unknown> | null) ?? {}), ...gravacao.briefing }
    const { error } = await servico
      .from('leads')
      .update({
        briefing,
        score: gravacao.score,
        temperature: gravacao.temperatura,
        ...(gravacao.sentimento === null ? {} : { last_sentiment: gravacao.sentimento }),
      })
      .eq('account_id', gravacao.contaId)
      .eq('id', gravacao.leadId)
    if (error) throw new Error(error.message)
  },

  async moverEtapa(leadId, stageKey) {
    const { data, error } = await servico.rpc('mover_lead_de_etapa', {
      p_lead_id: leadId,
      p_stage_key: stageKey,
      p_actor: 'agent',
      p_actor_id: null,
    })
    if (error) throw new Error(error.message)
    const resultado = (data as { resultado: string }[] | null)?.[0]?.resultado ?? 'sem_resultado'
    if (!MOVIMENTOS_ACEITOS.has(resultado)) throw new Error(resultado)
  },

  async registrarItemDeFila(item) {
    const { data, error } = await servico.rpc('registrar_item_de_fila', {
      p_account_id: item.account_id,
      p_kind: item.kind,
      p_severity: item.severity,
      p_deduplicacao_key: item.deduplicacao_key,
      p_context: item.context,
      p_threshold_snapshot: null,
      p_lead_id: item.lead_id,
      p_call_id: item.call_id,
    })
    if (error) throw new Error(error.message)
    if (data !== 'criado' && data !== 'ja_aberto') throw new Error(String(data))
    return data
  },

  async gravarCusto(linha) {
    const { error } = await servico
      .from('call_costs')
      .upsert(linha, { onConflict: 'call_id,component,source', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },
}

Deno.serve(async (requisicao: Request) => {
  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em chamada_invalida, que já tem frase.
  }

  const resposta = await classificarChamada(
    {
      metodo: requisicao.method,
      chamadaId: corpo?.call_id ?? null,
      segredoInterno: requisicao.headers.get(CABECALHO_INTERNO),
    },
    porta,
    { segredoInterno: await segredoInterno() },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
})
