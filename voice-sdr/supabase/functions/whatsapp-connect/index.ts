// Adaptador Deno da função whatsapp-connect. Só amarração: a decisão mora em
// `conexao.ts`.
//
// Fora do typecheck e do lint da raiz: quem o verifica é o `deno check` de
// `npm run check:funcoes`, no CI.
//
// **Auth de sessão**: sem bloco em `config.toml`, o gateway confere o JWT; a
// sessão é lida de novo aqui para saber quem é, e o papel (admin) é conferido
// em `conexao.ts`. As chaves da Z-API vêm do cofre da conta pela cascata de
// `_shared/secrets.ts`.
//
// **O endereço base** é `SUPABASE_URL` + `/functions/v1`, o mesmo que a Z-API
// alcança. `SARAH_URL_DAS_FUNCOES` vence quando a instalação publica as
// funções atrás de outro domínio.
//
// **PARA O CI:** o `deno check` deste arquivo e o cadastro contra uma
// instância Z-API de verdade (suposições Z5 e Z7 de `_shared/whatsapp/zapi.ts`).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { ROTULO_DA_CHAVE_DE_FERRAMENTAS, segredoDaInstalacao } from '../_shared/segredo-da-instalacao.ts'
import { LIMITE_DO_ENVIO_MS } from '../_shared/whatsapp/envio.ts'
import { CHAVES_DA_ZAPI, PROVEDOR_DO_WHATSAPP } from '../_shared/whatsapp/zapi.ts'

import { atenderConexao, type PortaDaConexao } from './conexao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))
const BASE_DAS_FUNCOES = Deno.env.get('SARAH_URL_DAS_FUNCOES') ?? `${URL_DO_SUPABASE.replace(/\/+$/, '')}/functions/v1`
const CHAVE_DO_SERVIDOR = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})

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
  async credenciais(contaId) {
    // Sem cache: a tela chama logo depois de salvar as chaves, e a chave nova
    // precisa valer na mesma hora.
    for (const chave of CHAVES_DA_ZAPI) cofre.invalidar(contaId, PROVEDOR_DO_WHATSAPP, chave)
    const valores = await Promise.all(CHAVES_DA_ZAPI.map((chave) => cofre.resolveSecret(contaId, PROVEDOR_DO_WHATSAPP, chave)))
    if (valores.some((valor) => !valor.ok)) return null
    const [instance_id, token, client_token] = valores.map((valor) => (valor.ok ? valor.valor : ''))
    return { instance_id: instance_id!, token: token!, client_token: client_token! }
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECALHOS })
  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    // Corpo ilegível cai em pedido_invalido.
  }
  const resposta = await atenderConexao(
    { metodo: requisicao.method, autorizacao: requisicao.headers.get('authorization'), corpo },
    porta,
    {
      base: BASE_DAS_FUNCOES,
      chaveDoServidor: CHAVE_DO_SERVIDOR,
      buscar: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS) }),
    },
  )
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
