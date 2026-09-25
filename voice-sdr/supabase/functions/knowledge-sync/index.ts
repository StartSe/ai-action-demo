// Adaptador Deno da função knowledge-sync. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre a API do provedor de voz, e entrega a decisão
// para `sincronizacao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt.** Sem bloco em `config.toml`, o gateway fica em
// `verify_jwt = true`; a sessão é lida de novo aqui porque a função precisa do
// usuário para conferir o papel. Quem confere `has_role(..., 'admin')` é
// `sincronizacao.ts`, lendo `account_members` antes de qualquer coisa.
//
// **Por que a chave de serviço.** A função escreve em `integration_events`, que
// é da classe Servidor, e nas colunas de sincronização de `knowledge_entries`,
// que só os RPCs `marcar_*` alcançam e que só `service_role` executa. Sem a
// conferência de papel em `sincronizacao.ts`, a chave de serviço sincronizaria
// qualquer conta para qualquer sessão autenticada.
//
// **Os três caminhos do provedor**, todos suposições de T-01 que só a
// sincronização real confirma (dívida do degrau 3, docs/PRD-implementacao.md
// seção 9.1): documento de texto criado por `POST convai/knowledge-base/text`,
// removido por `DELETE convai/knowledge-base/{id}` com `force=true` (que o
// desanexa dos agentes), e a lista anexada por `PATCH convai/agents/{id}` em
// `conversation_config.agent.prompt.knowledge_base`.
//
// **PARA O CI:** a sincronização real contra o provedor e o `deno check` deste
// arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

import {
  atenderSincronizacao,
  ENDERECOS_PADRAO,
  type PortaDaSincronizacao,
} from './sincronizacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DO_PROVEDOR = 'https://api.elevenlabs.io/v1/convai'

/** Cada ida ao provedor. A passagem é uma por entrada, então o limite é curto. */
const LIMITE_DO_PROVEDOR_MS = 15_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
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

  // A base de conhecimento não guarda credencial própria: a chave do provedor
  // de voz é da conta inteira.
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

async function rpcBooleano(nome: string, parametros: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await servico.rpc(nome, parametros)
  if (error) throw new Error(error.message)
  return data === true
}

const porta: PortaDaSincronizacao = {
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

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  async entradasDaConta(contaId) {
    const { data, error } = await servico
      .from('knowledge_entries')
      .select('id, question, answer, provider_doc_id, indexed_hash, removed_at')
      .eq('account_id', contaId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
    if (error) throw new Error(error.message)
    return (data ?? []).map((linha: Record<string, unknown>) => ({
      id: String(linha.id),
      question: String(linha.question ?? ''),
      answer: String(linha.answer ?? ''),
      provider_doc_id: (linha.provider_doc_id as string | null) ?? null,
      indexed_hash: (linha.indexed_hash as string | null) ?? null,
      removed_at: (linha.removed_at as string | null) ?? null,
    }))
  },

  async publicacoesDaConta(contaId) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('purpose, provider_agent_id')
      .eq('account_id', contaId)
    if (error) throw new Error(error.message)
    return (data ?? []).map((linha: Record<string, unknown>) => ({
      purpose: String(linha.purpose),
      provider_agent_id: (linha.provider_agent_id as string | null) ?? null,
    }))
  },

  async enviarDocumento(pedido) {
    const resposta = await chamar('POST', '/knowledge-base/text', pedido.credencial, ENDERECOS_PADRAO.enviar, {
      name: pedido.documento.nome,
      text: pedido.documento.texto,
    })
    const id = resposta.corpo?.id ?? resposta.corpo?.document_id
    return { ...resposta, documentoId: typeof id === 'string' ? id : null }
  },

  removerDocumento(pedido) {
    return chamar(
      'DELETE',
      `/knowledge-base/${encodeURIComponent(pedido.documentoId)}?force=true`,
      pedido.credencial,
      ENDERECOS_PADRAO.remover,
    )
  },

  anexarDocumentos(pedido) {
    return chamar(
      'PATCH',
      `/agents/${encodeURIComponent(pedido.providerAgentId)}`,
      pedido.credencial,
      ENDERECOS_PADRAO.anexar,
      {
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: pedido.documentos.map((documento) => ({
                type: 'text',
                id: documento.id,
                name: documento.nome,
                usage_mode: 'auto',
              })),
            },
          },
        },
      },
    )
  },

  marcarIndexada(entradaId, documentoId, hash) {
    return rpcBooleano('marcar_conhecimento_indexado', {
      p_entrada: entradaId,
      p_documento: documentoId,
      p_hash: hash,
    })
  },

  marcarDesindexada(entradaId) {
    return rpcBooleano('marcar_conhecimento_desindexado', { p_entrada: entradaId })
  },

  marcarErro(entradaId, motivo) {
    return rpcBooleano('marcar_erro_do_conhecimento', { p_entrada: entradaId, p_motivo: motivo })
  },

  async apagarEntrada(entradaId) {
    // Só a marcada: uma entrada desmarcada entre a leitura e aqui continua.
    const { data, error } = await servico
      .from('knowledge_entries')
      .delete()
      .eq('id', entradaId)
      .not('removed_at', 'is', null)
      .select('id')
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },
}

/** Uma ida ao provedor. Nunca levanta: falha vira `ok: false` com o código. */
async function chamar(
  metodo: string,
  caminho: string,
  credencial: string,
  endpoint: string,
  corpo?: Record<string, unknown>,
): Promise<EnvelopeDoProvedor> {
  const comecou = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DO_PROVEDOR}${caminho}`, {
      method: metodo,
      headers: { 'xi-api-key': credencial, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
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
  let lido: Record<string, unknown> = {}
  try {
    lido = (await resposta.json()) as Record<string, unknown>
  } catch {
    // DELETE responde sem corpo; o status basta.
  }

  if (!resposta.ok) {
    const detalhe = (lido.error ?? lido.detail ?? lido) as Record<string, unknown> | string
    const codigo =
      typeof detalhe === 'string'
        ? detalhe
        : ((detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null) as string | null)
    return { ok: false, codigo: codigo === null ? null : String(codigo), status: resposta.status, latenciaMs, corpo: lido, endpoint }
  }

  return { ok: true, status: resposta.status, latenciaMs, corpo: lido, endpoint }
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  let contaId: unknown = null
  try {
    const corpo = (await requisicao.json()) as Record<string, unknown> | null
    contaId = corpo?.contaId ?? corpo?.account_id ?? null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await atenderSincronizacao(
    { metodo: requisicao.method, contaId, autorizacao: requisicao.headers.get('authorization') },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
