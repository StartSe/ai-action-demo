// Adaptador Deno da função integrations-status. Só amarração: lê o ambiente,
// monta a porta de dados sobre o Supabase e as sondas sobre as APIs dos
// provedores, e entrega a decisão para `estado.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `estado.ts`, `_shared/provedor/erros.ts` e
// `provedores.ts`, e a leitura de cada API em `sondas.ts`, que são portáveis e
// testados em `npm run test:unit`. Quem verifica este
// arquivo é o `deno check` de `npm run check:funcoes`, no CI.
//
// O JWT é conferido pelo gateway (sem bloco em config.toml, o padrão é
// verify_jwt = true). A sessão é lida de novo aqui porque a função precisa do
// usuário, não só da garantia de que existe um.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import { consultarIntegracoes, type PortaDeIntegracoes } from './estado.ts'
import { sondarProvedor } from './sondas.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
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

  // A F0 não tem recurso com credencial própria: linha telefônica e agente
  // publicado chegam nas fases seguintes. Até lá, o degrau do meio é vazio de
  // propósito, e não uma consulta que sempre volta sem nada.
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
    // Sem coluna, sem linha ou com erro, cai no mais restritivo: uma conta que
    // não declarou nada não gasta o crédito da plataforma.
    if (error) return 'account'
    const modo = (data as { credentials_mode?: string } | null)?.credentials_mode
    return modo === 'platform' ? 'platform' : ('account' as ModoDeCredencial)
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const porta: PortaDeIntegracoes = {
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

  // As sondas moram em `sondas.ts` porque `cron-credit-watch` lê o mesmo
  // saldo: uma cópia por adaptador faria o aviso divergir do cartão.
  sondar(provedor, credenciais) {
    return sondarProvedor(provedor, credenciais)
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  const endereco = new URL(requisicao.url)
  let contaId: unknown = endereco.searchParams.get('conta_id')
  let provedores: unknown = endereco.searchParams.getAll('provedor')

  if (requisicao.method === 'POST') {
    try {
      const corpo = (await requisicao.json()) as Record<string, unknown> | null
      contaId = corpo?.contaId ?? corpo?.conta_id ?? contaId
      provedores = corpo?.provedores ?? provedores
    } catch {
      // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
    }
  }

  const resposta = await consultarIntegracoes(
    {
      metodo: requisicao.method,
      contaId,
      autorizacao: requisicao.headers.get('authorization'),
      provedores,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
