// Adaptador Deno da função tool-qualify. Só amarração: lê o ambiente, monta as
// portas sobre o Supabase com a chave de serviço e entrega a decisão para
// `qualificacao.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. Não há sessão, e por isso o cliente usa a chave de
// serviço. O esqueleto confere o segredo antes de qualquer leitura por conversa.
//
// **A `PortaDeFerramentas` é a de `tool-dnc/index.ts` e `tool-transfer/index.ts`,
// copiada pela terceira vez.** A regra da casa é tirar para `_shared/` na
// terceira cópia, e aqui ela esbarra no limite de `_shared/`: o módulo não pode
// importar `npm:`, então o que sai é uma fábrica que recebe o cliente por
// parâmetro. Fica como dívida declarada desta história, para não mexer nas duas
// bordas da F3 no mesmo envio.
//
// **A etapa vai pelo RPC `mover_lead_de_etapa`**, com `actor='agent'` e sem
// `actor_id`: sem sessão, o RPC aceita o autor do parâmetro, e é `agent` que o
// cartão do quadro lê para mostrar o sinal da Sarah (RF-205). `mesma_etapa`
// não é falha: o lead já estava onde a conversa o deixou.
//
// **O briefing se mescla, não se substitui.** O que a importação ou uma
// conversa anterior gravou continua lá; a conversa de agora vence nas chaves
// que ela confirmou. Sentimento nulo não apaga o último sentimento gravado.
//
// **A régua é `REGUA_DE_EXEMPLO`**, provisória: DEPENDE DA PERGUNTA 1 EM ABERTO
// (seção 13 de docs/PRD.md). Quando a régua da conta ganhar coluna, a leitura
// passa a ser dela e nada mais muda.
//
// **PARA O CI:** o `deno check` deste arquivo e a suíte de contrato
// (`scripts/contrato-das-ferramentas.ts`) contra a função implantada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import type { EtapaDoCatalogo } from '../_shared/qualificacao/etapa.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import {
  CABECALHO_DA_CONVERSA,
  type AmbienteDaFerramenta,
  type ChamadaDaFerramenta,
  type PortaDeFerramentas,
} from '../_shared/tools/esqueleto.ts'

import { criarToolQualify, type EscritaDaQualificacao, type LeituraDaQualificacao } from './qualificacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
/**
 * A variável, quando alguém a definiu; senão derivada da chave de serviço
 * (`_shared/segredo-da-instalacao.ts`). `agent-publish` precisa resolver pelo
 * mesmo caminho para os dois lados concordarem.
 */
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
/** ISO 8601 com fuso. Vira milissegundos, que é o que `segredo.ts` lê. */
const ROTACIONADA_EM = (() => {
  const bruto = Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM') ?? ''
  const instante = Date.parse(bruto)
  return Number.isFinite(instante) ? instante : null
})()

const VALIDADE_DAS_CONTAS_MS = 60_000

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

/** O que `mover_lead_de_etapa` devolve quando o lead terminou na etapa pedida. */
const MOVIMENTOS_ACEITOS = new Set(['movido', 'mesma_etapa'])

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let contasEmCache: { lidasEm: number; ids: string[] } | null = null

const porta: PortaDeFerramentas = {
  async contasCandidatas() {
    const agora = Date.now()
    if (contasEmCache && agora - contasEmCache.lidasEm < VALIDADE_DAS_CONTAS_MS) return contasEmCache.ids
    const { data, error } = await servico.from('accounts').select('id')
    if (error) throw new Error(error.message)
    const ids = (data ?? []).map((linha: { id: string }) => linha.id)
    contasEmCache = { lidasEm: agora, ids }
    return ids
  },

  async chamadaDaConversa(contaId, conversaId): Promise<ChamadaDaFerramenta | null> {
    const { data, error } = await servico
      .from('calls')
      .select('id, account_id, purpose, direction, lead_id')
      .eq('account_id', contaId)
      .eq('provider_conversation_id', conversaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as ChamadaDaFerramenta | null) ?? null
  },

  async registrarInvocacao(invocacao) {
    const { error } = await servico.from('call_tool_invocations').insert(invocacao)
    if (error) throw new Error(error.message)
  },
}

const leitura: LeituraDaQualificacao = {
  async catalogoDeEtapas(contaId) {
    const { data, error } = await servico
      .from('pipeline_stages')
      .select('key, label, is_won, is_lost')
      .eq('account_id', contaId)
      .order('position')
    if (error) throw new Error(error.message)
    return (data ?? []) as EtapaDoCatalogo[]
  },

  async reguaDaConta() {
    return REGUA_DE_EXEMPLO
  },
}

const escrita: EscritaDaQualificacao = {
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

  async gravarClassificacao(contaId, chamadaId, classificacao) {
    const { error } = await servico
      .from('calls')
      .update({
        classification: classificacao,
        classification_source: 'tool',
        classification_confidence: null,
      })
      .eq('account_id', contaId)
      .eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },
}

const tratar = criarToolQualify(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDaQualificacao> = {
  porta,
  escrita,
  chaves: { vigente: CHAVE_DE_FERRAMENTAS, anterior: CHAVE_ANTERIOR, rotacionadaEm: ROTACIONADA_EM },
}

Deno.serve(async (requisicao) => {
  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    corpo = null
  }
  const resposta = await tratar(
    {
      metodo: requisicao.method,
      segredo: requisicao.headers.get('x-tool-secret'),
      conversa: requisicao.headers.get(CABECALHO_DA_CONVERSA),
      corpo,
    },
    ambiente,
  )
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
