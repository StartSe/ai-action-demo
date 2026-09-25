// Adaptador Deno da função call-cancel. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e a API da telefonia, e entrega a decisão para
// `cancelamento.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt** (o padrão do gateway, sem bloco em `config.toml`), e o papel de
// `operator` conferido em `cancelamento.ts` contra a conta do alvo. As escritas
// vão com a chave de serviço porque `calls` e `dial_queue` são classe Servidor:
// nenhuma política deixa o cliente escrever nelas.
//
// **Cada update condicionado é um comando só.** Os filtros do PostgREST viram o
// `where` do `update ... returning`, e é dentro do Postgres que o cancelamento e
// a finalização disputam a linha: quem chega depois recebe zero linhas.
//
// **O encerramento é pela telefonia**, com o `provider_call_sid` que
// `call-place` gravou: `Status=completed` na chamada. A conversa do agente de
// voz termina junto, e o aviso de fim segue o caminho normal até
// `call-finalize`.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  cancelar,
  type ChamadaDoCancelamento,
  type ItemDaFila,
  type PedidoDeEncerramento,
  type PortaDoCancelamento,
} from './cancelamento.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DA_TELEFONIA = 'https://api.twilio.com/2010-04-01'

/** Quem clicou espera a resposta: dez segundos antes de desistir. */
const LIMITE_DO_PROVEDOR_MS = 10_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const COLUNAS_DA_CHAMADA = 'id, account_id, status, end_reason, provider_call_sid, finalized_at'

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

/** Update condicionado: voltou linha, venceu; não voltou, outro chegou antes. */
async function venceu(consulta: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return Array.isArray(data) && data.length > 0
}

const porta: PortaDoCancelamento = {
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

  async itemDaFila(itemId) {
    const { data, error } = await servico
      .from('dial_queue')
      .select('id, account_id, status, call_id')
      .eq('id', itemId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as ItemDaFila | null) ?? null
  },

  async chamada(chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select(COLUNAS_DA_CHAMADA)
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as ChamadaDoCancelamento | null) ?? null
  },

  retirarDaFila(itemId) {
    return venceu(
      servico.from('dial_queue').update({ status: 'canceled' }).eq('id', itemId).eq('status', 'queued').select('id'),
    )
  },

  async devolverAFila(itemId) {
    const { error } = await servico
      .from('dial_queue')
      .update({ status: 'queued' })
      .eq('id', itemId)
      .eq('status', 'canceled')
    if (error) throw new Error(error.message)
  },

  fecharAntesDeDiscar(chamadaId, agora) {
    return venceu(
      servico
        .from('calls')
        .update({ status: 'failed', end_reason: 'canceled', ended_at: agora })
        .eq('id', chamadaId)
        .eq('status', 'queued')
        .is('provider_call_sid', null)
        .is('finalized_at', null)
        .select('id'),
    )
  },

  async reabrirAntesDeDiscar(chamadaId) {
    const { error } = await servico
      .from('calls')
      .update({ status: 'queued', end_reason: null, ended_at: null })
      .eq('id', chamadaId)
      .eq('status', 'failed')
      .eq('end_reason', 'canceled')
      .is('finalized_at', null)
    if (error) throw new Error(error.message)
  },

  marcarCancelamento(chamadaId) {
    return venceu(
      servico
        .from('calls')
        .update({ end_reason: 'canceled' })
        .eq('id', chamadaId)
        .in('status', ['ringing', 'in_progress'])
        .is('finalized_at', null)
        .is('end_reason', null)
        .select('id'),
    )
  },

  async desmarcarCancelamento(chamadaId) {
    const { error } = await servico
      .from('calls')
      .update({ end_reason: null })
      .eq('id', chamadaId)
      .eq('end_reason', 'canceled')
      .is('finalized_at', null)
    if (error) throw new Error(error.message)
  },

  async registrarAuditoria(linha) {
    const { error } = await servico.from('audit_log').insert(linha)
    if (error) throw new Error(error.message)
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  encerrarNoProvedor,

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },
}

async function encerrarNoProvedor(pedido: PedidoDeEncerramento): Promise<EnvelopeDoProvedor> {
  const endpoint = `Accounts/${pedido.identificador}/Calls/${pedido.providerCallSid}.json`
  const inicio = Date.now()
  try {
    const resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/${endpoint}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${pedido.identificador}:${pedido.token}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Status: 'completed' }),
      signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
    })
    await resposta.body?.cancel()
    return {
      ok: resposta.ok,
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      // Sem o identificador da conta: o caminho vai para `integration_events`.
      endpoint: `Calls/${pedido.providerCallSid}.json`,
    }
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint: `Calls/${pedido.providerCallSid}.json`,
    }
  }
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em alvo_invalido, que já tem frase.
  }

  const resposta = await cancelar(
    {
      metodo: requisicao.method,
      chamadaId: corpo?.chamadaId ?? corpo?.call_id ?? null,
      itemDaFilaId: corpo?.itemDaFilaId ?? corpo?.dial_queue_id ?? null,
      motivo: corpo?.motivo ?? corpo?.reason ?? null,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
    { agora: new Date().toISOString() },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
