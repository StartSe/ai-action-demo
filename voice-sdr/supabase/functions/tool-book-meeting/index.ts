// Adaptador Deno da função tool-book-meeting. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase com a chave de serviço, abre o calendário do
// especialista sobre o adaptador do Google e entrega a decisão para
// `agendamento.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. O esqueleto confere o segredo antes de qualquer leitura
// por conversa.
//
// **A checagem ao vivo tem prazo curto** (`PRAZO_DO_CALENDARIO_MS`): ela divide
// os 4 s do orçamento com a leitura da oferta e com o RPC, e calendário que
// estoura o prazo volta como `sem_resposta`, que não impede a marcação.
//
// **O evento da reunião** (RF-508) usa o mesmo calendário com prazo próprio
// (`PRAZO_DO_EVENTO_MS`): ele roda depois do insert, dentro do orçamento, e o
// que estourar fica para `cron-calendar-sync` tentar de novo.
//
// **O convite por e-mail** (RF-509) sai junto com o evento, com prazo próprio
// por envio (`PRAZO_DO_CONVITE_MS`); o que estourar fica para
// `cron-meeting-invite`. A chave do Resend desce a cascata do cofre (provedor
// `email`, chaves `api_key` e `remetente`), as duas da conta, com o remetente
// num domínio que a conta verificou no provedor (O-03).
//
// **O token de renovação** desce a cascata de `_shared/secrets.ts` com a linha
// de `specialist_calendars` como recurso, e `segredoDoRecurso` o lê por
// `token_do_calendario`, que só `service_role` executa. A conta do calendário
// vem do mapa preenchido na leitura da linha.
//
// **PARA O CI:** o `deno check` deste arquivo, a suíte de contrato
// (`scripts/contrato-das-ferramentas.ts`) contra a função implantada e a
// checagem ao vivo contra o Google, que exige aplicativo OAuth verificado (P-04),
// e o envio de verdade do convite, que exige domínio verificado no Resend (O-03).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import {
  RECURSO_DO_CALENDARIO,
  falhaDoCalendario,
  protegerPorta,
  resolverTokenDoCalendario,
  type FalhaDoCalendario,
  type PortaDeCalendario,
} from '../_shared/agenda/calendario.ts'
import {
  SELECAO_DA_REUNIAO_PARA_CONVITE,
  atualizacaoDaPendencia,
  atualizacaoDoEnvio,
  colunasDoConvite,
  lerReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import { SELECAO_DA_REUNIAO_PARA_EVENTO, lerReuniaoParaEvento } from '../_shared/agenda/evento-da-reuniao.ts'
import { abrirEmailDaConta } from '../_shared/email/email-resend.ts'
import { criarCalendarioDoGoogle } from '../_shared/agenda/calendario-google.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { CABECALHO_DA_CONVERSA, type AmbienteDaFerramenta } from '../_shared/tools/esqueleto.ts'
import { criarPortaDeFerramentas, type ClienteDasFerramentas } from '../_shared/tools/porta-do-supabase.ts'

import {
  criarToolBookMeeting,
  type EscritaDoAgendamento,
  type PortaDeAgendamento,
  type ResultadoDoRpc,
} from './agendamento.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
/**
 * A variável, quando alguém a definiu; senão derivada da chave de serviço
 * (`_shared/segredo-da-instalacao.ts`). `agent-publish` precisa resolver pelo
 * mesmo caminho para os dois lados concordarem.
 */
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
/** ISO 8601 com fuso. Vira milissegundos, que é o que `segredo.ts` lê. */
const ROTACIONADA_EM = (() => {
  const bruto = Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM') ?? ''
  const instante = Date.parse(bruto)
  return Number.isFinite(instante) ? instante : null
})()
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** Par do aplicativo OAuth do Google, da instalação. */
const CLIENTE_ID = Deno.env.get('SARAH_GOOGLE_CLIENT_ID') ?? ''
const CLIENTE_SEGREDO = Deno.env.get('SARAH_GOOGLE_CLIENT_SECRET') ?? ''

/** A checagem ao vivo divide o orçamento da ferramenta com o resto. */
const PRAZO_DO_CALENDARIO_MS = 1_500

/** A criação do evento também: o que passar disso é da rotina. */
const PRAZO_DO_EVENTO_MS = 1_500

/** Cada envio do convite, que corre junto com o evento. */
const PRAZO_DO_CONVITE_MS = 1_500

/** `Sarah <agenda@dominio-verificado>`. Ausente, o convite fica pendente como não configurado. */

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta = criarPortaDeFerramentas(servico as unknown as ClienteDasFerramentas)

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Os calendários lidos neste isolado, para `segredoDoRecurso` achar a conta do id. */
const contaDoCalendario = new Map<string, string>()

const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject())

