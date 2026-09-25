// Adaptador Deno da função call-review. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre a API do modelo, e entrega a decisão para
// `revisao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt.** Sem bloco em `config.toml`, o gateway fica em
// `verify_jwt = true`; a sessão é lida de novo aqui porque a função precisa do
// usuário, que vira `created_by` e `author_id`. Quem confere o papel é
// `revisao.ts`, lendo `account_members` antes de qualquer coisa.
//
// **Por que a chave de serviço.** As três tabelas do ciclo são classe Servidor
// e não têm política de escrita de cliente, de propósito: proposta forjada com
// `body` próprio e depois aceita seria texto na boca da Sarah por um caminho
// que ninguém revisa. A barreira é a conferência de papel em `revisao.ts`.
//
// **O modelo é o da conta**, pelo OpenRouter que ela conectou
// (`_shared/modelo/pergunta.ts`). A instalação não tem chave de modelo: conta
// sem modelo conectado recebe a frase que manda conectar, e nenhuma pergunta
// sai com chave que não seja dela.
//
// **NENHUMA JUNÇÃO EMBUTIDA.** `calls`, `call_reviews` e `playbook_versions`
// se alcançam por mais de um caminho — `calls.playbook_version_id` e
// `call_reviews.playbook_version_id` chegam à mesma tabela —, e o PostgREST
// responde `PGRST201` quando não sabe por qual passar. Aqui cada tabela é uma
// consulta, e o casamento é no código. Custa uma ida a mais e não quebra no
// ambiente real, que é onde esse erro aparece: a escada não sobe PostgREST.
//
// **PARA O CI:** a chamada real ao modelo e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

import {
  cabecalhosDaConversa,
  corpoDaConversa,
  lerConversa,
  PROVEDOR as PROVEDOR_OPENROUTER,
  CHAVE_NO_COFRE,
  URL_DA_CONVERSA,
} from '../_shared/modelo/openrouter.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'
import { LIMITE_DO_HISTORICO } from '../_shared/agente/revisao-de-chamada.ts'

import { atenderRevisao, TAREFA_DA_REVISAO, type PortaDaRevisao, type RespostaDoModelo } from './revisao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Ler conversa e redigir roteiro não é ao vivo, mas a tela não espera para sempre. */
const LIMITE_DO_MODELO_MS = 120_000

/** O teto de saída, o mesmo nas duas portas: é o tamanho da resposta, não da janela. */
const TETO_DE_SAIDA = 16_000

/** Como a aplicação se identifica no painel de quem paga a conta do OpenRouter. */
const APLICACAO = {
  url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined,
  nome: NOME_DO_PRODUTO,
}

// `apikey` e `x-client-info` entram porque o cliente do Supabase os manda em
// toda requisição: sem eles na lista, o navegador barra no preflight e a tela
// vê falha de rede onde a função nem chegou a ser chamada.
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

/** A versão vigente de um playbook: a publicada, ou a mais nova quando nenhuma foi. */
async function versaoVigente(playbookId: string, versaoPublicadaId: string | null) {
  let consulta = servico.from('playbook_versions').select('body_script, body_house').eq('playbook_id', playbookId)
  consulta = versaoPublicadaId
    ? consulta.eq('id', versaoPublicadaId)
    : consulta.order('version', { ascending: false }).limit(1)
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  const vigente = (data ?? [])[0]
  return { body_script: vigente?.body_script ?? '', body_house: vigente?.body_house ?? '' }
}

/**
 * A conversa pela credencial da conta, no OpenRouter.
 *
 * A chave sai do cofre a cada pedido, e não fica em memória entre eles: uma
 * função de borda atende contas diferentes na mesma instância, e uma chave
 * guardada seria a chave de uma conta usada na conversa de outra.
 */
