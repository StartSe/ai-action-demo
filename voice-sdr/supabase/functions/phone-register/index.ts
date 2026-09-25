// Adaptador Deno da função phone-register. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase e as quatro chamadas aos dois provedores, e
// entrega a decisão para `registro.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `registro.ts` e `respostas.ts`, que são
// portáveis e testados em `npm run test:unit`. Quem verifica este arquivo é o
// `deno check` de `npm run check:funcoes`, no CI.
//
// **Por que a chave de serviço.** A função lê `account_members` para conferir o
// papel de quem pediu, `phone_lines` e `agent_publications`, e **escreve** na
// linha. O JWT é conferido pelo gateway (sem bloco em `config.toml`, o padrão é
// `verify_jwt = true`), e a sessão é lida de novo aqui porque a função precisa
// do usuário, não só da garantia de que existe um.
//
// **O par da telefonia sai para o provedor de voz**, e é neste arquivo que ele
// viaja: `importarNoProvedorDeVoz` manda o identificador e o token no corpo. A
// razão está no cabeçalho de `registro.ts`, e não se repete aqui por acaso: é
// lá que a decisão mora.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  PROPOSITO_DA_ENTRADA,
  registrarNumero,
  type PedidoDeApontamento,
  type PedidoDeBusca,
  type PedidoDeImportacao,
  type PedidoDeRemocao,
  type PortaDoRegistro,
  type RespostaDaBusca,
  type RespostaDaImportacao,
  type RespostaDoProvedor,
} from './registro.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DA_TELEFONIA = 'https://api.twilio.com/2010-04-01'
const ENDERECO_DO_PROVEDOR_DE_VOZ = 'https://api.elevenlabs.io/v1'

/** O endereço de `inbound-twiml`, que é para onde o webhook de voz aponta. */
const ENDERECO_DO_ATENDIMENTO =
  Deno.env.get('SARAH_INBOUND_TWIML_URL') ??
  `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/inbound-twiml`

/** Registrar número passa por aprovação e não é rápido. */
const LIMITE_DO_PROVEDOR_MS = 20_000

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
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

  // A linha telefônica não guarda credencial própria: quem tem chave é a conta.
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

