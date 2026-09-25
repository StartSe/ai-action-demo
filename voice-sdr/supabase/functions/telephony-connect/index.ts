// Adaptador Deno de telephony-connect.
//
// **O PRODUTO NÃO DEPENDE DESTA FUNÇÃO.** A telefonia de cada conta é a Twilio
// da própria conta, ligada pelo Account SID e pelo Auth Token que quem
// administra digita na etapa de telefonia da configuração inicial (e em
// /config/integracoes), gravados no cofre dela. Nenhuma tela chama esta
// função. Ela é o esboço de uma conexão por OAuth (Twilio Connect) com um
// aplicativo registrado por quem opera a instalação, e continua publicada só
// para não quebrar quem já tivesse o endereço.
//
// **Desligada sem `TWILIO_CONNECT_APP_SID`.** Sem a variável, o início recusa
// com `conexao_indisponivel` e manda cadastrar as chaves à mão; retorno e
// revogação só agem sobre uma conexão já registrada, e sem início não nasce
// conexão nenhuma. Não defina a variável: ligar o OAuth faria a conta depender
// de um aplicativo de terceiro que ela não controla.
//
// Duas portas no mesmo endereço:
//
//   POST /telephony-connect          com sessão: emite o estado e devolve o
//                                    endereço de autorização do provedor
//   GET  /telephony-connect/retorno  sem sessão: é para cá que o provedor
//                                    manda o cliente depois do aceite
//
// O retorno é `GET` e sem sessão porque quem chega é um navegador vindo do
// provedor, redirecionado, sem cabeçalho nosso. É por isso que o `state`
// assinado existe — ele é a única prova de que aquele retorno nasceu aqui, e
// quem o confere é `autorizacao.ts`, que é portável e testado.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Nada que decide algo mora aqui.
// Quem o verifica é o `deno check` do CI (docs/PRD-implementacao.md seção 9.1).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  emitirEstado,
  lerRetornoDaAutorizacao,
  FRASES_DE_RECUSA,
} from './autorizacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_DO_SERVIDOR = Deno.env.get('CHAVE_DO_SERVIDOR') ?? ''
/**
 * O identificador do aplicativo de conexão. Vazio de propósito: é o que mantém
 * a função desligada (veja o cabeçalho).
 */
const APP_DE_CONEXAO = Deno.env.get('TWILIO_CONNECT_APP_SID') ?? ''
/** Para onde devolver o navegador depois de gravar. */
const ENDERECO_DA_INTERFACE = Deno.env.get('ENDERECO_DA_INTERFACE') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CABECALHOS })
}

/**
 * O retorno termina em página, não em JSON: quem está olhando é uma pessoa que
 * acabou de clicar em "autorizar" no provedor. Sem endereço de interface
 * configurado, a frase aparece sozinha em vez de virar um redirect quebrado.
 */
