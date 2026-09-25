// Adaptador Deno da função agent-publish. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase e a chamada ao provedor de voz, e entrega a
// decisão para `publicacao.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `publicacao.ts`, `formato-do-provedor.ts`
// e `respostas.ts`, que são portáveis e testados em `npm run test:unit`. Quem
// verifica este arquivo é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Por que a chave de serviço.** A função escreve em `integration_events`, que
// é da classe Servidor e não tem política de escrita de cliente, e em
// `agent_publications`, cuja política de escrita é de administrador. Quem
// confere o papel é `publicacao.ts`, lendo `account_members` antes de qualquer
// coisa: sem essa conferência, a chave de serviço publicaria em qualquer conta
// para qualquer sessão autenticada. O JWT é conferido pelo gateway (sem bloco
// em config.toml, o padrão é `verify_jwt = true`), e a sessão é lida de novo
// aqui porque a função precisa do usuário, não só da garantia de que existe um.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { COLUNAS_DO_CRITERIO, lerLinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  CHAVE_DO_SEGREDO_DO_FIM,
  PROVEDOR_DO_WEBHOOK,
} from '../_shared/provedor/webhooks-da-conta.ts'

import {
  atenderPublicacao,
  type PedidoAoProvedor,
  type PortaDePublicacao,
  type RespostaDoProvedor,
} from './publicacao.ts'
import type { IdaAoProvedor, VoltaDoProvedor } from './webhooks.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/**
 * A chave que deriva o `x-tool-secret` de cada conta. É da instalação, uma só,
 * e por isso não desce a cascata de `secrets.ts` — a razão está escrita em
 * `PortaDePublicacao.chaveDoServidorDeFerramentas`.
 */
// A variável, quando alguém a definiu; senão derivada da chave de serviço,
// pelo mesmo caminho de tool-dnc e tool-transfer, para os lados concordarem.
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})

/** O endereço das nossas funções de borda, que é para onde as ferramentas apontam. */
const ENDERECO_DAS_FERRAMENTAS = `${URL_DO_SUPABASE.replace(/\/+$/, '')}/functions/v1`

const ENDERECO_DA_API = 'https://api.elevenlabs.io/v1'
const ENDERECO_DO_PROVEDOR = `${ENDERECO_DA_API}/convai/agents`

/** Publicar não pode segurar a tela indefinidamente. Quatro propósitos, um a um. */
const LIMITE_DO_PROVEDOR_MS = 15_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject())

