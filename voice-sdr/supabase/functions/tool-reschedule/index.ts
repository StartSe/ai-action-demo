// Adaptador Deno da função tool-reschedule. Só amarração: lê o ambiente, monta
// as portas sobre o Supabase com a chave de serviço e entrega a decisão para
// `remarcacao.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. O esqueleto confere o segredo antes de qualquer leitura
// por conversa.
//
// **A escrita é por RPC**: `remarcar_reuniao` fecha a antiga e abre a nova numa
// transação, e `cancelar_reuniao_na_ligacao` cancela. O evento no calendário e
// os convites da reunião nova ficam com `cron-calendar-sync` e
// `cron-meeting-invite`.
//
// **PARA O CI:** o `deno check` deste arquivo e a suíte de contrato
// (`scripts/contrato-das-ferramentas.ts`) contra a função implantada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { lerReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'
import { CABECALHO_DA_CONVERSA, type AmbienteDaFerramenta } from '../_shared/tools/esqueleto.ts'
import { criarPortaDeFerramentas, type ClienteDasFerramentas } from '../_shared/tools/porta-do-supabase.ts'

import {
  criarToolReschedule,
  type EscritaDaRemarcacao,
  type PortaDaRemarcacao,
  type ResultadoDaEscrita,
} from './remarcacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
const ROTACIONADA_EM = (() => {
  const bruto = Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM') ?? ''
  const instante = Date.parse(bruto)
  return Number.isFinite(instante) ? instante : null
})()

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta = criarPortaDeFerramentas(servico as unknown as ClienteDasFerramentas)

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

interface LinhaDeOferta {
  position: number
  specialist_id: string
  starts_at: string
  ends_at: string
  expires_at: string
  specialists: { timezone: string } | null
}

const leitura: PortaDaRemarcacao = {
  async reuniaoDaChamada(contaId, chamadaId) {
    const { data, error } = await servico.rpc('reuniao_em_jogo', { p_call_id: chamadaId })
    falhou(error)
    const [linha] = (data ?? []) as Record<string, unknown>[]
    const reuniao = lerReuniaoEmJogo(linha)
    return reuniao !== null && reuniao.contaId === contaId ? reuniao : null
  },

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

  async remarcacaoDaChamada(contaId, chamadaId, reuniaoId) {
    const { data, error } = await servico
      .from('meetings')
      .select('id, starts_at')
      .eq('account_id', contaId)
      .eq('booked_call_id', chamadaId)
      .not('rescheduled_from_id', 'is', null)
      .or(`rescheduled_from_id.eq.${reuniaoId},id.eq.${reuniaoId}`)
      .limit(1)
      .maybeSingle()
    falhou(error)
    const linha = data as { id: string; starts_at: string } | null
    return linha === null ? null : { id: linha.id, inicio: new Date(linha.starts_at).toISOString() }
  },
}

const escrita: EscritaDaRemarcacao = {
  async remarcarReuniao(contaId, chamadaId, posicao, motivo, agora) {
    const { data, error } = await servico.rpc('remarcar_reuniao', {
      p_account_id: contaId,
      p_call_id: chamadaId,
      p_slot_position: posicao,
      p_reason: motivo,
      p_agora: agora,
    })
    falhou(error)
    return data as ResultadoDaEscrita
  },

  async cancelarReuniao(contaId, chamadaId, motivo) {
    const { data, error } = await servico.rpc('cancelar_reuniao_na_ligacao', {
      p_account_id: contaId,
      p_call_id: chamadaId,
      p_reason: motivo,
    })
    falhou(error)
    return data as ResultadoDaEscrita
  },
}

const tratar = criarToolReschedule(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDaRemarcacao> = {
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
