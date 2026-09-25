// Adaptador Deno da função whatsapp-send. Só amarração: a decisão mora em
// `envio.ts`, e as consultas nas portas de `whatsapp-inbound/portas-do-supabase.ts`,
// as mesmas do webhook.
//
// Fora do typecheck e do lint da raiz: quem o verifica é o `deno check` de
// `npm run check:funcoes`, no CI.
//
// **Auth de sessão.** Sem bloco em `config.toml`, o gateway confere o JWT
// (`verify_jwt = true`). A sessão é lida de novo aqui porque a função precisa
// do usuário, e o papel na conta é conferido em `envio.ts`. As escritas vão
// pela chave de serviço porque as tabelas do canal não têm política de
// escrita: quem garante quem escreve é `envio.ts`, antes de qualquer escrita.
//
// **`devolver` pede a resposta da assistente** depois da resposta HTTP, por
// `EdgeRuntime.waitUntil`, sem a janela de agrupamento: não há rajada a
// esperar, a mensagem do lead já chegou.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { conversarComFerramentas } from '../_shared/modelo/conversa-com-ferramentas.ts'
import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'
import { NOME_DO_PRODUTO } from '../_shared/marca.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { LIMITE_DO_ENVIO_MS } from '../_shared/whatsapp/envio.ts'
import { responderConversa } from '../_shared/whatsapp/resposta.ts'
import { criarPortasDoCanal, type ClienteDoCanal } from '../whatsapp-inbound/portas-do-supabase.ts'

import { atenderEnvio, type PortaDoEnvio } from './envio.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))
const TAREFA = 'classify' as const
const LIMITE_DO_MODELO_MS = 30_000
const APLICACAO = { url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined, nome: NOME_DO_PRODUTO }

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
    const { data, error } = await servico.from('accounts').select('credentials_mode').eq('id', contaId).maybeSingle()
    if (error) return 'account'
    return (data as { credentials_mode?: string } | null)?.credentials_mode === 'platform' ? 'platform' : 'account'
  },
}
const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const canal = criarPortasDoCanal({
  cliente: servico as unknown as ClienteDoCanal,
  async segredo(contaId, provedor, chave) {
    const resolucao = await cofre.resolveSecret(contaId, provedor, chave)
    return resolucao.ok ? resolucao.valor : null
  },
  buscar: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS) }),
  async rodada(contaId, pedido) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', { p_account_id: contaId, p_tarefa: TAREFA })
    if (error) throw new Error(error.message)
    const resolvido = modeloDaTarefa((data ?? [])[0] ?? null, TAREFA)
    return await conversarComFerramentas(
      contaId,
      resolvido,
      { ...pedido, modelo: resolvido.modelo },
      {
        async chaveDoOpenRouter(conta) {
          const segredo = await servico.rpc('get_account_secret', {
            p_account_id: conta,
            p_provider: PROVEDOR_OPENROUTER,
            p_key_name: CHAVE_NO_COFRE,
          })
          if (segredo.error) throw new Error(segredo.error.message)
          return typeof segredo.data === 'string' && segredo.data.trim() !== '' ? segredo.data : null
        },
      },
      APLICACAO,
      LIMITE_DO_MODELO_MS,
    )
  },
})

const porta: PortaDoEnvio = {
  ...canal,
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
}

declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void } | undefined

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    // Corpo ilegível cai em pedido_invalido, que já tem frase.
  }

  const resposta = await atenderEnvio(
    { metodo: requisicao.method, autorizacao: requisicao.headers.get('authorization'), corpo },
    porta,
  )

  if (resposta.depois) {
    const promessa = responderConversa(resposta.depois, canal, { janelaMs: 0 }).catch((erro) =>
      console.error('[whatsapp-send] resposta_falhou', { erro: erro instanceof Error ? erro.message : String(erro) }),
    )
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime !== null) EdgeRuntime.waitUntil(promessa)
  }

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
