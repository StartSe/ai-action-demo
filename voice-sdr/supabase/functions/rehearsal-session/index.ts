// Adaptador Deno da função rehearsal-session. Só amarração: lê o ambiente,
// monta a porta sobre o Supabase e sobre a ElevenLabs, e entrega a decisão
// para `sessao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **A CHAVE DO PROVEDOR DE VOZ É A DA CONTA**, resolvida pelo mesmo cofre de
// `agent-publish` (`PROVEDOR_DE_VOZ`, `CHAVE_DO_PROVEDOR_DE_VOZ`). Ensaio e
// publicação falam com a mesma API e com a mesma credencial — uma segunda
// forma de resolvê-la divergiria da primeira no dia em que o cofre mudasse.
//
// **A URL ASSINADA NÃO É CREDENCIAL DA CONTA.** Ela vale para uma conversa e
// expira; é por isso que pode ir para o navegador, e é por isso que a chave da
// conta nunca vai. O navegador abre a conversa com a URL, e nada mais.
//
// **A TRANSCRIÇÃO É LIDA DO PROVEDOR AO ENCERRAR.** O `conversation_id` vem do
// SDK, que é quem o conhece; o conteúdo vem da API, que é quem o registrou.
//
// **PARA O CI:** a ida real à ElevenLabs e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { CHAVE_DO_PROVEDOR_DE_VOZ, PROVEDOR_DE_VOZ } from '../agent-publish/publicacao.ts'

import { atenderEnsaio, type PortaDoEnsaio, type RespostaDoProvedor } from './sessao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DO_PROVEDOR = 'https://api.elevenlabs.io/v1/convai'

/** O provedor responde rápido nestes dois caminhos; a tela está esperando. */
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
    const { data, error } = await servico
      .from('accounts')
      .select('credentials_mode')
      .eq('id', contaId)
      .maybeSingle()
    if (error) return 'account'
    const modo = (data as { credentials_mode?: string } | null)?.credentials_mode
    return modo === 'platform' ? 'platform' : ('account' as ModoDeCredencial)
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