const porta: PortaDoRegistro = {
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

  async linhaDaConta(contaId, linhaId) {
    const { data, error } = await servico
      .from('phone_lines')
      .select(
        'id, account_id, e164, label, inbound_behavior, forward_to, provider_number_id, provider_voice_id',
      )
      .eq('account_id', contaId)
      .eq('id', linhaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    return {
      id: String(linha.id ?? ''),
      account_id: String(linha.account_id ?? ''),
      e164: String(linha.e164 ?? ''),
      label: String(linha.label ?? ''),
      inbound_behavior: String(linha.inbound_behavior ?? ''),
      forward_to: (linha.forward_to as string | null) ?? null,
      provider_number_id: (linha.provider_number_id as string | null) ?? null,
      provider_voice_id: (linha.provider_voice_id as string | null) ?? null,
    }
  },

  async publicacaoDeEntrada(contaId) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('provider_agent_id')
      .eq('account_id', contaId)
      .eq('purpose', PROPOSITO_DA_ENTRADA)
      .eq('status', 'publicado')
      .maybeSingle()
    if (error) throw new Error(error.message)
    const publicacao = (data as { provider_agent_id?: string | null } | null)?.provider_agent_id
    return publicacao ? { provider_agent_id: publicacao } : null
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  numeroNaTelefonia,
  importarNoProvedorDeVoz,
  apontarWebhookDeVoz,
  removerDoProvedorDeVoz,

  async gravarRegistro(linha) {
    const { error } = await servico
      .from('phone_lines')
      .update({
        provider_number_id: linha.providerNumberId,
        provider_voice_id: linha.providerVoiceId,
      })
      .eq('account_id', linha.contaId)
      .eq('id', linha.linhaId)
    if (error) throw new Error(error.message)
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },
}

/** Autenticação básica da telefonia: identificador e token, em base64. */
function autorizacaoDaTelefonia(identificador: string, token: string): string {
  return `Basic ${btoa(`${identificador}:${token}`)}`
}

/** O identificador do número na telefonia, buscado por E.164. */
async function numeroNaTelefonia(pedido: PedidoDeBusca): Promise<RespostaDaBusca> {
  const endpoint = `Accounts/${pedido.identificador}/IncomingPhoneNumbers.json`
  const endereco = new URL(`${ENDERECO_DA_TELEFONIA}/${endpoint}`)
  endereco.searchParams.set('PhoneNumber', pedido.e164)

  const inicio = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(endereco, {
      headers: { authorization: autorizacaoDaTelefonia(pedido.identificador, pedido.token) },
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

  const lista = Array.isArray(corpo.incoming_phone_numbers) ? corpo.incoming_phone_numbers : []
  const primeiro = (lista[0] ?? {}) as Record<string, unknown>
  return {
    ok: true,
    providerNumberId: typeof primeiro.sid === 'string' ? primeiro.sid : null,
    status: resposta.status,
    latenciaMs,
    // O corpo do registro de integração não leva a lista inteira: ela repete o
    // número e traz a configuração toda do provedor.
    corpo: { encontrados: lista.length },
    endpoint,
  }
}

/** A importação na integração nativa. É aqui que o par da telefonia sai. */
async function importarNoProvedorDeVoz(
  pedido: PedidoDeImportacao,
): Promise<RespostaDaImportacao> {
  const criando = !pedido.providerVoiceId
  const endpoint = criando
    ? 'convai/phone-numbers'
    : `convai/phone-numbers/${pedido.providerVoiceId}`

  const inicio = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
      method: criando ? 'POST' : 'PATCH',
      headers: {
        'xi-api-key': pedido.credencialDeVoz,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'twilio',
        phone_number: pedido.e164,
        label: pedido.rotulo,
        sid: pedido.identificador,
        token: pedido.token,
        agent_id: pedido.providerAgentId,
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

  const estado = typeof corpo.status === 'string' ? corpo.status : ''
  return {
    ok: true,
    providerVoiceId:
      typeof corpo.phone_number_id === 'string'
        ? corpo.phone_number_id
        : (pedido.providerVoiceId ?? null),
    // "Aguardando aprovação da operadora" é resultado normal (P-04), e quem o
    // reconhece é este adaptador: o nome do estado é do provedor.
    pendente: /pending|awaiting|review/i.test(estado),
    status: resposta.status,
    latenciaMs,
    corpo: { status: estado },
    endpoint,
  }
}

/** O webhook de voz do número passa a apontar para `inbound-twiml`. */
async function apontarWebhookDeVoz(pedido: PedidoDeApontamento): Promise<RespostaDoProvedor> {
  const endpoint = `Accounts/${pedido.identificador}/IncomingPhoneNumbers/${pedido.providerNumberId}.json`
  const corpoDoPedido = new URLSearchParams({
    VoiceUrl: pedido.webhookDeVoz,
    VoiceMethod: 'POST',
  })

  const inicio = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/${endpoint}`, {
      method: 'POST',
      headers: {
        authorization: autorizacaoDaTelefonia(pedido.identificador, pedido.token),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: corpoDoPedido,
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
  return { ok: true, status: resposta.status, latenciaMs, corpo: {}, endpoint }
}

/** A importação anterior sai do provedor de voz quando o destino muda. */
async function removerDoProvedorDeVoz(pedido: PedidoDeRemocao): Promise<RespostaDoProvedor> {
  const endpoint = `convai/phone-numbers/${pedido.providerVoiceId}`

  const inicio = Date.now()
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': pedido.credencialDeVoz },
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

  const latenciaMs = Date.now() - inicio
  if (!resposta.ok) {
    const corpo = await corpoJson(resposta)
    return { ok: false, codigo: codigoDoErro(corpo), status: resposta.status, latenciaMs, endpoint }
  }
  return { ok: true, status: resposta.status, latenciaMs, corpo: {}, endpoint }
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

  let contaId: unknown = null
  let linhaId: unknown = null
  try {
    const corpo = (await requisicao.json()) as Record<string, unknown> | null
    contaId = corpo?.contaId ?? corpo?.conta_id ?? null
    linhaId = corpo?.linhaId ?? corpo?.linha_id ?? null
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await registrarNumero(
    {
      metodo: requisicao.method,
      contaId,
      linhaId,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
    { enderecoDoAtendimento: ENDERECO_DO_ATENDIMENTO },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