const portaDeCredenciais: PortaDeCredenciais = {
  async segredoDaConta(contaId, provedor, chave) {
    const { data, error } = await servico.rpc('get_account_secret', {
      p_account_id: contaId,
      p_provider: provedor,
      p_key_name: chave,
    })
    falhou(error)
    return typeof data === 'string' ? data : null
  },
  async segredoDoRecurso(recurso) {
    if (recurso.tipo !== RECURSO_DO_CALENDARIO) return null
    const contaId = contaDoCalendario.get(recurso.id)
    if (!contaId) return null
    const { data, error } = await servico.rpc('token_do_calendario', {
      p_account_id: contaId,
      p_calendar_id: recurso.id,
    })
    falhou(error)
    return typeof data === 'string' ? data : null
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

interface LinhaDeOferta {
  position: number
  specialist_id: string
  starts_at: string
  ends_at: string
  expires_at: string
  specialists: { timezone: string } | null
}

const leitura: PortaDeAgendamento = {
  async ofertaDaChamada(contaId, chamadaId, posicao) {
    const { data, error } = await servico
      .from('call_slot_offers')
      .select('position, specialist_id, starts_at, ends_at, expires_at, specialists(timezone)')
      .eq('account_id', contaId)
      .eq('call_id', chamadaId)
      .eq('position', posicao)
      .maybeSingle()
    falhou(error)
    const linha = data as unknown as LinhaDeOferta | null
    if (linha === null || linha.specialists === null) return null
    return {
      position: linha.position,
      specialist_id: linha.specialist_id,
      starts_at: linha.starts_at,
      ends_at: linha.ends_at,
      expires_at: linha.expires_at,
      fusoDoEspecialista: linha.specialists.timezone,
    }
  },

  async fusoDoLead(contaId, leadId) {
    const [lead, conta] = await Promise.all([
      servico.from('leads').select('timezone').eq('account_id', contaId).eq('id', leadId).maybeSingle(),
      servico.from('accounts').select('timezone').eq('id', contaId).single(),
    ])
    falhou(lead.error)
    falhou(conta.error)
    const doLead = (lead.data as { timezone: string | null } | null)?.timezone?.trim()
    return doLead || (conta.data as { timezone: string }).timezone
  },

  async calendarioDoEspecialista(contaId, especialistaId) {
    const aberto = await abrirCalendario(contaId, especialistaId, PRAZO_DO_CALENDARIO_MS)
    // Na checagem ao vivo, calendário que não abre é o mesmo que não ter o que conferir.
    return aberto === null || 'ok' in aberto ? null : aberto
  },
}

/**
 * O calendário do Google do especialista, aberto com o prazo dado. Nulo sem
 * calendário conectado; a falha quando há calendário e ele não abre (par do
 * aplicativo ausente, token fora do Vault), que o evento registra.
 */
async function abrirCalendario(
  contaId: string,
  especialistaId: string,
  prazoMs: number,
): Promise<PortaDeCalendario | FalhaDoCalendario | null> {
  const { data, error } = await servico
    .from('specialist_calendars')
    .select('id, provider, external_id, specialists(timezone)')
    .eq('account_id', contaId)
    .eq('specialist_id', especialistaId)
    .eq('provider', 'google')
    .maybeSingle()
  falhou(error)
  const linha = data as unknown as {
    id: string
    external_id: string
    specialists: { timezone: string } | null
  } | null
  if (linha === null) return null
  if (!CLIENTE_ID || !CLIENTE_SEGREDO) return falhaDoCalendario('sem_permissao_de_calendario')
  contaDoCalendario.set(linha.id, contaId)
  const token = await resolverTokenDoCalendario(cofre, { id: linha.id, contaId })
  if (!token.ok) return token
  return protegerPorta(
    criarCalendarioDoGoogle({
      buscar: fetch,
      clienteId: CLIENTE_ID,
      clienteSegredo: CLIENTE_SEGREDO,
      tokenDeAtualizacao: token.token,
      agendaId: linha.external_id,
      fuso: linha.specialists?.timezone ?? 'America/Sao_Paulo',
      prazoMs,
    }),
  )
}

const escrita: EscritaDoAgendamento = {
  async agendarReuniao(pedido) {
    const { data, error } = await servico.rpc('agendar_reuniao', { ...pedido })
    falhou(error)
    const [linha] = (data ?? []) as ResultadoDoRpc[]
    if (!linha) throw new Error('agendar_reuniao não devolveu linha')
    return linha
  },

  async consumirOfertas(contaId, chamadaId) {
    const { error } = await servico.from('call_slot_offers').delete().eq('account_id', contaId).eq('call_id', chamadaId)
    falhou(error)
  },

  async preencherEmailDoLead(contaId, leadId, email) {
    const { error } = await servico
      .from('leads')
      .update({ email })
      .eq('account_id', contaId)
      .eq('id', leadId)
      .is('email', null)
    falhou(error)
  },

  async reuniaoParaEvento(contaId, reuniaoId) {
    const { data, error } = await servico
      .from('meetings')
      .select(SELECAO_DA_REUNIAO_PARA_EVENTO)
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .maybeSingle()
    falhou(error)
    return data === null ? null : lerReuniaoParaEvento(data as Record<string, unknown>)
  },

  async reuniaoParaConvite(contaId, reuniaoId) {
    const { data, error } = await servico
      .from('meetings')
      .select(SELECAO_DA_REUNIAO_PARA_CONVITE)
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .maybeSingle()
    falhou(error)
    return data === null ? null : lerReuniaoParaConvite(data as unknown as Record<string, unknown>)
  },

  emailParaConvite(contaId) {
    return abrirEmailDaConta(cofre, contaId, { buscar: fetch, prazoMs: PRAZO_DO_CONVITE_MS })
  },

  async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
    const { error } = await servico
      .from('meetings')
      .update(atualizacaoDoEnvio(lado, enviadoEm))
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is(colunasDoConvite(lado).enviadoEm, null)
    falhou(error)
  },

  async registrarPendenciaDoConvite(contaId, reuniaoId, lado, pendencia) {
    const { error } = await servico
      .from('meetings')
      .update(atualizacaoDaPendencia(lado, pendencia))
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is(colunasDoConvite(lado).enviadoEm, null)
    falhou(error)
  },

  calendarioParaEvento(contaId, especialistaId) {
    return abrirCalendario(contaId, especialistaId, PRAZO_DO_EVENTO_MS)
  },

  async gravarEvento(contaId, reuniaoId, externalEventId) {
    const { error } = await servico
      .from('meetings')
      .update({ external_event_id: externalEventId, event_error: null, event_retry_at: null })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is('external_event_id', null)
    falhou(error)
  },

  async registrarFalhaDoEvento(contaId, reuniaoId, falha) {
    const { error } = await servico
      .from('meetings')
      .update({ event_attempts: falha.tentativas, event_error: falha.erro, event_retry_at: falha.proximaTentativa })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is('external_event_id', null)
    falhou(error)
  },

  async esquecerEvento(contaId, reuniaoId) {
    const { error } = await servico
      .from('meetings')
      .update({ external_event_id: null })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
    falhou(error)
  },

  registrarNoLog(evento) {
    console.warn(JSON.stringify(evento))
  },
}

const tratar = criarToolBookMeeting(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDoAgendamento> = {
  porta,
  escrita,
  chaves: { vigente: CHAVE_DE_FERRAMENTAS, anterior: CHAVE_ANTERIOR, rotacionadaEm: ROTACIONADA_EM },
}

Deno.serve(async (requisicao) => {
  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    corpo = null
  }
  const resposta = await tratar(
    {
      metodo: requisicao.method,
      segredo: requisicao.headers.get('x-tool-secret'),
      conversa: requisicao.headers.get(CABECALHO_DA_CONVERSA),
      corpo,
    },
    ambiente,
  )
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
