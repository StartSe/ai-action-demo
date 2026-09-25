// Adaptador Deno da rotina cron-dial. Só amarração: lê o ambiente, monta as
// portas sobre o Supabase e sobre `call-place`, e entrega a decisão para
// `despacho.ts`.
//
// Fica fora do typecheck e do lint da raiz (Node): `Deno` e o import `npm:`
// não existem lá. Quem verifica este arquivo é o `deno check` de
// `npm run check:funcoes`, no CI.
//
// **Por que `verify_jwt = false`.** Quem chama é o pg_cron, por
// `disparar_rotina`, e o pedido chega sem `Authorization` — só com o segredo
// interno lido do Vault. A credencial é esse cabeçalho, conferido em
// `atenderRotina` antes de qualquer porta.
//
// **Por que `call-place` por HTTP, e não por import.** O caminho único de
// discagem é a função `call-place` inteira, com os dois portões de T-04; chamar
// `colocarChamada` daqui dentro criaria um segundo processo discando com a
// mesma lógica e outro ambiente. O pedido leva a chave de serviço (o gateway de
// `call-place` confere JWT) e o segredo interno (o portão das rotinas).
//
// **Pré-contato por WhatsApp.** Quando a conta liga `whatsapp_pre_contact`, a
// ligação que saiu ganha uma mensagem pela Z-API da conta
// (`_shared/whatsapp/pre-contato.ts`), com as portas de
// `whatsapp-inbound/portas-do-supabase.ts`. Falha dela vai para o log e nunca
// muda o item.

import { createClient } from 'npm:@supabase/supabase-js@2'

import type { LinhaDeFim, LinhaDeInicio, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'
import { CABECALHO_DA_ROTINA } from '../_shared/rotinas/portao.ts'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { LIMITE_DO_ENVIO_MS } from '../_shared/whatsapp/envio.ts'
import { enviarPreContato } from '../_shared/whatsapp/pre-contato.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'
import { criarPortaDoPreContato, type ClienteDoCanal } from '../whatsapp-inbound/portas-do-supabase.ts'

import { atenderRotina, type ItemDaFila, type PortaDoDespacho } from './despacho.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** O segredo interno de serviço (T-04). Ausente, a rotina não roda. */
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

/** Acima do limite do provedor em `call-place` (10 s), para a resposta dele chegar. */
const LIMITE_DE_CALL_PLACE_MS = 15_000

const COLUNAS_DO_ITEM = 'id, account_id, lead_id, purpose, source, source_ref, attempt, failures'

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
    const { data, error } = await servico.from('accounts').select('credentials_mode').eq('id', contaId).maybeSingle()
    if (error) return 'account'
    return (data as { credentials_mode?: string } | null)?.credentials_mode === 'platform' ? 'platform' : 'account'
  },
}
const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: lerAmbiente(Deno.env.get('SARAH_AMBIENTE')) })

const preContato = criarPortaDoPreContato({
  cliente: servico as unknown as ClienteDoCanal,
  async segredo(contaId, provedor, chave) {
    const resolucao = await cofre.resolveSecret(contaId, provedor, chave)
    return resolucao.ok ? resolucao.valor : null
  },
  buscar: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS) }),
  // O pré-contato não fala com modelo: a mensagem é a fala escrita.
  rodada: async () => ({ ok: false, codigo: 'sem_credencial' }),
})

const porta: PortaDoDespacho = {
  async preContato(item) {
    const desfecho = await enviarPreContato({ contaId: item.account_id, leadId: item.lead_id }, preContato)
    if (desfecho === 'envio_falhou' || desfecho === 'texto_invalido') {
      console.error('[cron-dial] pre_contato', { item: item.id, desfecho })
    }
  },

  async situacaoDaFila(instante) {
    const { data, error } = await servico.rpc('situacao_da_fila', { p_instante: instante })
    if (error) throw new Error(error.message)
    return (data ?? []) as {
      account_id: string
      dialing_paused_at: string | null
      max_concurrent: number
      ativas: number
    }[]
  },

  async reivindicarDaConta(contaId, limite, instante) {
    const { data, error } = await servico
      .rpc('reivindicar_da_fila', { p_account_id: contaId, p_limite: limite, p_instante: instante })
      .select(COLUNAS_DO_ITEM)
    if (error) throw new Error(error.message)
    return (data ?? []) as ItemDaFila[]
  },

  async discar(pedido) {
    const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-place`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${CHAVE_DE_SERVICO}`,
        [CABECALHO_DA_ROTINA]: await segredoInterno(),
      },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(LIMITE_DE_CALL_PLACE_MS),
    })
    let corpo: unknown = null
    try {
      corpo = await resposta.json()
    } catch {
      // Corpo ilegível vira desfecho transitório pelo status.
    }
    return { status: resposta.status, corpo }
  },

  // As três transições só valem para item ainda `claimed`: o freio de
  // emergência pode ter cancelado o item no meio, e o cancelamento vence.
  async concluirItem(id, fim) {
    const { error } = await servico
      .from('dial_queue')
      .update({ status: 'done', ...fim })
      .eq('id', id)
      .eq('status', 'claimed')
    if (error) throw new Error(error.message)
  },

  async falharItem(id, fim) {
    const { error } = await servico
      .from('dial_queue')
      .update({ status: 'failed', ...fim })
      .eq('id', id)
      .eq('status', 'claimed')
    if (error) throw new Error(error.message)
  },

  async reprogramarItem(id, fim) {
    const { error } = await servico
      .from('dial_queue')
      .update({ status: 'queued', claimed_at: null, ...fim })
      .eq('id', id)
      .eq('status', 'claimed')
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
