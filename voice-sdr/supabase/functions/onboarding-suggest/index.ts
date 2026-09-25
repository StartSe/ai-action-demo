// Adaptador Deno da função onboarding-suggest. Só amarração: lê o ambiente,
// monta a porta sobre o Supabase e sobre o modelo, e entrega a decisão para
// `sugestoes.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt**, como `playbook-draft`: a sessão é lida de novo aqui e o papel
// (admin) é conferido em `sugestoes.ts`. A chave de serviço existe só para o
// rastro em `integration_events`, que é da classe Servidor. Nada de
// configuração é gravado.
//
// **PARA O CI:** a chamada real ao modelo e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { perguntarAoModelo as perguntarPelaPorta } from '../_shared/modelo/pergunta.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'

import {
  atenderSugestao,
  type PortaDaSugestao,
} from './sugestoes.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** A tela mostra uma espera animada, mas não espera para sempre. */
const LIMITE_DO_MODELO_MS = 90_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/** A tarefa desta função na tabela de `_shared/modelo/resolucao.ts` (US-246). */
const TAREFA = 'draft' as const

/** O teto de saída, o mesmo nas duas portas. */
const TETO_DE_SAIDA = 8_000

/** Como a aplicação se identifica no painel de quem paga a conta do provedor. */
const APLICACAO = {
  url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined,
  nome: NOME_DO_PRODUTO,
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta: PortaDaSugestao = {
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

  async modeloDaConta(contaId) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', {
      p_account_id: contaId,
      p_tarefa: TAREFA,
    })
    if (error) throw new Error(error.message)
    return modeloDaTarefa((data ?? [])[0] ?? null, TAREFA)
  },

  async perguntarAoModelo(pedido) {
    // As duas portas moram em `_shared/modelo/pergunta.ts`: a do OpenRouter
    // inteira, e a da plataforma por este adaptador, que é quem tem o SDK.
    return await perguntarPelaPorta(
      pedido.contaId ?? '',
      { porta: pedido.porta === 'openrouter' ? 'openrouter' : 'platform', modelo: pedido.modelo, escolhidoPelaConta: false },
      { ...pedido, maxTokens: TETO_DE_SAIDA },
      {
        async chaveDoOpenRouter(contaId) {
          const { data, error } = await servico.rpc('get_account_secret', {
            p_account_id: contaId,
            p_provider: PROVEDOR_OPENROUTER,
            p_key_name: CHAVE_NO_COFRE,
          })
          if (error) throw new Error(error.message)
          return typeof data === 'string' && data.trim() !== '' ? data : null
        },
      },
      APLICACAO,
      LIMITE_DO_MODELO_MS,
    )
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },

  async nomeDoAgente(contaId) {
    // A primeira pergunta do tutorial grava o nome em `agents.name`. Falha de
    // leitura conta como "sem nome": a sugestão continua, só propõe um.
    const { data, error } = await servico.from('agents').select('name').eq('account_id', contaId).maybeSingle()
    if (error) return null
    const nome = (data as { name?: string | null } | null)?.name
    return typeof nome === 'string' && nome.trim() !== '' ? nome : null
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

  const resposta = await atenderSugestao(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      contexto: corpo?.contexto ?? null,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