/** A chave do provedor de voz desta conta, ou nula. */
async function chaveDaVoz(contaId: string): Promise<string | null> {
  const resolvida = await cofre.resolveSecret(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  return resolvida.ok ? resolvida.valor : null
}

/**
 * Uma porta por pedido. A conta em voo diz às duas idas ao provedor de quem é
 * a chave, e por isso não pode ser do módulo: com ela global, dois pedidos
 * simultâneos de contas diferentes trocariam de chave no meio do caminho, e um
 * ensaio poderia ler a conversa com a credencial — e o workspace — de outra
 * conta.
 */
function criarPorta(): PortaDoEnsaio {
  let contaEmVoo: string | null = null

  return {
    async usuarioDaSessao(jwt) {
      const { data, error } = await servico.auth.getUser(jwt)
      if (error || !data.user) return null
      return { id: data.user.id }
    },

    async papelNaConta(contaId, usuarioId) {
      contaEmVoo = contaId
      const { data, error } = await servico
        .from('account_members')
        .select('role')
        .eq('account_id', contaId)
        .eq('user_id', usuarioId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data?.role ?? null
    },

    async contaTemAgente(contaId) {
      const { data, error } = await servico
        .from('agents')
        .select('id')
        .eq('account_id', contaId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data !== null
    },

    async publicacaoDoProposito(contaId, proposito) {
      // `agent_publications` NÃO tem `playbook_version_id`: a publicação guarda
      // o hash do que foi compilado, e não o número da versão. Quem sabe qual
      // versão está no ar é `playbooks.current_version_id`, e é de lá que ela
      // vem — duas consultas, e não junção embutida, pela razão de
      // `call-review/index.ts`.
      const { data, error } = await servico
        .from('agent_publications')
        .select('id, provider_agent_id, status')
        .eq('account_id', contaId)
        .eq('purpose', proposito)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null

      const { data: playbook, error: erroDoPlaybook } = await servico
        .from('playbooks')
        .select('current_version_id')
        .eq('account_id', contaId)
        .eq('purpose', proposito)
        .maybeSingle()
      if (erroDoPlaybook) throw new Error(erroDoPlaybook.message)

      return {
        id: data.id,
        // Publicação que não completou não tem agente no provedor, e o módulo
        // portável trata isso como "sem publicação" — que é a verdade.
        provider_agent_id: data.status === 'publicado' ? (data.provider_agent_id ?? null) : null,
        // A versão que está no ar naquele propósito. Nula quando nenhuma foi
        // publicada, e a coluna de `rehearsals` aceita nulo por isso.
        playbook_version_id: playbook?.current_version_id ?? null,
      }
    },

    async pedirSessaoAssinada(agenteId): Promise<RespostaDoProvedor> {
      const endpoint = 'convai/conversation/get_signed_url'
      const chave = contaEmVoo ? await chaveDaVoz(contaEmVoo) : null
      if (!chave) return { ok: false, codigo: 'sem_credencial', status: null, endpoint }

      const inicio = Date.now()
      try {
        const resposta = await fetch(
          `${ENDERECO_DO_PROVEDOR}/conversation/get_signed_url?agent_id=${encodeURIComponent(agenteId)}`,
          { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS) },
        )
        let corpo: Record<string, unknown> | null = null
        try {
          corpo = (await resposta.json()) as Record<string, unknown>
        } catch {
          // Corpo que não é JSON vira URL nula, e o módulo recusa por ilegível.
        }
        const url = corpo?.signed_url
        return {
          ok: resposta.ok,
          status: resposta.status,
          codigo: resposta.ok ? null : String(resposta.status),
          latenciaMs: Date.now() - inicio,
          endpoint,
          urlAssinada: typeof url === 'string' ? url : null,
          // Só para a conferência de vazamento do módulo portável.
          credencial: chave,
        }
      } catch (erro) {
        return {
          ok: false,
          codigo: erro instanceof Error ? erro.name : 'fetch_failed',
          status: null,
          latenciaMs: Date.now() - inicio,
          endpoint,
          credencial: chave,
        }
      }
    },

    async abrirEnsaio(dados) {
      const { data, error } = await servico.rpc('abrir_ensaio', {
        p_account_id: dados.contaId,
        p_purpose: dados.proposito,
        p_mode: dados.modo,
        p_persona: dados.persona,
        p_created_by: dados.criadoPor,
        p_agent_publication_id: dados.publicacaoId,
        p_playbook_version_id: dados.versaoDoPlaybookId,
      })
      if (error) throw new Error(error.message)
      const linha = (data ?? [])[0]
      if (!linha) throw new Error('abrir_ensaio não devolveu linha')
      return { ensaioId: linha.rehearsal_id, chamadaId: linha.call_id }
    },

    async contextoDaAbertura(contaId, chamadaId) {
      const { data: agente, error } = await servico
        .from('agents')
        .select('name, company_name, first_message')
        .eq('account_id', contaId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!agente) return null

      const { data: politica, error: erroDaPolitica } = await servico
        .from('account_settings')
        .select('recording_enabled, recording_notice_text')
        .eq('account_id', contaId)
        .maybeSingle()
      if (erroDaPolitica) throw new Error(erroDaPolitica.message)

      const { data: chamada, error: erroDaChamada } = await servico
        .from('calls')
        .select('lead_id')
        .eq('account_id', contaId)
        .eq('id', chamadaId)
        .maybeSingle()
      if (erroDaChamada) throw new Error(erroDaChamada.message)

      let lead = null
      if (chamada?.lead_id) {
        const { data: linha, error: erroDoLead } = await servico
          .from('leads')
          .select('name, company, city')
          .eq('account_id', contaId)
          .eq('id', chamada.lead_id)
          .maybeSingle()
        if (erroDoLead) throw new Error(erroDoLead.message)
        lead = linha
          ? { nome: linha.name ?? null, empresa: linha.company ?? null, cidade: linha.city ?? null }
          : null
      }

      return {
        identidade: {
          nome: String(agente.name ?? ''),
          empresa: String(agente.company_name ?? ''),
          primeiraFala: agente.first_message ?? null,
        },
        politica: {
          gravacaoLigada: politica?.recording_enabled !== false,
          avisoDeGravacao: politica?.recording_notice_text ?? null,
        },
        lead,
      }
    },

    async lerEnsaio(contaId, ensaioId) {
      const { data, error } = await servico
        .from('rehearsals')
        .select('id, call_id, finished_at, agent_publication_id')
        .eq('account_id', contaId)
        .eq('id', ensaioId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null

      // O identificador da conversa mora em `calls`, e não aqui: consulta
      // própria, e não junção embutida, pela razão de `call-review/index.ts`.
      const { data: chamada, error: erroDaChamada } = await servico
        .from('calls')
        .select('provider_conversation_id')
        .eq('id', data.call_id)
        .maybeSingle()
      if (erroDaChamada) throw new Error(erroDaChamada.message)

      // O agente da publicação do ensaio: a conversa lida no fim tem que ser dele.
      let agente: string | null = null
      if (data.agent_publication_id) {
        const { data: publicacao, error: erroDaPublicacao } = await servico
          .from('agent_publications')
          .select('provider_agent_id')
          .eq('account_id', contaId)
          .eq('id', data.agent_publication_id)
          .maybeSingle()
        if (erroDaPublicacao) throw new Error(erroDaPublicacao.message)
        agente = publicacao?.provider_agent_id ?? null
      }

      return {
        id: data.id,
        call_id: data.call_id,
        finished_at: data.finished_at ?? null,
        provider_conversation_id: chamada?.provider_conversation_id ?? null,
        provider_agent_id: agente,
      }
    },

    async buscarConversa(conversaId) {
      const chave = contaEmVoo ? await chaveDaVoz(contaEmVoo) : null
      if (!chave) return null
      try {
        const resposta = await fetch(
          `${ENDERECO_DO_PROVEDOR}/conversations/${encodeURIComponent(conversaId)}`,
          { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS) },
        )
        if (!resposta.ok) return null
        const corpo = (await resposta.json()) as Record<string, unknown>

        const bruta = Array.isArray(corpo.transcript) ? corpo.transcript : []
        const turnos: { quem: 'agent' | 'lead'; texto: string }[] = []
        for (const item of bruta) {
          if (!item || typeof item !== 'object') continue
          const { role, message } = item as { role?: unknown; message?: unknown }
          if (typeof message !== 'string' || message.trim() === '') continue
          // O provedor chama o outro lado de `user`; aqui ele é `lead`, que é o
          // vocabulário de `calls.transcript` e o que `call-review` lê.
          turnos.push({ quem: role === 'agent' ? 'agent' : 'lead', texto: message.trim() })
        }

        const metadados = corpo.metadata && typeof corpo.metadata === 'object'
          ? (corpo.metadata as Record<string, unknown>)
          : {}
        const duracao = metadados.call_duration_secs
        return {
          turnos,
          duracaoSeg: typeof duracao === 'number' && Number.isFinite(duracao) ? duracao : null,
          agenteId: typeof corpo.agent_id === 'string' ? corpo.agent_id : null,
        }
      } catch {
        return null
      }
    },

    async encerrarEnsaio(dados) {
      const { data, error } = await servico.rpc('encerrar_ensaio', {
        p_rehearsal_id: dados.ensaioId,
        p_transcript: dados.transcricao,
        p_provider_conversation_id: dados.conversaId,
        p_duration_sec: dados.duracaoSeg,
      })
      if (error) throw new Error(error.message)
      return data === true
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

  const resposta = await atenderEnsaio(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      acao: corpo?.action ?? null,
      proposito: corpo?.purpose ?? null,
      modo: corpo?.mode ?? null,
      perfil: corpo?.persona_profile ?? null,
      ensaioId: corpo?.rehearsal_id ?? null,
      conversaId: corpo?.conversation_id ?? null,
    },
    criarPorta(),
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