function paraAInterface(estado: 'conectado' | 'falha', detalhe?: string): Response {
  if (!ENDERECO_DA_INTERFACE) {
    return new Response(detalhe ?? 'Telefonia conectada.', {
      status: estado === 'conectado' ? 200 : 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const destino = new URL('/config/integracoes', ENDERECO_DA_INTERFACE)
  destino.searchParams.set('telefonia', estado)
  if (detalhe) destino.searchParams.set('detalhe', detalhe)
  return new Response(null, { status: 303, headers: { location: destino.toString() } })
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  const caminho = new URL(requisicao.url).pathname

  // ---- Retorno do provedor: sem sessão, conferido pelo estado assinado ----
  if (requisicao.method === 'GET' && caminho.endsWith('/retorno')) {
    const parametros = new URL(requisicao.url).searchParams
    const leitura = await lerRetornoDaAutorizacao(
      {
        estado: parametros.get('state'),
        // O provedor devolve o identificador da subconta neste nome.
        contaDoProvedor: parametros.get('AccountSid'),
      },
      CHAVE_DO_SERVIDOR,
    )

    if (!leitura.ok) {
      return paraAInterface('falha', FRASES_DE_RECUSA[leitura.motivo])
    }

    const { error } = await servico.rpc('registrar_conexao_de_telefonia', {
      p_account_id: leitura.contaId,
      p_provider_account_id: leitura.contaDoProvedor,
      p_authorized_by: leitura.usuarioId,
      // As duas que o produto exige: ler o que aconteceu e cobrar o uso. Sem a
      // segunda não se compra número nem se disca.
      p_scopes: ['read_all', 'charge_account'],
    })

    if (error) {
      return paraAInterface(
        'falha',
        'A autorização chegou, mas não foi possível registrá-la. Tente conectar de novo.',
      )
    }

    return paraAInterface('conectado')
  }

  // ---- Revogação vinda do provedor: ele avisa quando o cliente desconecta ----
  // Chega como POST sem sessão, com o identificador da subconta no corpo de
  // formulário. Não há `state` para conferir aqui — o provedor é quem inicia —,
  // então a conta é encontrada pelo identificador que só ele conhece, e a
  // revogação só afeta a linha que já estava viva com aquele identificador.
  if (requisicao.method === 'POST' && caminho.endsWith('/revogacao')) {
    let contaDoProvedor = ''
    try {
      const formulario = await requisicao.formData()
      contaDoProvedor = String(formulario.get('AccountSid') ?? '').trim()
    } catch {
      contaDoProvedor = ''
    }

    if (!contaDoProvedor) return json({ ok: false, motivo: 'conta_ausente' }, 400)

    const { data: conexao } = await servico
      .from('telephony_connections')
      .select('account_id')
      .eq('provider_account_id', contaDoProvedor)
      .is('revoked_at', null)
      .maybeSingle()

    // Sem conexão viva não há o que revogar, e responder 200 é de propósito: o
    // provedor não precisa reenviar um aviso que já não muda nada.
    if (!conexao) return json({ ok: true, motivo: 'nada_a_revogar' })

    const { error } = await servico.rpc('revogar_conexao_de_telefonia', {
      p_account_id: conexao.account_id,
      p_reason: 'revogada pelo cliente no provedor',
    })
    if (error) return json({ ok: false, motivo: 'falha_ao_revogar' }, 500)

    return json({ ok: true })
  }

  // ---- Início: com sessão, devolve para onde mandar o cliente ----
  if (requisicao.method !== 'POST') {
    return json({ ok: false, motivo: 'metodo_nao_suportado' }, 405)
  }

  if (!APP_DE_CONEXAO) {
    return json(
      {
        ok: false,
        motivo: 'conexao_indisponivel',
        mensagem:
          'Esta instalação não conecta a telefonia por autorização. Cadastre o Account SID e o Auth Token da sua Twilio na etapa de telefonia.',
      },
      503,
    )
  }

  const autorizacao = requisicao.headers.get('authorization') ?? ''
  const jwt = autorizacao.toLowerCase().startsWith('bearer ')
    ? autorizacao.slice(7).trim()
    : ''
  if (!jwt) return json({ ok: false, motivo: 'sem_sessao' }, 401)

  const { data: sessao, error: erroDaSessao } = await servico.auth.getUser(jwt)
  if (erroDaSessao || !sessao.user) {
    return json({ ok: false, motivo: 'sessao_invalida' }, 401)
  }

  let corpo: { contaId?: string }
  try {
    corpo = await requisicao.json()
  } catch {
    corpo = {}
  }
  const contaId = (corpo.contaId ?? '').trim()
  if (!contaId) return json({ ok: false, motivo: 'conta_ausente' }, 400)

  // Conectar a telefonia da conta é de administrador, a mesma régua da
  // revogação. Quem confere é o banco, não esta função.
  const { data: podeAdministrar, error: erroDoPapel } = await servico.rpc('has_role', {
    p_account_id: contaId,
    p_role: 'admin',
  })
  if (erroDoPapel || podeAdministrar !== true) {
    return json({ ok: false, motivo: 'sem_permissao' }, 403)
  }

  const estado = await emitirEstado(
    { contaId, usuarioId: sessao.user.id },
    CHAVE_DO_SERVIDOR,
  )

  const enderecoDeAutorizacao = new URL(
    `https://www.twilio.com/authorize/${APP_DE_CONEXAO}`,
  )
  enderecoDeAutorizacao.searchParams.set('state', estado)

  return json({ ok: true, endereco: enderecoDeAutorizacao.toString() })
})
