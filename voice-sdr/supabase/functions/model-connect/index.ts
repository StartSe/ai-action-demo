// Adaptador Deno da função model-connect. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre o OpenRouter, e entrega a decisão para
// `conexao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **DOIS CLIENTES, E A RAZÃO IMPORTA.** O cofre (`set_account_secret`,
// `delete_account_secret`) confere `has_role(..., 'owner')` por `auth.uid()`,
// então ele é chamado com o **JWT de quem está conectando** — com a chave de
// serviço, `auth.uid()` é nulo e o RPC recusa. As RPCs de estado do modelo
// (`abrir_autorizacao_de_modelo`, `consumir_autorizacao_de_modelo`,
// `concluir_conexao_de_modelo`) são concedidas só a `service_role`, e vão pelo
// outro cliente. Um cliente só não atende os dois lados.
//
// **AS ORIGENS DE RETORNO VÊM DO AMBIENTE**, em `SARAH_ORIGENS_PERMITIDAS`,
// separadas por vírgula, e não do corpo do pedido: o retorno é justamente o que
// um atacante escolheria para receber o código de autorização. Sem a variável,
// vale a origem do próprio pedido autenticado (`_shared/origens-permitidas.ts`),
// porque cada cliente publica a interface num endereço que a instalação não
// conhece.
//
// **PARA O CI:** a ida real ao OpenRouter e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  CHAVE_NO_COFRE,
  PROVEDOR,
  URL_DA_TROCA,
  URL_DOS_MODELOS,
} from '../_shared/modelo/openrouter.ts'
import { origensPermitidas } from '../_shared/origens-permitidas.ts'

import { atenderConexao, type PortaDaConexao, type RespostaDoProvedor } from './conexao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_ANONIMA = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** As origens que valem como retorno, quando alguém as fixou. */
const ORIGENS_DEFINIDAS = Deno.env.get('SARAH_ORIGENS_PERMITIDAS')

/** O provedor não demora, e a tela está esperando alguém clicar. */
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

/** Um cliente que age como a pessoa da sessão. Ver o cabeçalho. */
function comoUsuario(jwt: string) {
  return createClient(URL_DO_SUPABASE, CHAVE_ANONIMA, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

/** Uma ida ao provedor, sempre como envelope: nunca levanta. */
async function irAoProvedor(
  url: string,
  init: RequestInit,
  endpoint: string,
): Promise<RespostaDoProvedor> {
  const inicio = Date.now()
  const cancelar = AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
  try {
    const resposta = await fetch(url, { ...init, signal: cancelar })
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo que não é JSON vira corpo nulo, e o leitor recusa por ilegível.
    }
    return {
      ok: resposta.ok,
      status: resposta.status,
      codigo: resposta.ok ? null : String(resposta.status),
      latenciaMs: Date.now() - inicio,
      endpoint,
      corpo: corpo as Record<string, unknown> | null,
    }
  } catch (erro) {
    return {
      ok: false,
      status: null,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      latenciaMs: Date.now() - inicio,
      endpoint,
      corpo: null,
    }
  }
}

function montarPorta(jwt: string, origens: readonly string[]): PortaDaConexao {
  const daPessoa = comoUsuario(jwt)

  return {
    async usuarioDaSessao(token) {
      const { data, error } = await servico.auth.getUser(token)
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
      return data?.role ?? null
    },

    async nomeDaConta(contaId) {
      const { data, error } = await servico
        .from('accounts')
        .select('name')
        .eq('id', contaId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.name ?? ''
    },

    async abrirAutorizacao(dados) {
      const { error } = await servico.rpc('abrir_autorizacao_de_modelo', {
        p_account_id: dados.contaId,
        p_provider: dados.provedor,
        p_state: dados.estado,
        p_code_verifier: dados.verifier,
        p_callback_url: dados.callbackUrl,
        p_created_by: dados.criadaPor,
      })
      if (error) throw new Error(error.message)
    },

    async consumirAutorizacao(estado) {
      const { data, error } = await servico.rpc('consumir_autorizacao_de_modelo', {
        p_state: estado,
      })
      if (error) throw new Error(error.message)
      const linha = (data ?? [])[0]
      if (!linha) return null
      return {
        contaId: linha.account_id,
        provedor: linha.provider,
        verifier: linha.code_verifier,
        callbackUrl: linha.callback_url,
      }
    },

    async trocarCodigoPorChave(corpo) {
      return await irAoProvedor(
        URL_DA_TROCA,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(corpo),
        },
        'api/v1/auth/keys',
      )
    },

    async buscarCatalogo() {
      return await irAoProvedor(URL_DOS_MODELOS, { method: 'GET' }, 'api/v1/models')
    },

    async gravarChaveNoCofre(contaId, chave) {
      // Com o JWT da pessoa: o RPC confere o dono por auth.uid(). Ver o
      // cabeçalho.
      const { error } = await daPessoa.rpc('set_account_secret', {
        p_account_id: contaId,
        p_provider: PROVEDOR,
        p_key_name: CHAVE_NO_COFRE,
        p_secret: chave,
        p_metadata: { origem: 'oauth' },
      })
      if (error) throw new Error(error.message)
    },

    async apagarChaveDoCofre(contaId) {
      const { error } = await daPessoa.rpc('delete_account_secret', {
        p_account_id: contaId,
        p_provider: PROVEDOR,
        p_key_name: CHAVE_NO_COFRE,
      })
      if (error) throw new Error(error.message)
    },

    async concluirConexao(contaId, provedor, resumo, autorId) {
      const { error } = await servico.rpc('concluir_conexao_de_modelo', {
        p_account_id: contaId,
        p_provider: provedor,
        p_connection: resumo,
        p_connected_by: autorId,
      })
      if (error) throw new Error(error.message)
    },

    async desconectar(contaId) {
      const { error } = await servico.rpc('desconectar_modelo_da_conta', {
        p_account_id: contaId,
      })
      if (error) throw new Error(error.message)
    },

    origensPermitidas() {
      return origens
    },
  }
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const autorizacao = requisicao.headers.get('authorization')
  const jwt = /^bearer\s+(.+)$/i.exec(autorizacao?.trim() ?? '')?.[1]?.trim() ?? ''

  const resposta = await atenderConexao(
    {
      metodo: requisicao.method,
      autorizacao,
      contaId: corpo?.account_id ?? null,
      acao: corpo?.action ?? null,
      retorno: corpo?.return_url ?? null,
      codigo: corpo?.code ?? null,
      estado: corpo?.state ?? null,
      estadoDaQuery: corpo?.callback_state ?? null,
    },
    montarPorta(jwt, origensPermitidas(ORIGENS_DEFINIDAS, requisicao.headers.get('origin'))),
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
