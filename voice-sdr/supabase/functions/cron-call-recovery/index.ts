// Adaptador Deno da rotina cron-call-recovery. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase, o provedor de voz, a telefonia e as funções
// `call-finalize` e `call-classify`, e entrega a decisão para `recuperacao.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, sem `Authorization` — só com o segredo interno lido do
// Vault. A credencial é esse cabeçalho, conferido em `atenderRotina` antes de
// qualquer porta.
//
// **Por que `call-finalize` e `call-classify` por HTTP.** A finalização é uma
// só (T-15), e é a função inteira, com a reivindicação dela; importar
// `finalizarChamada` daqui criaria uma segunda finalizadora com outro ambiente.
// O pedido leva a chave de serviço (o gateway das duas confere JWT) e o segredo
// interno.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { caminhoDaConversa } from '../call-finalize/formato-do-provedor.ts'
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

import {
  atenderRotina,
  type ChamadaEmRecuperacao,
  type ContaDoDisjuntor,
  type EstadoDaConversa,
  type PortaDaRecuperacao,
  lerEstadoDaConversa,
} from './recuperacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

const ENDERECO_DO_PROVEDOR_DE_VOZ = 'https://api.elevenlabs.io/v1'
const ENDERECO_DA_TELEFONIA = 'https://api.twilio.com/2010-04-01'

/** Os provedores e as chaves no cofre, os mesmos de `call-finalize` e `call-cancel`. */
const PROVEDOR_DE_VOZ = 'voz'
const PROVEDOR_DE_TELEFONIA = 'telefonia'

/** A consulta e o encerramento não têm ninguém esperando: 10 s antes de desistir. */
const LIMITE_DO_PROVEDOR_MS = 10_000

/** Acima do limite do provedor em `call-finalize` (20 s), para a resposta dela chegar. */
const LIMITE_DAS_FUNCOES_MS = 30_000

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

/** O rastro de cada chamada externa: é dele que o disjuntor conta as falhas. */
async function rastrear(evento: {
  account_id: string
  provider: string
  endpoint: string
  request: Record<string, unknown>
  response: Record<string, unknown>
  status_code: number | null
  latency_ms: number
  correlation_id: string
}) {
  const { error } = await servico.from('integration_events').insert({ direction: 'outbound', ...evento })
  if (error) console.warn(JSON.stringify({ funcao: 'cron-call-recovery', passo: 'rastro', erro: error.message }))
}

async function acionarFuncao(nome: string, chamadaId: string) {
  const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${CHAVE_DE_SERVICO}`,
      [CABECALHO_DA_ROTINA]: await segredoInterno(),
    },
    body: JSON.stringify({ call_id: chamadaId }),
    signal: AbortSignal.timeout(LIMITE_DAS_FUNCOES_MS),
  })
  await resposta.body?.cancel()
  return { status: resposta.status }
}

const porta: PortaDaRecuperacao = {
  async reivindicarChamadas(limite, instante) {
    const { data, error } = await servico.rpc('reivindicar_recuperacao', { p_limite: limite, p_instante: instante })
    if (error) throw new Error(error.message)
    return (data ?? []) as ChamadaEmRecuperacao[]
  },

  async contasParaODisjuntor(instante) {
    const { data, error } = await servico.rpc('contas_para_o_disjuntor', { p_instante: instante })
    if (error) throw new Error(error.message)
    return (data ?? []) as ContaDoDisjuntor[]
  },

  async estadoDaConversa(contaId, conversaId) {
    const resolucao = await cofre.resolveSecret(contaId, PROVEDOR_DE_VOZ, 'api_key')
    if (!resolucao.ok) return 'sem_resposta'

    const endpoint = caminhoDaConversa(conversaId)
    const inicio = Date.now()
    let status: number | null = null
    let estado: EstadoDaConversa = 'sem_resposta'
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
        headers: { 'xi-api-key': resolucao.valor },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      status = resposta.status
      if (resposta.ok) {
        estado = lerEstadoDaConversa(await resposta.json())
      } else {
        await resposta.body?.cancel()
      }
    } catch {
      status = null
    }

    await rastrear({
      account_id: contaId,
      provider: PROVEDOR_DE_VOZ,
      endpoint,
      request: { conversation_id: conversaId },
      response: { estado },
      status_code: status,
      latency_ms: Date.now() - inicio,
      correlation_id: conversaId,
    })
    return estado
  },

  finalizar(chamadaId) {
    return acionarFuncao('call-finalize', chamadaId)
  },

  classificar(chamadaId) {
    return acionarFuncao('call-classify', chamadaId)
  },

  async marcarDuracaoMaxima(chamadaId) {
    const { error } = await servico
      .from('calls')
      .update({ end_reason: 'max_duration' })
      .eq('id', chamadaId)
      .is('end_reason', null)
      .is('finalized_at', null)
    if (error) throw new Error(error.message)
  },

  async encerrarNaTelefonia(contaId, sid) {
    const [identificador, token] = await Promise.all([
      cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, 'account_sid'),
      cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, 'auth_token'),
    ])
    if (!identificador.ok || !token.ok) return false

    const endpoint = `Calls/${sid}.json`
    const inicio = Date.now()
    let status: number | null = null
    try {
      const resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/Accounts/${identificador.valor}/${endpoint}`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${identificador.valor}:${token.valor}`)}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Status: 'completed' }),
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      status = resposta.status
      await resposta.body?.cancel()
    } catch {
      status = null
    }

    // Sem o identificador da conta: o caminho vai para `integration_events`.
    await rastrear({
      account_id: contaId,
      provider: PROVEDOR_DE_TELEFONIA,
      endpoint,
      request: { status: 'completed', motivo: 'max_duration' },
      response: {},
      status_code: status,
      latency_ms: Date.now() - inicio,
      correlation_id: sid,
    })
    return status !== null && status >= 200 && status < 300
  },

  async fecharComoPerdida(chamadaId, fim) {
    const { de, ...colunas } = fim
    let consulta = servico
      .from('calls')
      .update(colunas)
      .eq('id', chamadaId)
      .in('status', [...de])
      .is('finalized_at', null)
    // A órfã é a que nunca chegou ao provedor: se o identificador apareceu
    // entre a leitura e aqui, ela não é mais órfã.
    if (fim.end_reason === 'dial_lost') consulta = consulta.is('provider_call_sid', null)
    const { data, error } = await consulta.select('id')
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  },

  async reprogramar(chamadaId, instante) {
    const { data, error } = await servico.rpc('reprogramar_chamada_perdida', {
      p_call_id: chamadaId,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    return typeof data === 'string' ? data : 'sem_resposta'
  },

  async anotar(chamadaId, nota) {
    const { error } = await servico.from('calls').update(nota).eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },

  async acionarDisjuntor(contaId, freio) {
    const { data, error } = await servico
      .from('accounts')
      .update(freio)
      .eq('id', contaId)
      .is('dialing_paused_at', null)
      .select('id')
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  },

  async registrarDisjuntor(linha) {
    const { error } = await servico.from('job_runs').insert(linha)
    if (error) throw new Error(error.message)
  },
}

Deno.serve(async (requisicao: Request) => {
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