async function pelaContaNoOpenRouter(pedido: {
  contaId: string
  modelo: string
  sistema: string
  mensagem: string
  esquema: Record<string, unknown>
}): Promise<RespostaDoModelo> {
  const endpoint = 'api/v1/chat/completions'

  const { data, error } = await servico.rpc('get_account_secret', {
    p_account_id: pedido.contaId,
    p_provider: PROVEDOR_OPENROUTER,
    p_key_name: CHAVE_NO_COFRE,
  })
  if (error) throw new Error(error.message)
  const chave = typeof data === 'string' ? data.trim() : ''
  // Porta ligada sem chave no cofre é conta que desconectou pela metade. Vira
  // 503 com a frase de modelo indisponível, e não exceção: quem lê a tela
  // precisa de uma saída, não de um erro interno.
  if (chave === '') return { ok: false, codigo: 'sem_credencial', status: null, endpoint }

  const inicio = Date.now()
  try {
    const resposta = await fetch(URL_DA_CONVERSA, {
      method: 'POST',
      headers: cabecalhosDaConversa(chave, APLICACAO),
      body: JSON.stringify(
        corpoDaConversa({
          modelo: pedido.modelo,
          sistema: pedido.sistema,
          mensagem: pedido.mensagem,
          esquema: pedido.esquema,
          maxTokens: TETO_DE_SAIDA,
          aplicacao: APLICACAO,
        }),
      ),
      signal: AbortSignal.timeout(LIMITE_DO_MODELO_MS),
    })

    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo que não é JSON vira leitura vazia, e o crivo recusa por ilegível.
    }
    const lida = lerConversa(corpo)

    return {
      // `length` quer dizer resposta cortada no meio, e um JSON cortado não faz
      // o parse: chamar isso de sucesso empurraria o erro para o leitor.
      ok: resposta.ok && lida.texto !== null && lida.motivoDoFim !== 'length',
      codigo: lida.motivoDoFim ?? (resposta.ok ? null : String(resposta.status)),
      status: resposta.status,
      latenciaMs: Date.now() - inicio,
      endpoint,
      texto: lida.texto,
      tokensDeEntrada: lida.tokensDeEntrada,
      tokensDeSaida: lida.tokensDeSaida,
    }
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint,
    }
  }
}

