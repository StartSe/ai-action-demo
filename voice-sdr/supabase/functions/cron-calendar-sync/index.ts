// Adaptador Deno da rotina cron-calendar-sync. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase e o adaptador do Google e entrega a decisão
// para `sincronizacao.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI. A execução real com pg_cron e pg_net e a
// leitura contra o Google também são do CI, e a segunda só com aplicativo
// OAuth verificado (P-04): a sonda é `scripts/sonda-do-calendario.ts`.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, sem `Authorization` — só com o segredo interno lido do
// Vault. A credencial é esse cabeçalho, conferido em `atenderRotina` antes de
// qualquer porta.
//
// **O calendário por endereço iCal** (`provider = 'ical'`) não usa OAuth nem a
// cascata: o endereço secreto é o segredo do recurso, lido do Vault pelo mesmo
// `token_do_calendario`, e vai só para o adaptador. É o caminho padrão do
// produto; o do Google fica como avançado, desligado sem as variáveis do
// aplicativo OAuth.
//
// **O token de renovação** desce a cascata de `_shared/secrets.ts` com a linha
// de `specialist_calendars` como recurso: `segredoDoRecurso` o lê do Vault por
// `token_do_calendario`, que só `service_role` executa. O valor vai para o
// adaptador e para mais nada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { falhaDoCalendario, RECURSO_DO_CALENDARIO, resolverTokenDoCalendario } from '../_shared/agenda/calendario.ts'
import { criarCalendarioDoGoogle } from '../_shared/agenda/calendario-google.ts'
import { PROVEDOR_ICAL, criarCalendarioIcal } from '../_shared/agenda/calendario-ical.ts'
import { SELECAO_DA_REUNIAO_PARA_EVENTO, lerReuniaoParaEvento } from '../_shared/agenda/evento-da-reuniao.ts'
import type { LinhaDeFim, LinhaDeInicio, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'
import { CABECALHO_DA_ROTINA } from '../_shared/rotinas/portao.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'

import { atenderRotina, type CalendarioParaSincronizar, type PortaDaSincronizacao } from './sincronizacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

/** Par do aplicativo OAuth do Google, da instalação. */
const CLIENTE_ID = Deno.env.get('SARAH_GOOGLE_CLIENT_ID') ?? ''
const CLIENTE_SEGREDO = Deno.env.get('SARAH_GOOGLE_CLIENT_SECRET') ?? ''

/** A leitura não tem ninguém esperando: 10 s por ida antes de desistir. */
const PRAZO_DO_PROVEDOR_MS = 10_000

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
  async segredoDoRecurso(recurso) {
    if (recurso.tipo !== RECURSO_DO_CALENDARIO) return null
    const calendario = calendariosDaPassagem.get(recurso.id)
    if (!calendario) return null
    const { data, error } = await servico.rpc('token_do_calendario', {
      p_account_id: calendario.account_id,
      p_calendar_id: calendario.id,
    })
    if (error) throw new Error(error.message)
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

/** Os calendários reivindicados, para `segredoDoRecurso` achar a conta do id. */
const calendariosDaPassagem = new Map<string, CalendarioParaSincronizar>()

const execucao: PortaDeExecucao = {
  async inserirExecucao(linha: LinhaDeInicio) {
    const { data, error } = await servico.from('job_runs').insert(linha).select('id').single()
    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  },

  async concluirExecucao(id: string, linha: LinhaDeFim) {
    const { error } = await servico.from('job_runs').update(linha).eq('id', id)
    if (error) throw new Error(error.message)
  },

  async itensDasUltimasExecucoes(rotina, quantas, antesDe) {
    const { data, error } = await servico
      .from('job_runs')
      .select('items')
      .eq('routine', rotina)
      .is('account_id', null)
      .is('error', null)
      .not('finished_at', 'is', null)
      .lt('started_at', antesDe)
      .order('started_at', { ascending: false })
      .limit(quantas)
    if (error) throw new Error(error.message)
    return ((data ?? []) as { items: number | null }[]).map((linha) => linha.items ?? 0)
  },
}

const porta: PortaDaSincronizacao = {
  async reivindicarCalendarios(limite, instante) {
    const { data, error } = await servico.rpc('reivindicar_calendarios_para_sincronizar', {
      p_limite: limite,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    const calendarios = (data ?? []) as CalendarioParaSincronizar[]
    for (const calendario of calendarios) calendariosDaPassagem.set(calendario.id, calendario)
    return calendarios
  },

  async abrirCalendario(calendario) {
    if (calendario.provider === PROVEDOR_ICAL) {
      const { data, error } = await servico.rpc('token_do_calendario', {
        p_account_id: calendario.account_id,
        p_calendar_id: calendario.id,
      })
      if (error) throw new Error(error.message)
      if (typeof data !== 'string' || data.trim() === '') return falhaDoCalendario('nao_conectado')
      return criarCalendarioIcal({ buscar: fetch, endereco: data, fuso: calendario.timezone, prazoMs: PRAZO_DO_PROVEDOR_MS })
    }
    // Provedor novo é adaptador novo; até lá, o calendário de outro provedor
    // fica com a frase de falha, e os do Google seguem.
    if (calendario.provider !== 'google') return falhaDoCalendario('falha_do_calendario')
    if (!CLIENTE_ID || !CLIENTE_SEGREDO) return falhaDoCalendario('sem_permissao_de_calendario')

    const token = await resolverTokenDoCalendario(cofre, { id: calendario.id, contaId: calendario.account_id })
    if (!token.ok) return token

    return criarCalendarioDoGoogle({
      buscar: fetch,
      clienteId: CLIENTE_ID,
      clienteSegredo: CLIENTE_SEGREDO,
      tokenDeAtualizacao: token.token,
      agendaId: calendario.external_id,
      fuso: calendario.timezone,
      prazoMs: PRAZO_DO_PROVEDOR_MS,
    })
  },

  async gravarOcupacao(ocupacao) {
    const { error } = await servico.rpc('gravar_ocupacao_do_calendario', {
      p_calendar_id: ocupacao.calendarioId,
      p_blocos: ocupacao.blocos,
      p_instante: ocupacao.instante,
    })
    if (error) throw new Error(error.message)
  },

  async registrarFalha(calendarioId, mensagem) {
    const { error } = await servico.rpc('registrar_falha_de_sincronizacao', {
      p_calendar_id: calendarioId,
      p_mensagem: mensagem,
    })
    if (error) throw new Error(error.message)
  },

  async reunioesSemEvento(calendario, { instante, teto, limite }) {
    const { data, error } = await servico
      .from('meetings')
      .select(SELECAO_DA_REUNIAO_PARA_EVENTO)
      .eq('account_id', calendario.account_id)
      .eq('specialist_id', calendario.specialist_id)
      .is('external_event_id', null)
      .in('status', ['scheduled', 'confirmed'])
      .gt('starts_at', instante)
      .lt('event_attempts', teto)
      .or(`event_retry_at.is.null,event_retry_at.lte."${instante}"`)
      .order('starts_at', { ascending: true })
      .limit(limite)
    if (error) throw new Error(error.message)
    return ((data ?? []) as Record<string, unknown>[]).map(lerReuniaoParaEvento)
  },

  async reunioesCanceladasComEvento(calendario, { limite }) {
    const { data, error } = await servico
      .from('meetings')
      .select('id, account_id, external_event_id')
      .eq('account_id', calendario.account_id)
      .eq('specialist_id', calendario.specialist_id)
      .eq('status', 'canceled')
      .not('external_event_id', 'is', null)
      .limit(limite)
    if (error) throw new Error(error.message)
    return ((data ?? []) as Record<string, unknown>[]).map((linha) => ({
      id: String(linha.id),
      account_id: String(linha.account_id),
      external_event_id: String(linha.external_event_id),
    }))
  },

  async gravarEvento(contaId, reuniaoId, externalEventId) {
    const { error } = await servico
      .from('meetings')
      .update({ external_event_id: externalEventId, event_error: null, event_retry_at: null })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is('external_event_id', null)
    if (error) throw new Error(error.message)
  },

  async registrarFalhaDoEvento(contaId, reuniaoId, falha) {
    const { error } = await servico
      .from('meetings')
      .update({ event_attempts: falha.tentativas, event_error: falha.erro, event_retry_at: falha.proximaTentativa })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is('external_event_id', null)
    if (error) throw new Error(error.message)
  },

  async esquecerEvento(contaId, reuniaoId) {
    const { error } = await servico
      .from('meetings')
      .update({ external_event_id: null })
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
    if (error) throw new Error(error.message)
  },

  registrarNoLog(evento) {
    console.warn(JSON.stringify(evento))
  },
}

Deno.serve(async (requisicao: Request) => {
  calendariosDaPassagem.clear()
  const resposta = await atenderRotina(
    { metodo: requisicao.method, segredo: requisicao.headers.get(CABECALHO_DA_ROTINA) },
    { porta, execucao },
    { segredoInterno: await segredoInterno() },
  )
  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
})