const portaDeCredenciais: PortaDeCredenciais = {
  async segredoDaConta(contaId, provedor, chave) {
    const { data, error } = await servico.rpc('get_account_secret', {
      p_account_id: contaId,
      p_provider: provedor,
      p_key_name: chave,
    })
    if (error) throw new Error(error.message)
    return typeof data === 'string' ? data : null
  },

  // O agente publicado seria o recurso do degrau do meio, mas ele não guarda
  // credencial própria: a chave do provedor de voz é da conta inteira.
  async segredoDoRecurso() {
    return null
  },

  segredoDaPlataforma(provedor, chave) {
    return lerPlataforma(provedor, chave)
  },

  async modoDeCredencial(contaId) {
    const { data, error } = await servico
      .from('accounts')
      .select('credentials_mode')
      .eq('id', contaId)
      .maybeSingle()
    if (error) return 'account'
    const modo = (data as { credentials_mode?: string } | null)?.credentials_mode
    return modo === 'platform' ? 'platform' : ('account' as ModoDeCredencial)
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const porta: PortaDePublicacao = {
  async usuarioDaSessao(jwt) {
    const { data, error } = await servico.auth.getUser(jwt)
    if (error || !data.user) return null
    return { id: data.user.id }
  },

  async papelNaConta(contaId, usuarioId) {
    const { data, error } = await servico
      .from('account_members')
      .select('role')
      .eq('account_id', contaId)
      .eq('user_id', usuarioId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as { role?: string } | null)?.role ?? null
  },

  async agenteDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select(
        'id, name, company_name, offer_line, never_claim, voice_id, voice_settings, first_message, whatsapp_first_message, voice_channel_style, whatsapp_channel_style',
      )
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    return {
      id: String(linha.id),
      name: String(linha.name ?? ''),
      company_name: String(linha.company_name ?? ''),
      offer_line: (linha.offer_line as string | null) ?? null,
      never_claim: Array.isArray(linha.never_claim) ? (linha.never_claim as string[]) : [],
      voice_id: (linha.voice_id as string | null) ?? null,
      voice_settings:
        typeof linha.voice_settings === 'object' && linha.voice_settings !== null
          ? (linha.voice_settings as Record<string, unknown>)
          : {},
      first_message: (linha.first_message as string | null) ?? null,
      whatsapp_first_message: (linha.whatsapp_first_message as string | null) ?? null,
      voice_channel_style: (linha.voice_channel_style as string | null) ?? null,
      whatsapp_channel_style: (linha.whatsapp_channel_style as string | null) ?? null,
    }
  },

  async politicaDaConta(contaId) {
    const { data, error } = await servico
      .from('account_settings')
      .select('max_duration_seconds, recording_enabled, recording_notice_text, retention_days')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    return {
      max_duration_seconds: Number(linha.max_duration_seconds),
      recording_enabled: linha.recording_enabled !== false,
      recording_notice_text: (linha.recording_notice_text as string | null) ?? null,
      retention_days: Number(linha.retention_days),
    }
  },

  async criteriosDeAvaliacao(contaId) {
    const { data, error } = await servico
      .from('evaluation_criteria')
      .select(COLUNAS_DO_CRITERIO)
      .eq('account_id', contaId)
      .order('position')
    if (error) throw new Error(error.message)
    return (data ?? []).map(lerLinhaDeCriterio)
  },

  async roteirosPublicados(contaId) {
    // A junção traz o propósito do playbook, que é onde ele mora: a versão é
    // do roteiro, e o roteiro é que é de um propósito.
    const { data, error } = await servico
      .from('playbook_versions')
      .select('id, version, body_script, body_house, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)')
      .eq('account_id', contaId)
      .eq('status', 'published')
    if (error) throw new Error(error.message)

    return (data ?? []).map((linha: Record<string, unknown>) => ({
      purpose: String(
        (linha.playbooks as { purpose?: string } | null)?.purpose ?? '',
      ),
      playbook_version_id: String(linha.id),
      version: Number(linha.version),
      body_script: String(linha.body_script ?? ''),
      body_house: String(linha.body_house ?? ''),
    }))
  },

  async publicacoesRegistradas(contaId, agenteId) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('purpose, status, published_hash, provider_agent_id, channel_snapshot')
      .eq('account_id', contaId)
      .eq('agent_id', agenteId)
    if (error) throw new Error(error.message)

    return (data ?? []).map((linha: Record<string, unknown>) => ({
      purpose: String(linha.purpose),
      status: String(linha.status),
      published_hash: (linha.published_hash as string | null) ?? null,
      provider_agent_id: (linha.provider_agent_id as string | null) ?? null,
      channel_snapshot: linha.channel_snapshot ?? null,
    }))
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  chaveDoServidorDeFerramentas() {
    return CHAVE_DE_FERRAMENTAS || null
  },

  publicarNoProvedor(pedido) {
    return publicarNoProvedor(pedido)
  },

  async gravarPublicacao(linha) {
    const { error } = await servico.from('agent_publications').upsert(
      {
        account_id: linha.contaId,
        agent_id: linha.agenteId,
        purpose: linha.proposito,
        provider_agent_id: linha.providerAgentId,
        published_hash: linha.publishedHash,
        published_at: linha.publishedAt,
        status: linha.status,
        // A linha de falha só é escrita quando nada está no ar, e aí não há
        // retrato a guardar.
        channel_snapshot: linha.retrato,
      },
      { onConflict: 'agent_id,purpose' },
    )
    if (error) throw new Error(error.message)
  },

  async gravarRetrato(pedido) {
    const { error } = await servico
      .from('agent_publications')
      .update({ channel_snapshot: pedido.retrato })
      .eq('account_id', pedido.contaId)
      .eq('agent_id', pedido.agenteId)
      .eq('purpose', pedido.proposito)
      .eq('status', 'publicado')
    if (error) throw new Error(error.message)
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },

  chamarApiDoProvedor(ida) {
    return chamarApiDoProvedor(ida)
  },

  async webhookGuardado(contaId) {
    const { data, error } = await servico.rpc('metadado_do_segredo', {
      p_account_id: contaId,
      p_provider: PROVEDOR_DO_WEBHOOK,
      p_key_name: CHAVE_DO_SEGREDO_DO_FIM,
    })
    if (error) throw new Error(error.message)
    if (data === null || typeof data !== 'object') return null
    const metadado = data as Record<string, unknown>
    return {
      id: typeof metadado.webhook_id === 'string' ? metadado.webhook_id : null,
      url: typeof metadado.webhook_url === 'string' ? metadado.webhook_url : null,
    }
  },

  async guardarWebhook(contaId, webhook) {
    // Pela porta do servidor: quem publica pode ser admin, e o cofre de
    // `set_account_secret` é do owner (ver a migração do segredo gravado pelo
    // servidor).
    const { error } = await servico.rpc('gravar_segredo_pelo_servidor', {
      p_account_id: contaId,
      p_provider: PROVEDOR_DO_WEBHOOK,
      p_key_name: CHAVE_DO_SEGREDO_DO_FIM,
      p_secret: webhook.segredo,
      p_metadata: { webhook_id: webhook.id, webhook_url: webhook.url },
    })
    if (error) throw new Error(error.message)
  },
}

/**
 * Uma ida à API do provedor pelo passo dos webhooks. Nunca levanta: queda de
 * rede vira `ok: false` com status nulo, e `webhooks.ts` decide a pendência.
 */
async function chamarApiDoProvedor(ida: IdaAoProvedor): Promise<VoltaDoProvedor> {
  const comecou = Date.now()
  try {
    const resposta = await fetch(`${ENDERECO_DA_API}/${ida.caminho}`, {
      method: ida.metodo,
      headers: { 'xi-api-key': ida.credencial, 'content-type': 'application/json' },
      body: ida.corpo === undefined ? undefined : JSON.stringify(ida.corpo),
      signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
    })
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo ilegível: o status basta para a decisão.
    }
    return { ok: resposta.ok, status: resposta.status, corpo, latenciaMs: Date.now() - comecou }
  } catch {
    return { ok: false, status: null, latenciaMs: Date.now() - comecou }
  }
}