const porta: PortaDaRevisao = {
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
    return data?.role ?? null
  },

  async lerChamada(contaId, chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select('id, account_id, purpose, status, transcript, end_reason, duration_sec, playbook_version_id')
      .eq('account_id', contaId)
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    // O roteiro com que a Sarah falou nesta chamada. Consulta própria, e não
    // junção embutida: ver o cabeçalho.
    let corpo = { body_script: '', body_house: '' }
    if (data.playbook_version_id) {
      const { data: versao, error: erroDaVersao } = await servico
        .from('playbook_versions')
        .select('body_script, body_house')
        .eq('account_id', contaId)
        .eq('id', data.playbook_version_id)
        .maybeSingle()
      if (erroDaVersao) throw new Error(erroDaVersao.message)
      if (versao) corpo = { body_script: versao.body_script, body_house: versao.body_house }
    }

    // Chamada sem versão gravada (ensaio antigo, ligação anterior à publicação)
    // cai na vigente: revisar contra texto em branco proporia reescrever o que
    // ninguém sabe o que era.
    if (!data.playbook_version_id) {
      const { data: playbook, error: erroDoPlaybook } = await servico
        .from('playbooks')
        .select('id, current_version_id')
        .eq('account_id', contaId)
        .eq('purpose', data.purpose)
        .maybeSingle()
      if (erroDoPlaybook) throw new Error(erroDoPlaybook.message)
      if (playbook) corpo = await versaoVigente(playbook.id, playbook.current_version_id)
    }

    return { ...data, ...corpo }
  },

  async lerRevisao(contaId, revisaoId) {
    const { data, error } = await servico
      .from('call_reviews')
      .select('id, account_id, call_id, status, purpose, analysis')
      .eq('account_id', contaId)
      .eq('id', revisaoId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const { data: perguntas, error: erroDasPerguntas } = await servico
      .from('call_review_questions')
      .select('id, position, question, why, kind, options, answer')
      .eq('review_id', revisaoId)
      .order('position', { ascending: true })
    if (erroDasPerguntas) throw new Error(erroDasPerguntas.message)

    const { data: mudancas, error: erroDasMudancas } = await servico
      .from('call_review_changes')
      .select('id, position, kind, title, rationale, body, path, path_action, decision, revisions')
      .eq('review_id', revisaoId)
      .order('position', { ascending: true })
    if (erroDasMudancas) throw new Error(erroDasMudancas.message)

    return { ...data, perguntas: perguntas ?? [], mudancas: mudancas ?? [] }
  },

  async criarRevisao(linha) {
    const { data, error } = await servico.from('call_reviews').insert(linha).select('id').single()
    // Único parcial violado: já há revisão aberta nesta chamada. Levantar é o
    // combinado da porta — `revisao.ts` traduz para `ja_existe_revisao`.
    if (error) throw new Error(error.message)
    return { id: data.id }
  },

  async gravarPerguntas(linhas) {
    if (linhas.length === 0) return
    const { error } = await servico.from('call_review_questions').insert(linhas)
    if (error) throw new Error(error.message)
  },

  async gravarRespostas(revisaoId, respostas) {
    const agora = new Date().toISOString()
    for (const item of respostas) {
      const { error } = await servico
        .from('call_review_questions')
        .update({ answer: item.answer, answered_at: agora })
        .eq('id', item.id)
        .eq('review_id', revisaoId)
      if (error) throw new Error(error.message)
    }
    const { error } = await servico
      .from('call_reviews')
      .update({ answered_at: agora })
      .eq('id', revisaoId)
    if (error) throw new Error(error.message)
  },

  async gravarMudancas(linhas) {
    if (linhas.length === 0) return
    const { error } = await servico.from('call_review_changes').insert(linhas)
    if (error) throw new Error(error.message)
    const revisaoId = linhas[0].review_id
    const { error: erroDoEstado } = await servico
      .from('call_reviews')
      .update({ status: 'proposed', proposed_at: new Date().toISOString() })
      .eq('id', revisaoId)
    if (erroDoEstado) throw new Error(erroDoEstado.message)
  },

  async substituirMudanca(mudancaId, reescrita) {
    const { error } = await servico
      .from('call_review_changes')
      .update({
        title: reescrita.title,
        rationale: reescrita.rationale,
        body: reescrita.body,
        path: reescrita.path,
        path_action: reescrita.path_action,
        owner_note: reescrita.owner_note,
        revised_at: new Date().toISOString(),
      })
      .eq('id', mudancaId)
    if (error) throw new Error(error.message)
    // O contador sobe por RPC para não perder passagem concorrente: ler,
    // somar e escrever daqui perderia uma reescrita de duas simultâneas.
    const { error: erroDoContador } = await servico.rpc('somar_revisao_da_mudanca', {
      p_change_id: mudancaId,
    })
    if (erroDoContador) throw new Error(erroDoContador.message)
  },

  async decidirMudancas(revisaoId, decisoes) {
    const agora = new Date().toISOString()
    for (const decisao of decisoes) {
      const { error } = await servico
        .from('call_review_changes')
        .update({ decision: decisao.aceita ? 'accepted' : 'rejected', decided_at: agora })
        .eq('id', decisao.id)
        .eq('review_id', revisaoId)
      if (error) throw new Error(error.message)
    }
  },

  async playbookDoProposito(contaId, proposito) {
    const { data, error } = await servico
      .from('playbooks')
      .select('id, current_version_id')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { id: data.id, ...(await versaoVigente(data.id, data.current_version_id)) }
  },

  async configuracaoAtual(contaId, proposito) {
    const { data: playbook, error } = await servico
      .from('playbooks')
      .select('id')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!playbook) return null
    // A versão mais nova, rascunho ou publicada: é nela que a próxima revisão
    // aplicada vai se apoiar, e é ela que diz o que já foi corrigido.
    const { data, error: erroDaVersao } = await servico
      .from('playbook_versions')
      .select('body_script, body_house')
      .eq('account_id', contaId)
      .eq('playbook_id', playbook.id)
      .order('version', { ascending: false })
      .limit(1)
    if (erroDaVersao) throw new Error(erroDaVersao.message)
    const versao = (data ?? [])[0]
    return versao ? { roteiro: versao.body_script ?? '', jeitoDaCasa: versao.body_house ?? '' } : null
  },

  async historicoDaConta(contaId, excetoRevisaoId) {
    let perguntas = servico
      .from('call_review_questions')
      .select('question, answer, review_id')
      .eq('account_id', contaId)
      .not('answer', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(LIMITE_DO_HISTORICO.respostas)
    if (excetoRevisaoId) perguntas = perguntas.neq('review_id', excetoRevisaoId)
    const { data: respondidas, error } = await perguntas
    if (error) throw new Error(error.message)

    let mudancas = servico
      .from('call_review_changes')
      .select('kind, title, review_id')
      .eq('account_id', contaId)
      .eq('decision', 'accepted')
      .order('decided_at', { ascending: false })
      .limit(LIMITE_DO_HISTORICO.mudancas)
    if (excetoRevisaoId) mudancas = mudancas.neq('review_id', excetoRevisaoId)
    const { data: aceitas, error: erroDasMudancas } = await mudancas
    if (erroDasMudancas) throw new Error(erroDasMudancas.message)

    return {
      respondidas: (respondidas ?? []).map((linha) => ({
        pergunta: String(linha.question ?? ''),
        resposta: String(linha.answer ?? ''),
      })),
      aceitas: (aceitas ?? []).map((linha) => ({ tipo: linha.kind, titulo: String(linha.title ?? '') })),
    }
  },

  async gravarRascunho(linha) {
    const { data, error } = await servico
      .from('playbook_versions')
      .insert(linha)
      .select('id, version')
      .single()
    if (error) throw new Error(error.message)
    return data
  },

  async marcarMudancasAplicadas(ids, versaoId) {
    if (ids.length === 0) return
    const { error } = await servico
      .from('call_review_changes')
      .update({ applied_version_id: versaoId, applied_at: new Date().toISOString() })
      .in('id', ids)
    if (error) throw new Error(error.message)
  },

  async encerrarRevisao(revisaoId, status) {
    const agora = new Date().toISOString()
    const { error } = await servico
      .from('call_reviews')
      .update(status === 'applied' ? { status, applied_at: agora } : { status, discarded_at: agora })
      .eq('id', revisaoId)
    if (error) throw new Error(error.message)
  },

  async modeloDaConta(contaId) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', {
      p_account_id: contaId,
      p_tarefa: TAREFA_DA_REVISAO,
    })
    if (error) throw new Error(error.message)
    const linha = (data ?? [])[0] ?? null
    return modeloDaTarefa(linha, TAREFA_DA_REVISAO)
  },

  async perguntarAoModelo(pedido): Promise<RespostaDoModelo> {
    if (pedido.porta === 'openrouter') return await pelaContaNoOpenRouter(pedido)

    // Conta sem modelo conectado: não há chave da instalação para cair.
    return { ok: false, codigo: 'sem_credencial', status: null, endpoint: 'api/v1/chat/completions' }
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

  const resposta = await atenderRevisao(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      acao: corpo?.action ?? null,
      chamadaId: corpo?.call_id ?? null,
      revisaoId: corpo?.review_id ?? null,
      respostas: corpo?.answers ?? null,
      mudancaId: corpo?.change_id ?? null,
      questionamento: corpo?.note ?? null,
      decisoes: corpo?.decisions ?? null,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
