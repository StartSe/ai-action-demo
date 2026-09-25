// Adaptador Deno da função call-diagnose. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase, o cofre, a API da ElevenLabs e o modelo, e entrega a
// decisão para `diagnostico.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt.** Sem bloco em `config.toml`, o gateway fica em
// `verify_jwt = true`; a sessão é lida de novo aqui porque o usuário vira
// `created_by`. Quem confere o papel é `diagnostico.ts`.
//
// **Por que a chave de serviço.** `call_diagnoses` é classe Servidor, sem
// política de escrita de cliente: diagnóstico forjado com proposta própria e
// depois aplicado seria configuração mudada por um caminho que ninguém revisa.
// Aplicar é outro caminho — o RPC `aplicar_proposta_do_diagnostico`, chamado
// pela tela com a sessão de quem aprovou.
//
// **A chave da ElevenLabs é a da conta**, pela cascata de `_shared/secrets.ts`
// (`voz` / `api_key`), resolvida a cada pedido e nunca guardada entre pedidos.
//
// **NENHUMA JUNÇÃO EMBUTIDA**, pela razão de `call-review/index.ts`: cada tabela
// é uma consulta, e o casamento é no código.
//
// **PARA O CI:** as três leituras reais da ElevenLabs (as suposições C1 a C7,
// A1 a A3 e W1 de `formato-do-provedor.ts`), a chamada real ao modelo e o
// `deno check` deste arquivo.

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

import {
  atenderDiagnostico,
  CREDENCIAL_DA_VOZ,
  TAREFA_DO_DIAGNOSTICO,
  type PortaDoDiagnostico,
  type RespostaDaVoz,
} from './diagnostico.ts'
import type { Proposito } from '../_shared/playbook/camada-um.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DO_PROVEDOR_DE_VOZ = 'https://api.elevenlabs.io/v1'

/** Cada leitura da ElevenLabs espera até 15 s: é uma ficha, não uma ligação. */
const LIMITE_DO_PROVEDOR_MS = 15_000

/** O modelo lê a conversa inteira; a tela mostra a espera, mas não espera para sempre. */
const LIMITE_DO_MODELO_MS = 120_000
const TETO_DE_SAIDA = 8_000

const APLICACAO = {
  url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined,
  nome: NOME_DO_PRODUTO,
}

// `apikey` e `x-client-info` entram porque o cliente do Supabase os manda em
// toda requisição: sem eles, o navegador barra no preflight.
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

/** A versão vigente de um playbook: a publicada, ou a mais nova quando nenhuma foi. */
async function versaoVigente(playbookId: string, versaoPublicadaId: string | null) {
  let consulta = servico.from('playbook_versions').select('body_script, body_house').eq('playbook_id', playbookId)
  consulta = versaoPublicadaId
    ? consulta.eq('id', versaoPublicadaId)
    : consulta.order('version', { ascending: false }).limit(1)
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  const vigente = (data ?? [])[0]
  return vigente ? { roteiro: vigente.body_script ?? '', jeitoDaCasa: vigente.body_house ?? '' } : null
}

const porta: PortaDoDiagnostico = {
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

  async lerChamada(contaId, chamadaId) {
    // Ficha por id lê `calls`, e não `chamadas_reais`: o ensaio também se
    // diagnostica.
    const { data, error } = await servico
      .from('calls')
      .select('id, status, end_reason, direction, duration_sec, purpose, provider_conversation_id')
      .eq('account_id', contaId)
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  async lerPublicacao(contaId, proposito) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('provider_agent_id, status')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  },

  async lerConfiguracaoGravada(contaId) {
    const { data: agente, error: erroDoAgente } = await servico
      .from('agents')
      .select('name, first_message, offer_line, never_claim, voice_id, voice_settings')
      .eq('account_id', contaId)
      .maybeSingle()
    if (erroDoAgente) throw new Error(erroDoAgente.message)

    const { data: politica, error: erroDaPolitica } = await servico
      .from('account_settings')
      .select(
        'max_duration_seconds, min_interval_minutes, daily_attempts_per_number, daily_calls_cap, max_concurrent, recording_notice_text',
      )
      .eq('account_id', contaId)
      .maybeSingle()
    if (erroDaPolitica) throw new Error(erroDaPolitica.message)

    const { data: playbooks, error: erroDosPlaybooks } = await servico
      .from('playbooks')
      .select('id, purpose, current_version_id')
      .eq('account_id', contaId)
    if (erroDosPlaybooks) throw new Error(erroDosPlaybooks.message)

    const roteiros: Partial<Record<Proposito, { roteiro: string; jeitoDaCasa: string }>> = {}
    for (const playbook of playbooks ?? []) {
      const vigente = await versaoVigente(playbook.id, playbook.current_version_id)
      if (vigente) roteiros[playbook.purpose as Proposito] = vigente
    }

    const ajustes = (agente?.voice_settings ?? {}) as Record<string, unknown>
    return {
      vozId: agente?.voice_id ?? null,
      estado: {
        identidade: agente
          ? {
              nome: agente.name,
              primeiraFala: agente.first_message ?? null,
              oferta: agente.offer_line ?? null,
              nuncaAfirmar: agente.never_claim ?? [],
            }
          : null,
        roteiros,
        voz: Object.fromEntries(
          Object.entries(ajustes).filter((par): par is [string, number] => typeof par[1] === 'number'),
        ),
        politica: politica
          ? {
              duracao_maxima: politica.max_duration_seconds,
              intervalo_minimo: politica.min_interval_minutes,
              tentativas_por_numero: politica.daily_attempts_per_number,
              teto_diario: politica.daily_calls_cap,
              simultaneidade: politica.max_concurrent,
            }
          : null,
        avisoDeGravacao: politica?.recording_notice_text ?? null,
      },
    }
  },

  credencialDaVoz(contaId) {
    return cofre.resolveSecret(contaId, CREDENCIAL_DA_VOZ.provedor, CREDENCIAL_DA_VOZ.chave)
  },

  async consultarVoz(caminho, chave): Promise<RespostaDaVoz> {
    const inicio = Date.now()
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${caminho}`, {
        headers: { 'xi-api-key': chave },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      const latenciaMs = Date.now() - inicio
      if (!resposta.ok) {
        await resposta.body?.cancel()
        return { ok: false, status: resposta.status, latenciaMs, corpo: null }
      }
      return { ok: true, status: resposta.status, latenciaMs, corpo: await resposta.json() }
    } catch {
      return { ok: false, status: null, latenciaMs: Date.now() - inicio, corpo: null }
    }
  },

  async modeloDaConta(contaId) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', {
      p_account_id: contaId,
      p_tarefa: TAREFA_DO_DIAGNOSTICO,
    })
    if (error) throw new Error(error.message)
    return modeloDaTarefa((data ?? [])[0] ?? null, TAREFA_DO_DIAGNOSTICO)
  },

  async perguntarAoModelo(pedido) {
    return await perguntarPelaPorta(
      pedido.contaId,
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

  async gravarDiagnostico(linha) {
    const { data, error } = await servico.from('call_diagnoses').insert(linha).select('id, created_at').single()
    if (error) throw new Error(error.message)
    return data
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

  const resposta = await atenderDiagnostico(
    {
      metodo: requisicao.method,
      autorizacao: requisicao.headers.get('authorization'),
      contaId: corpo?.account_id ?? null,
      chamadaId: corpo?.call_id ?? null,
    },
    porta,
  )

  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
