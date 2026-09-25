// Adaptador Deno da rotina cron-cost-sync. Só amarração: lê o ambiente, monta
// as portas sobre o Supabase e a telefonia e entrega a decisão para
// `custos.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI. A consulta real de preço e a prova de P-07
// (encerrar uma chamada por duração máxima e conferir o preço 30 min depois)
// também são do CI.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, sem `Authorization` — só com o segredo interno lido do
// Vault. A credencial é esse cabeçalho, conferido em `atenderRotina` antes de
// qualquer porta.

import { createClient } from 'npm:@supabase/supabase-js@2'

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
  PROVEDOR_DE_TELEFONIA,
  type ChamadaSemPreco,
  type PortaDosCustos,
} from './custos.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

const ENDERECO_DA_TELEFONIA = 'https://api.twilio.com/2010-04-01'

/** A consulta não tem ninguém esperando: 10 s antes de desistir. */
const LIMITE_DO_PROVEDOR_MS = 10_000

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

const porta: PortaDosCustos = {
  async reivindicarChamadas(limite, instante) {
    const { data, error } = await servico.rpc('reivindicar_precos_tardios', {
      p_limite: limite,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as ChamadaSemPreco[]
  },

  async consultarTelefonia(contaId, sid) {
    const [identificador, token] = await Promise.all([
      cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, 'account_sid'),
      cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, 'auth_token'),
    ])
    if (!identificador.ok || !token.ok) return null

    const inicio = Date.now()
    try {
      const resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/Accounts/${identificador.valor}/Calls/${sid}.json`, {
        headers: { authorization: `Basic ${btoa(`${identificador.valor}:${token.valor}`)}` },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      let corpo: unknown = null
      if (resposta.ok) {
        corpo = await resposta.json()
      } else {
        await resposta.body?.cancel()
      }
      return { status_code: resposta.status, corpo, latency_ms: Date.now() - inicio }
    } catch {
      return { status_code: null, corpo: null, latency_ms: Date.now() - inicio }
    }
  },

  async rastrear(rastro) {
    const { error } = await servico.from('integration_events').insert(rastro)
    if (error) console.warn(JSON.stringify({ funcao: 'cron-cost-sync', passo: 'rastro', erro: error.message }))
  },

  async gravarPreco(parcela) {
    const { error } = await servico.rpc('gravar_preco_tardio', {
      p_call_id: parcela.call_id,
      p_component: parcela.component,
      p_amount_cents: parcela.amount_cents,
      p_currency: parcela.currency,
      p_source: parcela.source,
    })
    if (error) throw new Error(error.message)
  },

  async anotar(chamadaId, nota) {
    const { error } = await servico.from('calls').update(nota).eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },

  async registrarDesistencia(linha) {
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
