// Adaptador Deno de calendar-connect. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e entrega a decisão para `conexao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// Atrás do gateway (sem bloco em `config.toml`): quem chama é a tela, com a
// sessão de quem administra. O papel se confere em `conexao.ts`.
//
// **O endereço de volta vem do ambiente**, nunca do pedido: é ele que recebe o
// código de autorização, e um endereço escolhido por quem pede levaria o código
// para outro lugar. Sem `SARAH_GOOGLE_REDIRECT_URI`, vale o endereço público de
// `calendar-callback` nesta instalação. Tem de ser o mesmo que a volta usa na
// troca, e o mesmo cadastrado no aplicativo do Google.
//
// **PARA O CI E PARA AMBIENTE COM APLICATIVO VERIFICADO:** o trajeto real do
// OAuth (P-04).

import { createClient } from 'npm:@supabase/supabase-js@2'

import { atenderConexaoDoCalendario, type PortaDaConexao } from './conexao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_DO_SERVIDOR = Deno.env.get('CHAVE_DO_SERVIDOR') ?? ''
const CLIENTE_ID = Deno.env.get('SARAH_GOOGLE_CLIENT_ID') ?? ''
const REDIRECIONAMENTO =
  Deno.env.get('SARAH_GOOGLE_REDIRECT_URI') ?? (URL_DO_SUPABASE ? `${URL_DO_SUPABASE}/functions/v1/calendar-callback` : '')

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

const porta: PortaDaConexao = {
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

  async especialistaDaConta(contaId, especialistaId) {
    const { data, error } = await servico
      .from('specialists')
      .select('id')
      .eq('id', especialistaId)
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data !== null
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em pedido_incompleto, que já tem frase.
  }

  const resposta = await atenderConexaoDoCalendario(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      especialistaId: corpo?.specialist_id ?? null,
    },
    porta,
    { clienteId: CLIENTE_ID, redirecionamento: REDIRECIONAMENTO, chaveDoServidor: CHAVE_DO_SERVIDOR },
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
