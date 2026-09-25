// Adaptador Deno da rotina cron-credit-watch. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase e sobre as sondas de integrations-status e
// entrega a decisão para `credito.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI. A consulta real de crédito e de cota nos
// provedores também é do CI.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, sem `Authorization` — só com o segredo interno lido do
// Vault. A credencial é esse cabeçalho, conferido em `atenderRotina` antes de
// qualquer porta.
//
// **A sondagem é a da tela.** `sondarProvedor` vem de
// `integrations-status/sondas.ts`, e a credencial desce a mesma cascata de
// `_shared/secrets.ts`: o aviso lê o saldo que o cartão mostra.

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
import type { PortaDeSondagem } from '../integrations-status/estado.ts'
import { sondarProvedor } from '../integrations-status/sondas.ts'

import { atenderRotina, type AvisoAberto, type ContaVigiada, type PortaDoVigia } from './credito.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

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

const sondagem: PortaDeSondagem = {
  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },
  sondar(provedor, credenciais) {
    return sondarProvedor(provedor, credenciais)
  },
}

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

// Sem `abrirExcecao`: a fila de exceções é F4 (L-24), e o aviso já fica em
// `provider_alerts`.
const porta: PortaDoVigia = {
  async reivindicarContas(limite, instante) {
    const { data, error } = await servico.rpc('reivindicar_vigia_de_credito', {
      p_limite: limite,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as ContaVigiada[]
  },

  async avisosAbertos(contaId) {
    const { data, error } = await servico
      .from('provider_alerts')
      .select('provider, kind')
      .eq('account_id', contaId)
      .is('rearmed_at', null)
    if (error) throw new Error(error.message)
    return (data ?? []) as AvisoAberto[]
  },

  async abrirAviso(aviso, instante) {
    const { data, error } = await servico.rpc('abrir_aviso_de_provedor', {
      p_account_id: aviso.account_id,
      p_provider: aviso.provider,
      p_kind: aviso.kind,
      p_message: aviso.message,
      p_observed: aviso.observed,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    return data === true
  },

  async rearmarAviso(contaId, provedor, tipo, instante) {
    const { data, error } = await servico.rpc('rearmar_aviso_de_provedor', {
      p_account_id: contaId,
      p_provider: provedor,
      p_kind: tipo,
      p_instante: instante,
    })
    if (error) throw new Error(error.message)
    return data === true
  },
}

Deno.serve(async (requisicao: Request) => {
  const resposta = await atenderRotina(
    { metodo: requisicao.method, segredo: requisicao.headers.get(CABECALHO_DA_ROTINA) },
    { porta, sondagem, execucao },
    { segredoInterno: await segredoInterno() },
  )
  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
})
