// Adaptador Deno da função voice-catalog. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase e as duas chamadas ao provedor de voz, e
// entrega a decisão para `catalogo.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `catalogo.ts`, `formato-do-provedor.ts` e
// `respostas.ts`, que são portáveis e testados em `npm run test:unit`. Quem
// verifica este arquivo é o `deno check` de `npm run check:funcoes`, no CI.
//
// **O catálogo é montado uma vez, fora do `Deno.serve`.** O cache de 60 s vive
// dentro dele, e é isso que faz a segunda abertura da tela não voltar ao
// provedor. Montá-lo por requisição daria um cache que nunca acerta.
//
// **Por que a chave de serviço.** A função lê `account_members` para conferir o
// papel de quem pediu e `agents` para pegar a primeira fala. O JWT é conferido
// pelo gateway (sem bloco em `config.toml`, o padrão é `verify_jwt = true`), e
// a sessão é lida de novo aqui porque a função precisa do usuário, não só da
// garantia de que existe um.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  criarCatalogoDeVozes,
  type PedidoDeAmostra,
  type PortaDoCatalogo,
  type RespostaDaAmostra,
  type RespostaDaLista,
} from './catalogo.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

const ENDERECO_DO_PROVEDOR = 'https://api.elevenlabs.io/v1'

/** Listar é rápido; sintetizar uma frase de abertura, nem tanto. */
const LIMITE_DA_LISTA_MS = 10_000
const LIMITE_DA_AMOSTRA_MS = 20_000

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

  // A voz não é recurso com credencial própria: a chave do provedor é da conta.
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

const porta: PortaDoCatalogo = {
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

  async agenteDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select('name, company_name, never_claim, voice_settings, first_message')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    return {
      name: String(linha.name ?? ''),
      company_name: String(linha.company_name ?? ''),
      never_claim: Array.isArray(linha.never_claim) ? (linha.never_claim as string[]) : [],
      voice_settings:
        typeof linha.voice_settings === 'object' && linha.voice_settings !== null
          ? (linha.voice_settings as Record<string, unknown>)
          : {},
      first_message: (linha.first_message as string | null) ?? null,
    }
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  listarVozes(_contaId, credencial) {
    return listarVozes(credencial)
  },

  sintetizarAmostra(pedido) {
    return sintetizarAmostra(pedido)
  },
}

const catalogo = criarCatalogoDeVozes({ porta })

/** A biblioteca de vozes da conta no provedor. Nunca levanta por resposta ruim. */
async function listarVozes(credencial: string): Promise<RespostaDaLista> {
  let resposta: Response
  try {
    resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/voices`, {
      headers: { 'xi-api-key': credencial },
      signal: AbortSignal.timeout(LIMITE_DA_LISTA_MS),
    })
  } catch (erro) {
    return { ok: false, codigo: erro instanceof Error ? erro.name : 'fetch_failed', status: null }
  }

  let corpo: Record<string, unknown> = {}
  try {
    corpo = (await resposta.json()) as Record<string, unknown>
  } catch {
    // Corpo ilegível não impede a decisão: o status basta.
  }

  if (!resposta.ok) return { ok: false, codigo: codigoDoErro(corpo), status: resposta.status }
  return { ok: true, vozes: corpo, status: resposta.status }
}

/**
 * A síntese da abertura. O áudio volta binário e sobe em base64 no corpo: são
 * poucos segundos de fala, e uma URL assinada exigiria guardar o arquivo em
 * algum lugar só para a tela poder ouvi-lo uma vez.
 */
async function sintetizarAmostra(pedido: PedidoDeAmostra): Promise<RespostaDaAmostra> {
  let resposta: Response
  try {
    resposta = await fetch(
      `${ENDERECO_DO_PROVEDOR}/text-to-speech/${encodeURIComponent(pedido.vozId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': pedido.credencial,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify(pedido.corpo),
        signal: AbortSignal.timeout(LIMITE_DA_AMOSTRA_MS),
      },
    )
  } catch (erro) {
    return { ok: false, codigo: erro instanceof Error ? erro.name : 'fetch_failed', status: null }
  }

  if (!resposta.ok) {
    let corpo: Record<string, unknown> = {}
    try {
      corpo = (await resposta.json()) as Record<string, unknown>
    } catch {
      // Sem corpo legível, o status decide.
    }
    return { ok: false, codigo: codigoDoErro(corpo), status: resposta.status }
  }

  const audio = new Uint8Array(await resposta.arrayBuffer())
  return {
    ok: true,
    audioBase64: emBase64(audio),
    formato: resposta.headers.get('content-type') ?? 'audio/mpeg',
    status: resposta.status,
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

/** Base64 em pedaços: `String.fromCharCode` com megabytes de argumentos estoura a pilha. */
function emBase64(bytes: Uint8Array): string {
  const pedaco = 0x8000
  let texto = ''
  for (let inicio = 0; inicio < bytes.length; inicio += pedaco) {
    texto += String.fromCharCode(...bytes.subarray(inicio, inicio + pedaco))
  }
  return btoa(texto)
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  const endereco = new URL(requisicao.url)
  let contaId: unknown = endereco.searchParams.get('contaId')
  let vozId: unknown = endereco.searchParams.get('vozId')
  let ajustes: unknown = null

  if (requisicao.method === 'POST') {
    try {
      const corpo = (await requisicao.json()) as Record<string, unknown> | null
      contaId = corpo?.contaId ?? corpo?.conta_id ?? contaId
      vozId = corpo?.vozId ?? corpo?.voz_id ?? vozId
      ajustes = corpo?.ajustes ?? null
    } catch {
      // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
    }
  }

  const resposta = await catalogo.atender({
    metodo: requisicao.method,
    contaId,
    autorizacao: requisicao.headers.get('authorization'),
    vozId,
    ajustes,
  })

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
