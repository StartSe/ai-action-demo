// Adaptador Deno da rotina cron-meeting-invite. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase e o adaptador do Resend e entrega a decisão
// para `reenvio.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI. A execução real com pg_cron e pg_net e o
// envio de verdade também são do CI e do ambiente: o envio exige rede, a chave
// do Resend e o domínio de envio com DNS verificado (O-03), e a sonda é
// `scripts/sonda-do-convite.ts`.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, sem `Authorization` — só com o segredo interno lido do
// Vault. A credencial é esse cabeçalho, conferido em `atenderRotina` antes de
// qualquer porta.
//
// **A chave do Resend** desce a cascata de `_shared/secrets.ts` (provedor
// `email`, chaves `api_key` e `remetente`), as duas da conta, cadastradas em
// /config/integracoes. O valor vai para o adaptador e para mais nada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  SELECAO_DA_REUNIAO_PARA_CONVITE,
  atualizacaoDaPendencia,
  atualizacaoDoEnvio,
  colunasDoConvite,
  lerReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import { abrirEmailDaConta } from '../_shared/email/email-resend.ts'
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

import { atenderRotina, type PortaDoReenvio } from './reenvio.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

/** `Sarah <agenda@dominio-verificado>`. Ausente, o convite fica pendente como não configurado. */

/** O envio não tem ninguém esperando: 10 s por ida antes de desistir. */
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

const porta: PortaDoReenvio = {
  async reivindicarReunioes(limite, instante, teto) {
    const { data, error } = await servico.rpc('reivindicar_convites_para_enviar', {
      p_limite: limite,
      p_instante: instante,
      p_teto: teto,
    })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown[]).map((linha) =>
      typeof linha === 'string' ? linha : String((linha as Record<string, unknown>).reivindicar_convites_para_enviar),
    )
  },

  async reuniaoParaConvite(reuniaoId) {
    const { data, error } = await servico
      .from('meetings')
      .select(SELECAO_DA_REUNIAO_PARA_CONVITE)
      .eq('id', reuniaoId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data === null ? null : lerReuniaoParaConvite(data as unknown as Record<string, unknown>)
  },

  emailParaConvite(contaId) {
    return abrirEmailDaConta(cofre, contaId, { buscar: fetch, prazoMs: PRAZO_DO_PROVEDOR_MS })
  },

  async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
    const { error } = await servico
      .from('meetings')
      .update(atualizacaoDoEnvio(lado, enviadoEm))
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is(colunasDoConvite(lado).enviadoEm, null)
    if (error) throw new Error(error.message)
  },

  async registrarPendenciaDoConvite(contaId, reuniaoId, lado, pendencia) {
    const { error } = await servico
      .from('meetings')
      .update(atualizacaoDaPendencia(lado, pendencia))
      .eq('account_id', contaId)
      .eq('id', reuniaoId)
      .is(colunasDoConvite(lado).enviadoEm, null)
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
