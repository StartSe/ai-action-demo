// Adaptador Deno da função onboarding-interview. Só amarração: lê o ambiente,
// monta a porta sobre o Supabase, a ElevenLabs e o modelo, e entrega a decisão
// para `entrevista.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **A CHAVE DA ELEVENLABS É A DA CONTA**, resolvida pelo mesmo cofre de
// `rehearsal-session` e `agent-publish`. Ela nunca vai ao navegador: o que vai
// é a URL assinada da conversa, que vale para uma conversa e expira.
//
// **A VOZ DA ENTREVISTA** é a que a conta já escolheu em `agents.voice_id`,
// quando há; senão, a voz pronta "Sarah" do catálogo da ElevenLabs
// (`VOZ_PADRAO`). A conferência de que esse identificador existe é do CI.
//
// **PARA O CI:** as idas reais à ElevenLabs (criar agente, URL assinada,
// conversa, apagar) e ao modelo, e o `deno check` deste arquivo.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { NOME_DO_PRODUTO } from '../_shared/marca.ts'

import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { perguntarAoModelo as perguntarPelaPorta } from '../_shared/modelo/pergunta.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { garantirVozNaConta } from '../_shared/voz/voz-na-conta.ts'
import { CHAVE_DO_PROVEDOR_DE_VOZ, PROVEDOR_DE_VOZ } from '../agent-publish/publicacao.ts'

import { atenderEntrevista, type ConversaLida, type PortaDaEntrevista } from './entrevista.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DO_PROVEDOR = 'https://api.elevenlabs.io/v1/convai'
const LIMITE_DO_PROVEDOR_MS = 20_000
const LIMITE_DO_MODELO_MS = 90_000

/** O idioma e o modelo de voz da publicação, os mesmos de `agent-publish`. */
const IDIOMA = 'pt'
const MODELO_DE_VOZ = 'eleven_flash_v2_5'
/** A voz pronta "Sarah" do catálogo da ElevenLabs. Ver o cabeçalho. */
const VOZ_PADRAO = 'EXAVITQu4vr4xnSDxMaL'

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const TAREFA = 'draft' as const
const TETO_DE_SAIDA = 8_000
const APLICACAO = {
  url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined,
  nome: NOME_DO_PRODUTO,
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

/** A chave da ElevenLabs desta conta, ou nula. */
async function chaveDaVoz(contaId: string): Promise<string | null> {
  const resolvida = await cofre.resolveSecret(contaId, PROVEDOR_DE_VOZ, CHAVE_DO_PROVEDOR_DE_VOZ)
  return resolvida.ok ? resolvida.valor : null
}

/** A voz que a conta já escolheu, ou a padrão. */
async function vozDaConta(contaId: string): Promise<string> {
  const { data } = await servico.from('agents').select('voice_id').eq('account_id', contaId).maybeSingle()
  const escolhida = (data as { voice_id?: string | null } | null)?.voice_id
  return typeof escolhida === 'string' && escolhida.trim() !== '' ? escolhida : VOZ_PADRAO
}

const porta: PortaDaEntrevista = {
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

  async garantirVoz(contaId, vozId, nome) {
    const chave = await chaveDaVoz(contaId)
    if (!chave) return null
    return garantirVozNaConta({ chave, vozId, nome })
  },

  async criarAgente(contaId, agente) {
    const chave = await chaveDaVoz(contaId)
    if (!chave) return { ok: false, semCredencial: true }
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/agents/create`, {
        method: 'POST',
        headers: { 'xi-api-key': chave, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: agente.nome,
          conversation_config: {
            agent: {
              language: IDIOMA,
              first_message: agente.primeiraFala,
              prompt: { prompt: agente.instrucao },
            },
            tts: { voice_id: agente.vozId ?? (await vozDaConta(contaId)), model_id: MODELO_DE_VOZ },
            conversation: { max_duration_seconds: agente.duracaoMaximaSeg },
            // Quanto silêncio antes de a assistente perguntar se a pessoa ainda
            // está ali. Quem configura para para pensar e para digitar: o
            // padrão curto do provedor a faria cobrar resposta à toa.
            turn: { turn_timeout: agente.esperaPorRespostaSeg },
          },
        }),
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      const corpo = (await resposta.json().catch(() => null)) as { agent_id?: unknown } | null
      if (!resposta.ok || typeof corpo?.agent_id !== 'string') {
        return { ok: false, semCredencial: resposta.status === 401 }
      }
      return { ok: true, valor: corpo.agent_id }
    } catch {
      return { ok: false, semCredencial: false }
    }
  },

  async pedirSessaoAssinada(contaId, agenteId) {
    const chave = await chaveDaVoz(contaId)
    if (!chave) return { ok: false, semCredencial: true }
    try {
      const resposta = await fetch(
        `${ENDERECO_DO_PROVEDOR}/conversation/get_signed_url?agent_id=${encodeURIComponent(agenteId)}`,
        { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS) },
      )
      const corpo = (await resposta.json().catch(() => null)) as { signed_url?: unknown } | null
      if (!resposta.ok || typeof corpo?.signed_url !== 'string') {
        return { ok: false, semCredencial: resposta.status === 401 }
      }
      return { ok: true, valor: corpo.signed_url }
    } catch {
      return { ok: false, semCredencial: false }
    }
  },

  async lerConversa(contaId, conversaId): Promise<ConversaLida | null> {
    const chave = await chaveDaVoz(contaId)
    if (!chave) return null
    try {
      const resposta = await fetch(
        `${ENDERECO_DO_PROVEDOR}/conversations/${encodeURIComponent(conversaId)}`,
        { headers: { 'xi-api-key': chave }, signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS) },
      )
      if (!resposta.ok) return null
      const corpo = (await resposta.json()) as Record<string, unknown>
      // `processing` e `in-progress` ainda não têm a transcrição inteira.
      if (corpo.status !== 'done' && corpo.status !== 'failed') return { pronta: false }

      const turnos: { quem: 'agent' | 'lead'; texto: string }[] = []
      for (const item of Array.isArray(corpo.transcript) ? corpo.transcript : []) {
        if (!item || typeof item !== 'object') continue
        const { role, message } = item as { role?: unknown; message?: unknown }
        if (typeof message !== 'string' || message.trim() === '') continue
        turnos.push({ quem: role === 'agent' ? 'agent' : 'lead', texto: message.trim() })
      }
      return { pronta: true, turnos, agenteId: typeof corpo.agent_id === 'string' ? corpo.agent_id : null }
    } catch {
      return null
    }
  },

  async apagarAgente(contaId, agenteId) {
    const chave = await chaveDaVoz(contaId)
    if (!chave) return
    await fetch(`${ENDERECO_DO_PROVEDOR}/agents/${encodeURIComponent(agenteId)}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': chave },
      signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
    })
  },

  esperar(ms) {
    return new Promise((resolver) => setTimeout(resolver, ms))
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

  const resposta = await atenderEntrevista(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      acao: corpo?.action ?? null,
      agenteId: corpo?.agent_id ?? null,
      conversaId: corpo?.conversation_id ?? null,
      vozId: corpo?.voice_id ?? null,
      vozNome: corpo?.voice_name ?? null,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