/**
 * A ida ao provedor. Criar quando não há identificador, atualizar quando há —
 * atualizar é o que mantém um agente por propósito lá dentro em vez de um por
 * publicação. Nunca levanta por resposta ruim: falha vira `ok: false` com o
 * código, que `publicacao.ts` reduz a motivo e nunca devolve no corpo.
 */
async function publicarNoProvedor(pedido: PedidoAoProvedor): Promise<RespostaDoProvedor> {
  const criando = pedido.providerAgentId === null
  // Criar é `/create`; atualizar é o identificador na própria coleção. Sem o
  // sufixo, a coleção responde 405 ao POST — foi o que aconteceu na primeira
  // publicação contra o provedor de verdade, e nenhum teste podia ver: o dublê
  // responde ao que perguntarmos, e o endereço só é conferido lá fora.
  const caminho = criando
    ? `${ENDERECO_DO_PROVEDOR}/create`
    : `${ENDERECO_DO_PROVEDOR}/${encodeURIComponent(pedido.providerAgentId ?? '')}`
  const endpoint = criando ? 'convai/agents/create' : 'convai/agents/:id'
  const comecou = Date.now()

  let resposta: Response
  try {
    resposta = await fetch(caminho, {
      method: criando ? 'POST' : 'PATCH',
      headers: {
        'xi-api-key': pedido.credencial,
        'content-type': 'application/json',
      },
      body: JSON.stringify(pedido.corpo),
      signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
    })
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - comecou,
      endpoint,
    }
  }

  const latenciaMs = Date.now() - comecou
  let corpo: Record<string, unknown> = {}
  try {
    corpo = (await resposta.json()) as Record<string, unknown>
  } catch {
    // Corpo ilegível não impede a decisão: o status basta.
  }

  if (!resposta.ok) {
    const detalhe = (corpo.error ?? corpo.detail ?? corpo) as Record<string, unknown> | string
    const codigo =
      typeof detalhe === 'string'
        ? detalhe
        : ((detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null) as
            | string
            | null)
    return {
      ok: false,
      codigo: codigo === null ? null : String(codigo),
      status: resposta.status,
      latenciaMs,
      corpo,
      endpoint,
    }
  }

  return {
    ok: true,
    providerAgentId: String(corpo.agent_id ?? corpo.id ?? pedido.providerAgentId ?? ''),
    status: resposta.status,
    latenciaMs,
    corpo,
    endpoint,
  }
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let contaId: unknown = null
  try {
    const corpo = (await requisicao.json()) as Record<string, unknown> | null
    contaId = corpo?.contaId ?? corpo?.conta_id ?? null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await atenderPublicacao(
    {
      metodo: requisicao.method,
      contaId,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
    { enderecoDasFerramentas: ENDERECO_DAS_FERRAMENTAS },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
