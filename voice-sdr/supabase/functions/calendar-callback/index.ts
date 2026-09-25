// Adaptador Deno de calendar-callback. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e entrega a decisão para `retorno.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Por que `verify_jwt = false`.** Quem chega é um navegador redirecionado
// pelo Google, sem `Authorization` nosso. A credencial é o `state` assinado,
// conferido em `retorno.ts` antes de qualquer porta.
//
// **Um cliente só, o de serviço.** Não há sessão para agir como ninguém: a
// gravação é `conectar_calendario_do_especialista`, concedida só a
// `service_role`, e o papel de quem clicou se lê de `account_members` com o
// usuário que o `state` carrega.
//
// **O cache de `secrets.ts`** é o deste processo. Os outros processos (a rotina,
// a ferramenta de agenda) guardam o token por no máximo 60 s (T-12), e o
// segredo reaproveitado faz a leitura seguinte deles já achar o valor novo no
// mesmo ponteiro.
//
// **PARA O CI E PARA AMBIENTE COM APLICATIVO VERIFICADO:** o trajeto real do
// OAuth (P-04).

import { createClient } from 'npm:@supabase/supabase-js@2'

import { RECURSO_DO_CALENDARIO } from '../_shared/agenda/calendario.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'

import { atenderVoltaDoCalendario, type PortaDaVolta } from './retorno.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_DO_SERVIDOR = Deno.env.get('CHAVE_DO_SERVIDOR') ?? ''
const CLIENTE_ID = Deno.env.get('SARAH_GOOGLE_CLIENT_ID') ?? ''
const CLIENTE_SEGREDO = Deno.env.get('SARAH_GOOGLE_CLIENT_SECRET') ?? ''
const REDIRECIONAMENTO =
  Deno.env.get('SARAH_GOOGLE_REDIRECT_URI') ?? (URL_DO_SUPABASE ? `${URL_DO_SUPABASE}/functions/v1/calendar-callback` : '')
const ENDERECO_DA_INTERFACE = Deno.env.get('ENDERECO_DA_INTERFACE') ?? ''

/** Alguém está olhando a tela do Google girar: 10 s pela troca. */
const PRAZO_DA_TROCA_MS = 10_000

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
    // Esta borda escreve o token e não o lê; o degrau existe para a forma da porta.
    return null
  },
  segredoDaPlataforma(provedor, chave) {
    return lerPlataforma(provedor, chave)
  },
  async modoDeCredencial() {
    return 'account'
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: lerAmbiente(Deno.env.get('SARAH_AMBIENTE')) })

const porta: PortaDaVolta = {
  async especialistaDaConta(contaId, especialistaId) {
    const { data, error } = await servico
      .from('specialists')
      .select('id')
      .eq('id', especialistaId)
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data !== null
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

  async gravarCalendario(calendario) {
    const { data, error } = await servico.rpc('conectar_calendario_do_especialista', {
      p_account_id: calendario.contaId,
      p_specialist_id: calendario.especialistaId,
      p_provider: calendario.provedor,
      p_external_id: calendario.agendaId,
      p_refresh_token: calendario.tokenDeAtualizacao,
    })
    // A mensagem do banco não sai: o parâmetro do RPC é o token.
    if (error) throw new Error('conectar_calendario_do_especialista falhou')
    const linha = ((data ?? []) as { calendar_id: string; reaproveitado: boolean }[])[0]
    if (!linha) throw new Error('conectar_calendario_do_especialista não devolveu linha')
    return { calendarioId: linha.calendar_id, reaproveitado: linha.reaproveitado }
  },

  invalidarCredencial(contaId, provedor, chave) {
    cofre.invalidar(contaId, provedor, chave)
  },

  registrarNoLog(evento) {
    console.warn(JSON.stringify({ funcao: 'calendar-callback', recurso: RECURSO_DO_CALENDARIO, ...evento }))
  },
}

Deno.serve(async (requisicao: Request) => {
  const parametros = new URL(requisicao.url).searchParams
  const resposta = await atenderVoltaDoCalendario(
    {
      metodo: requisicao.method,
      estado: parametros.get('state'),
      codigo: parametros.get('code'),
      erro: parametros.get('error'),
    },
    porta,
    {
      buscar: fetch,
      clienteId: CLIENTE_ID,
      clienteSegredo: CLIENTE_SEGREDO,
      redirecionamento: REDIRECIONAMENTO,
      chaveDoServidor: CHAVE_DO_SERVIDOR,
      destino: ENDERECO_DA_INTERFACE ? new URL('/especialistas', ENDERECO_DA_INTERFACE).toString() : null,
      prazoMs: PRAZO_DA_TROCA_MS,
    },
  )

  return new Response(resposta.html, {
    status: resposta.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // O endereço tem o código na barra; a página não o repassa a ninguém.
      'referrer-policy': 'no-referrer',
    },
  })
})
