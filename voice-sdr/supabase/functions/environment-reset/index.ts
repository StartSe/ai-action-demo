// Adaptador Deno da função environment-reset. Só amarração: lê o ambiente,
// monta a porta sobre o Supabase e a ElevenLabs, e entrega a decisão para
// `reset.ts`.
//
// Fora do typecheck e do lint da raiz: quem o verifica é o `deno check` de
// `npm run check:funcoes`, no CI.
//
// **QUEM PERMITE (D-12).** Com `SARAH_PERMITE_ZERAR_AMBIENTE` definida nos
// segredos das funções, ela manda: `sim` permite, outro valor desliga antes de
// ler a sessão. Sem ela, zerar vale enquanto a instalação tem uma conta só
// (a regra está em `reset.ts`).
//
// **PARA O CI:** a ida real à ElevenLabs e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { CHAVE_DO_PROVEDOR_DE_VOZ, PROVEDOR_DE_VOZ } from '../agent-publish/publicacao.ts'

import { atenderReset, lerPermissao, type PortaDoReset } from './reset.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))
const PERMISSAO = lerPermissao(Deno.env.get('SARAH_PERMITE_ZERAR_AMBIENTE'))

const ENDERECO_DO_PROVEDOR = 'https://api.elevenlabs.io/v1/convai'
const LIMITE_DO_PROVEDOR_MS = 20_000

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

/** A chave da ElevenLabs desta conta, ou nula. */
async function chaveDaVoz(contaId: string): Promise<string | null> {
  const resolvida = await cofre.resolveSecret(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  return resolvida.ok ? resolvida.valor : null
}

const porta: PortaDoReset = {
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

  async contasDaInstalacao() {
    const { count, error } = await servico.from('accounts').select('id', { count: 'exact', head: true })
    if (error) throw new Error(error.message)
    return count ?? 0
  },

  async agentesPublicados() {
    const { data, error } = await servico
      .from('agent_publications')
      .select('account_id, provider_agent_id')
      .not('provider_agent_id', 'is', null)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { account_id: string; provider_agent_id: string }[]).map((linha) => ({
      contaId: linha.account_id,
      agenteId: linha.provider_agent_id,
    }))
  },

  async apagarAgente(contaId, agenteId) {
    // Nunca levanta: sem chave legível, o agente sobra no provedor e o reset segue.
    const chave = await chaveDaVoz(contaId).catch(() => null)
    if (!chave) return false
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/agents/${encodeURIComponent(agenteId)}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': chave },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      // 404 é agente que já não existe lá: o que se queria.
      return resposta.ok || resposta.status === 404
    } catch {
      return false
    }
  },

  async zerar() {
    const { data, error } = await servico.rpc('zerar_ambiente')
    if (error) throw new Error(error.message)
    const resumo = (data ?? {}) as { contas?: number; usuarios?: number }
    return { contas: resumo.contas ?? 0, usuarios: resumo.usuarios ?? 0 }
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await atenderReset(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      confirmacao: corpo?.confirmacao ?? null,
      permissao: PERMISSAO,
    },
    porta,
    // O erro real vai para o registro da função (painel do Supabase), nunca para a tela.
    (passo, erro) => console.error(`environment-reset falhou no passo ${passo}:`, erro),
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
