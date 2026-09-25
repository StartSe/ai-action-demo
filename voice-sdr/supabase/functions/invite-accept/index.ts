// Adaptador Deno da função invite-accept. Só amarração: lê o ambiente, monta
// a porta de dados sobre o Supabase e entrega a decisão para `aceite.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — tudo o que decide algo mora em `aceite.ts`, que é portável e
// testado em `npm run test:unit`. Quem verifica este arquivo é o `deno check`
// do CI (docs/PRD-implementacao.md seção 9.1).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  aceitarConvite,
  type PortaDeConvites,
  type ResultadoDoBanco,
} from './aceite.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta: PortaDeConvites = {
  async usuarioDaSessao(jwt) {
    const { data, error } = await servico.auth.getUser(jwt)
    if (error || !data.user?.email) return null
    return { id: data.user.id, email: data.user.email }
  },

  async aceitar(tokenHash, usuarioId) {
    const { data, error } = await servico.rpc('aceitar_convite', {
      p_token_hash: tokenHash,
      p_usuario_id: usuarioId,
    })
    if (error) throw new Error(error.message)

    const linha = (Array.isArray(data) ? data[0] : data) as
      | ResultadoDoBanco
      | undefined
    if (!linha) throw new Error('aceitar_convite não devolveu linha')
    return linha
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let token: unknown = null
  try {
    const corpo = await requisicao.json()
    token = (corpo as { token?: unknown } | null)?.token ?? null
  } catch {
    // Corpo ausente ou ilegível cai em token_ausente, que já tem frase.
  }

  const resposta = await aceitarConvite(
    {
      metodo: requisicao.method,
      token,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
