// Adaptador Deno da função call-place. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase e o disparo sobre a API do provedor de voz, e
// entrega a decisão para `discagem.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `discagem.ts` e `respostas.ts`, que são
// portáveis e testados em `npm run test:unit`. Quem verifica este arquivo é o
// `deno check` de `npm run check:funcoes`, no CI.
//
// **Por que a chave de serviço.** `guard_dial` só tem `execute` para
// `service_role` (e é o ponto dela: com `authenticated`, varrer números pela
// guarda seria um oráculo sobre lista de bloqueio e cota, sem ligação e sem
// fatura). `calls`, `audit_log` e `integration_events` também não têm política
// de escrita pelo cliente.
//
// **Por que continua atrás do gateway.** Não há bloco em `config.toml`, então
// `verify_jwt = true` vale, e é o certo para as duas autenticações: a tela
// manda o JWT de quem clicou, e as rotinas chamam por `pg_net` com a chave de
// serviço, que o gateway também aceita. O segundo portão — o que de fato
// distingue rotina de gente — é o cabeçalho `x-internal-secret`, conferido
// dentro de `discagem.ts` contra `SARAH_INTERNAL_SECRET`. Sem a variável, o
// portão das rotinas fica fechado, e não aberto.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'

import {
  CABECALHO_INTERNO,
  colocarChamada,
  type LinhaDeChamada,
  type PedidoDeDisparo,
  type PortaDaDiscagem,
  type RespostaDoDisparo,
} from './discagem.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, nenhuma rotina disca. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

const ENDERECO_DO_PROVEDOR_DE_VOZ = 'https://api.elevenlabs.io/v1'

/**
 * O disparo é o caminho quente da fatia: o primeiro critério de aceite da F2
 * fala em tocar em até 8 s. Dez segundos é o teto de paciência antes de a
 * tentativa virar erro e a linha ficar para `cron-call-recovery`.
 */
const LIMITE_DO_PROVEDOR_MS = 10_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': `authorization, apikey, content-type, x-client-info, ${CABECALHO_INTERNO}`,
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

  // A chamada não guarda credencial própria: quem tem chave é a conta.
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

/** O código do Postgres para violação de único. É o conflito de T-07. */
const UNICO_VIOLADO = '23505'

