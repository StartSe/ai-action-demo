// Adaptador Deno da função playbook-draft. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre a API do modelo, e entrega a decisão para
// `rascunho.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt.** Sem bloco em `config.toml`, o gateway fica em
// `verify_jwt = true`; a sessão é lida de novo aqui porque a função precisa do
// usuário, que vira `author_id`. Quem confere o papel (`has_role(..., 'admin')`)
// é `rascunho.ts`, lendo `account_members` antes de qualquer coisa.
//
// **Por que a chave de serviço.** A função escreve em `integration_events`, que
// é da classe Servidor e não tem política de escrita de cliente. A versão
// nova vai para `playbook_versions` pela mesma chave, com `author_id` vindo da
// sessão conferida: a conferência de papel em `rascunho.ts` é a barreira que a
// política de inserção de admin faria.
//
// **O modelo é o da conta**, pelo OpenRouter que ela conectou
// (`_shared/modelo/pergunta.ts`). A instalação não tem chave de modelo: conta
// sem modelo conectado recebe a frase que manda conectar, e nenhuma pergunta
// sai com chave que não seja dela.
//
// **PARA O CI:** a chamada real ao modelo e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { perguntarAoModelo as perguntarPelaPorta } from '../_shared/modelo/pergunta.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'

import {
  atenderRascunho,
  type PortaDoRascunho,
} from './rascunho.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Redação de roteiro não é ao vivo, mas a tela não espera para sempre. */
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

const porta: PortaDoRascunho = {
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

  async descricaoPadraoDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select('company_name, offer_line')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return ''

    const linha = data as { company_name?: string | null; offer_line?: string | null }
    return [linha.company_name, linha.offer_line]
      .map((parte) => (typeof parte === 'string' ? parte.trim() : ''))
      .filter((parte) => parte !== '')
      .join('. ')
  },

  async playbookDoProposito(contaId, proposito) {
    const { data: playbook, error } = await servico
      .from('playbooks')
      .select('id, current_version_id')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!playbook) return null
    const { id, current_version_id } = playbook as { id: string; current_version_id: string | null }

    // A vigente é a publicada; sem publicada, a mais nova.
    let consulta = servico.from('playbook_versions').select('body_house').eq('playbook_id', id)
    consulta = current_version_id
      ? consulta.eq('id', current_version_id)
      : consulta.order('version', { ascending: false }).limit(1)
    const { data: versoes, error: erroDaVersao } = await consulta
    if (erroDaVersao) throw new Error(erroDaVersao.message)
    const vigente = ((versoes ?? []) as { body_house: string }[])[0]
    return { id, body_house: vigente?.body_house ?? '' }
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

  async gravarRascunho(linha) {
    const { data, error } = await servico
      .from('playbook_versions')
      .insert(linha)
      .select('id, version')
      .single()
    if (error) throw new Error(error.message)
    return data as { id: string; version: number }
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
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

  const resposta = await atenderRascunho(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      proposito: corpo?.purpose ?? null,
      descricao: corpo?.description ?? null,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
