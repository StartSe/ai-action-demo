// Adaptador Deno da função saude. Só amarração: lê o ambiente, monta a porta
// sobre o Supabase com a chave de serviço e entrega a decisão para `saude.ts`.
//
// **Por que `verify_jwt = false`.** Quem chama é a conferência do instalador do
// painel, sem credencial nenhuma, e a tela "Conectar ao seu Supabase", antes de
// existir sessão. O que sai é público: a chave publicável e dois rótulos de
// versão (ver `saude.ts`).
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { VERSAO_DA_INSTALACAO } from '../_shared/versao-da-instalacao.ts'

import { atenderSaude, type PortaDaSaude, type VersaoRegistrada } from './saude.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_PUBLICAVEL = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta: PortaDaSaude = {
  async registrarUrlBase(url) {
    const { data, error } = await servico.rpc('registrar_url_base_das_rotinas', { p_url: url })
    if (error) throw new Error(error.message)
    return data === true
  },

  async versaoDoBanco() {
    const { data, error } = await servico.rpc('versao_da_instalacao')
    if (error) throw new Error(error.message)
    const versao = (data ?? {}) as Partial<VersaoRegistrada>
    return { migracao: versao.migracao ?? null, funcoes: versao.funcoes ?? null }
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })

  const resposta = await atenderSaude({ metodo: requisicao.method }, porta, {
    urlDoProjeto: URL_DO_SUPABASE,
    chavePublicavel: CHAVE_PUBLICAVEL,
    versaoDasFuncoes: VERSAO_DA_INSTALACAO,
  })
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
