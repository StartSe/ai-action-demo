// Adaptador Deno de phone-numbers. Só amarração: monta a porta sobre o Supabase
// e sobre a telefonia, e entrega a decisão para `catalogo.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Nada que decide algo mora aqui.
// Quem o verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// A credencial da telefonia sai do cofre da conta pela cascata de
// `_shared/secrets.ts`, como em `phone-register`: é a mesma chave, e resolver
// por outro caminho daria duas verdades sobre de quem é a conta no provedor.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import {
  atenderCatalogo,
  RecusaDoProvedor,
  type NumeroDoProvedor,
  type PortaDoCatalogo,
} from './catalogo.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** A telefonia costuma responder em menos de um segundo; dez é folga larga. */
const LIMITE_DA_CONSULTA_MS = 10_000
/** Uma página basta para a conta que se configura por tela. */
const TETO_DE_NUMEROS = 100

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

  // A telefonia não é recurso com credencial própria: a chave do provedor é da conta.
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
    return modo === 'platform' ? 'platform' : 'account'
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

/** O que a telefonia devolve por número, no recorte que interessa. */
interface LinhaDoProvedor {
  phone_number?: string
  friendly_name?: string
  capabilities?: { voice?: boolean }
  voice_url?: string
  voice_application_sid?: string
  status_callback?: string
}

function semVazio(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

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

  async credenciaisDaTelefonia(contaId) {
    const identificador = await cofre.resolveSecret(contaId, 'telefonia', 'account_sid')
    const token = await cofre.resolveSecret(contaId, 'telefonia', 'auth_token')
    if (!identificador.ok || !token.ok) {
      return null
    }
    return { identificador: identificador.valor, token: token.valor }
  },

  async numerosDoProvedor({ identificador, token }) {
    const endereco =
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(identificador)}` +
      `/IncomingPhoneNumbers.json?PageSize=${TETO_DE_NUMEROS}`

    const resposta = await fetch(endereco, {
      headers: { authorization: `Basic ${btoa(`${identificador}:${token}`)}` },
      signal: AbortSignal.timeout(LIMITE_DA_CONSULTA_MS),
    })

    if (!resposta.ok) {
      // 401 e 403 são chave errada; o resto é problema do lado de lá. A
      // distinção importa porque uma pede ação e a outra pede só esperar.
      throw new RecusaDoProvedor(
        resposta.status === 401 || resposta.status === 403
          ? 'provedor_recusou'
          : 'provedor_indisponivel',
      )
    }

    const corpo = (await resposta.json()) as {
      incoming_phone_numbers?: LinhaDoProvedor[]
    }

    return (corpo.incoming_phone_numbers ?? [])
      .filter((linha) => semVazio(linha.phone_number))
      .map((linha): NumeroDoProvedor => {
        const e164 = semVazio(linha.phone_number) ?? ''
        return {
          e164,
          // Sem apelido no painel, o próprio número serve de rótulo: lista com
          // linha em branco no meio é pior do que repetição.
          rotulo: semVazio(linha.friendly_name) ?? e164,
          atendeVoz: linha.capabilities?.voice === true,
          apontamento: {
            enderecoDeVoz: semVazio(linha.voice_url),
            aplicativo: semVazio(linha.voice_application_sid),
            enderecoDeEstado: semVazio(linha.status_callback),
          },
        }
      })
  },

  async numerosJaCadastrados(contaId) {
    const { data, error } = await servico
      .from('phone_lines')
      .select('e164')
      .eq('account_id', contaId)
    if (error) throw new Error(error.message)
    return (data ?? []).map((linha: { e164: string }) => linha.e164)
  },
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: { contaId?: unknown } = {}
  try {
    corpo = await requisicao.json()
  } catch {
    corpo = {}
  }

  const resposta = await atenderCatalogo(
    {
      metodo: requisicao.method,
      contaId: corpo.contaId,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
  )

  const status = resposta.ok
    ? 200
    : resposta.motivo === 'sem_sessao' || resposta.motivo === 'sessao_invalida'
      ? 401
      : resposta.motivo === 'sem_acesso' || resposta.motivo === 'papel_insuficiente'
        ? 403
        : resposta.motivo === 'metodo_invalido'
          ? 405
          : resposta.motivo === 'falha_interna'
            ? 500
            : 400

  return new Response(JSON.stringify(resposta), { status, headers: CABECALHOS })
})