const porta: PortaDaDiscagem = {
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

  async contaDaDiscagem(contaId) {
    const { data, error } = await servico
      .from('accounts')
      .select('id, timezone')
      .eq('id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const conta = data as { id: string; timezone?: string | null }
    return { id: conta.id, timezone: conta.timezone ?? 'America/Sao_Paulo' }
  },

  async leadDaConta(contaId, leadId) {
    const { data, error } = await servico
      .from('leads')
      .select('id, phone_e164, name, company, city')
      .eq('account_id', contaId)
      .eq('id', leadId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const lead = data as {
      id: string
      phone_e164?: string | null
      name?: string | null
      company?: string | null
      city?: string | null
    }
    return {
      id: lead.id,
      phone_e164: lead.phone_e164 ?? null,
      name: lead.name ?? null,
      company: lead.company ?? null,
      city: lead.city ?? null,
    }
  },

  // As mesmas duas leituras de `call-init`: a abertura sai da mesma regra.
  async identidadeDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select('name, company_name, first_message')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const agente = data as Record<string, unknown>
    return {
      nome: String(agente.name ?? ''),
      empresa: String(agente.company_name ?? ''),
      primeiraFala: (agente.first_message as string | null) ?? null,
    }
  },

  async politicaDaConta(contaId) {
    const { data, error } = await servico
      .from('account_settings')
      .select('recording_enabled, recording_notice_text')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const politica = (data ?? {}) as Record<string, unknown>
    return {
      gravacaoLigada: politica.recording_enabled !== false,
      avisoDeGravacao: (politica.recording_notice_text as string | null) ?? null,
    }
  },

  async publicacaoDoProposito(contaId, proposito) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('id, provider_agent_id')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .eq('status', 'publicado')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const publicacao = data as { id: string; provider_agent_id?: string | null }
    if (!publicacao.provider_agent_id) return null
    return { id: publicacao.id, provider_agent_id: publicacao.provider_agent_id }
  },

  async versaoPublicadaDoPlaybook(contaId, proposito) {
    const { data, error } = await servico
      .from('playbook_versions')
      .select('id, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)')
      .eq('account_id', contaId)
      .eq('status', 'published')
      .eq('playbooks.purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { id: (data as { id: string }).id }
  },

  async ehNumeroDeTeste(contaId, telefoneE164) {
    const { data, error } = await servico
      .from('account_test_numbers')
      .select('id')
      .eq('account_id', contaId)
      .eq('phone_e164', telefoneE164)
      .limit(1)
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  },

  async linhaTelefonica(contaId, linhaId) {
    const { data, error } = await servico
      .from('phone_lines')
      .select('id, e164, provider_voice_id')
      .eq('account_id', contaId)
      .eq('id', linhaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const linha = data as { id: string; e164: string; provider_voice_id?: string | null }
    return { id: linha.id, e164: linha.e164, provider_voice_id: linha.provider_voice_id ?? null }
  },

  async guardDial(chamada) {
    const { data, error } = await servico.rpc('guard_dial', chamada)
    if (error) throw new Error(error.message)
    const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
    if (!linha) throw new Error('guard_dial não devolveu linha')
    return {
      allowed: linha.allowed === true,
      reason: String(linha.reason ?? ''),
      dados: (linha.dados ?? null) as Record<string, unknown> | null,
      phone_line_id: (linha.phone_line_id as string | null) ?? null,
    }
  },

  async gravarChamada(linha: LinhaDeChamada) {
    const { data, error } = await servico
      .from('calls')
      .insert(linha)
      .select('id, status, provider_call_sid')
      .maybeSingle()

    if (!error && data) {
      const chamada = data as { id: string; status: string; provider_call_sid?: string | null }
      return {
        criada: true,
        chamada: {
          id: chamada.id,
          status: chamada.status,
          provider_call_sid: chamada.provider_call_sid ?? null,
        },
      }
    }

    // O conflito de T-07: a chave já existe nesta conta, e a chamada que ela
    // guarda é a resposta. Buscar depois de falhar, e não `on conflict do
    // nothing`, porque o insert precisa continuar sendo o caminho normal.
    if (error?.code !== UNICO_VIOLADO) throw new Error(error?.message ?? 'insert em calls falhou')

    const { data: existente, error: erroDaBusca } = await servico
      .from('calls')
      .select('id, status, provider_call_sid')
      .eq('account_id', linha.account_id)
      .eq('idempotency_key', linha.idempotency_key)
      .maybeSingle()
    if (erroDaBusca || !existente) throw new Error(erroDaBusca?.message ?? 'chamada não encontrada')

    const chamada = existente as { id: string; status: string; provider_call_sid?: string | null }
    return {
      criada: false,
      chamada: {
        id: chamada.id,
        status: chamada.status,
        provider_call_sid: chamada.provider_call_sid ?? null,
      },
    }
  },

  async registrarAuditoria(linha) {
    const { error } = await servico.from('audit_log').insert(linha)
    if (error) throw new Error(error.message)
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  dispararNoProvedor,

  async gravarDisparo(disparo) {
    const { error } = await servico
      .from('calls')
      .update({
        provider_call_sid: disparo.providerCallSid,
        provider_conversation_id: disparo.providerConversationId,
        status: 'ringing',
      })
      .eq('account_id', disparo.contaId)
      .eq('id', disparo.chamadaId)
    if (error) throw new Error(error.message)
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },
}

/**
 * A ligação de saída pela integração nativa do provedor de voz. O corpo leva o
 * agente publicado, o número importado, o destino, as variáveis que o prompt
 * cita e a primeira fala com o lead dentro (`discagem.ts`, "O CONTEXTO VIAJA NO
 * DISPARO"). A sobreposição da primeira fala está liberada na publicação
 * (`platform_settings.overrides`), a mesma que `call-init` usa.
 */
async function dispararNoProvedor(pedido: PedidoDeDisparo): Promise<RespostaDoDisparo> {
  const endpoint = 'convai/twilio/outbound-call'

  const inicio = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
      method: 'POST',
      headers: {
        'xi-api-key': pedido.credencialDeVoz,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: pedido.providerAgentId,
        agent_phone_number_id: pedido.providerPhoneNumberId,
        to_number: pedido.paraNumero,
        conversation_initiation_client_data: {
          dynamic_variables: pedido.variaveis,
          ...(pedido.primeiraFala
            ? { conversation_config_override: { agent: { first_message: pedido.primeiraFala } } }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
    })
  } catch (erro) {
    return {
      ok: false,
      codigo: erro instanceof Error ? erro.name : 'fetch_failed',
      status: null,
      latenciaMs: Date.now() - inicio,
      endpoint,
    }
  }

  const corpo = await corpoJson(resposta)
  const latenciaMs = Date.now() - inicio
  if (!resposta.ok) {
    return { ok: false, codigo: codigoDoErro(corpo), status: resposta.status, latenciaMs, endpoint }
  }

  return {
    ok: true,
    providerCallSid: typeof corpo.callSid === 'string' ? corpo.callSid : null,
    providerConversationId: typeof corpo.conversation_id === 'string' ? corpo.conversation_id : null,
    status: resposta.status,
    latenciaMs,
    corpo: { success: corpo.success === true },
    endpoint,
  }
}

async function corpoJson(resposta: Response): Promise<Record<string, unknown>> {
  try {
    return (await resposta.json()) as Record<string, unknown>
  } catch {
    // Corpo ilegível não impede a decisão: o status basta.
    return {}
  }
}

/** O código que o provedor mandou, para `erros.ts` traduzir e descartar. */
function codigoDoErro(corpo: Record<string, unknown>): string | null {
  const detalhe = (corpo.detail ?? corpo.error ?? corpo) as Record<string, unknown> | string
  const codigo =
    typeof detalhe === 'string'
      ? detalhe
      : ((detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null) as
          | string
          | null)
  return codigo === null ? null : String(codigo)
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await colocarChamada(
    {
      metodo: requisicao.method,
      contaId: corpo?.contaId ?? corpo?.conta_id ?? null,
      proposito: corpo?.proposito ?? corpo?.purpose ?? null,
      fonte: corpo?.fonte ?? corpo?.source ?? null,
      referencia: corpo?.referencia ?? corpo?.reference ?? null,
      ordinal: corpo?.ordinal ?? null,
      tentativa: corpo?.tentativa ?? corpo?.attempt ?? null,
      telefone: corpo?.telefone ?? corpo?.phone ?? null,
      leadId: corpo?.leadId ?? corpo?.lead_id ?? null,
      campanhaId: corpo?.campanhaId ?? corpo?.campaign_id ?? null,
      pular: corpo?.pular ?? corpo?.bypass ?? null,
      motivo: corpo?.motivo ?? corpo?.reason ?? null,
      autorizacao: requisicao.headers.get('authorization'),
      segredoInterno: requisicao.headers.get(CABECALHO_INTERNO),
    },
    porta,
    { segredoInterno: await segredoInterno(), agora: new Date().toISOString() },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
