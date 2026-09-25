// Adaptador Deno da função emergency-stop. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e a API da telefonia, e entrega a decisão para
// `freio.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt** (o padrão do gateway, sem bloco em `config.toml`), e o papel de
// `admin` conferido em `freio.ts` contra a conta do pedido. As escritas vão com
// a chave de serviço: `calls` é classe Servidor, e a gravação do freio não pode
// depender de a política de update de `accounts` continuar sendo de admin.
//
// **Cada update condicionado é um comando só.** Os filtros do PostgREST viram o
// `where` do `update ... returning`: `dialing_paused_at is null` na parada e
// `is not null` na retomada, e é dentro do Postgres que dois cliques disputam a
// linha. O `check` `accounts_freio_completo` faz os três campos andarem juntos.
//
// **A retomada é update direto e não o RPC `retomar_discagem`**: esta frente não
// cria migração. A regra do RPC — exige `has_role(conta, 'admin')`, limpa os
// três campos juntos, grava trilha — está em `freio.ts` e é o que o RPC vai
// repetir no banco quando entrar pela frente de telas ou pelo merge; aí
// `soltarFreio` passa a chamá-lo com o `Authorization` da requisição.
//
// **O encerramento é pela telefonia**, com o `provider_call_sid` que
// `call-place` gravou: `Status=completed` na chamada, como em `call-cancel`.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  atenderFreio,
  type ChamadaEmCurso,
  type FreioDaConta,
  type PedidoDeEncerramento,
  type PortaDoFreio,
} from './freio.ts'
import type { EnvelopeDoProvedor } from '../_shared/provedor/resposta.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DA_TELEFONIA = 'https://api.twilio.com/2010-04-01'

/**
 * Cinco segundos por encerramento. Com cinco no ar, dez chamadas cabem em dois
 * lotes dentro dos 10 s do critério mesmo com a telefonia lenta.
 */
const LIMITE_DO_PROVEDOR_MS = 5_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const COLUNAS_DO_FREIO = 'dialing_paused_at, dialing_paused_by, dialing_paused_reason'

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

const porta: PortaDoFreio = {
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

  async puxarFreio(contaId, freio) {
    const { data, error } = await servico
      .from('accounts')
      .update({
        dialing_paused_at: freio.em,
        dialing_paused_by: freio.por,
        dialing_paused_reason: freio.motivo,
      })
      .eq('id', contaId)
      .is('dialing_paused_at', null)
      .select('dialing_paused_at')
    if (error) throw new Error(error.message)
    const linha = Array.isArray(data) ? (data[0] as { dialing_paused_at?: string } | undefined) : undefined
    return linha?.dialing_paused_at ?? null
  },

  async estadoDoFreio(contaId) {
    const { data, error } = await servico
      .from('accounts')
      .select(COLUNAS_DO_FREIO)
      .eq('id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as FreioDaConta | null) ?? null
  },

  soltarFreio(contaId) {
    return venceu(
      servico
        .from('accounts')
        .update({ dialing_paused_at: null, dialing_paused_by: null, dialing_paused_reason: null })
        .eq('id', contaId)
        .not('dialing_paused_at', 'is', null)
        .select('id'),
    )
  },

  async repuxarFreio(contaId, anterior) {
    const { error } = await servico
      .from('accounts')
      .update({
        dialing_paused_at: anterior.dialing_paused_at,
        dialing_paused_by: anterior.dialing_paused_by,
        dialing_paused_reason: anterior.dialing_paused_reason,
      })
      .eq('id', contaId)
      .is('dialing_paused_at', null)
    if (error) throw new Error(error.message)
  },

  // `pausarCampanhas` fica sem implementação até a F7 criar `campaigns` (L-04).

  async chamadasEmCurso(contaId) {
    const { data, error } = await servico
      .from('calls')
      .select('id, status, provider_call_sid')
      .eq('account_id', contaId)
      .in('status', ['queued', 'ringing', 'in_progress'])
      .not('provider_call_sid', 'is', null)
      .is('finalized_at', null)
      .is('end_reason', null)
    if (error) throw new Error(error.message)
    return (data as ChamadaEmCurso[] | null) ?? []
  },

  marcarCancelamento(chamadaId) {
    return venceu(
      servico
        .from('calls')
        .update({ end_reason: 'canceled' })
        .eq('id', chamadaId)
        .in('status', ['queued', 'ringing', 'in_progress'])
        .is('finalized_at', null)
        .is('end_reason', null)
        .select('id'),
    )
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
    // Corpo ausente ou ilegível cai em acao_invalida, que já tem frase.
  }

  const resposta = await atenderFreio(
    {
      metodo: requisicao.method,
      acao: corpo?.acao ?? null,
      contaId: corpo?.contaId ?? corpo?.account_id ?? null,
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
