// Adaptador Deno da função tool-confirm-meeting. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase com a chave de serviço e entrega a decisão
// para `confirmacao.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. O esqueleto confere o segredo antes de qualquer leitura
// por conversa.
//
// **A leitura e a escrita são por RPC**: `reuniao_em_jogo` resolve a reunião
// da chamada, e `confirmar_reuniao` confirma com `update ... where status =
// 'scheduled'`, na conta que o segredo provou.
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
  criarToolConfirmMeeting,
  type EscritaDaConfirmacao,
  type PortaDaConfirmacao,
  type ResultadoDaConfirmacao,
} from './confirmacao.ts'

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

const leitura: PortaDaConfirmacao = {
  async reuniaoDaChamada(contaId, chamadaId) {
    const { data, error } = await servico.rpc('reuniao_em_jogo', { p_call_id: chamadaId })
    if (error) throw new Error(error.message)
    const [linha] = (data ?? []) as Record<string, unknown>[]
    const reuniao = lerReuniaoEmJogo(linha)
    return reuniao !== null && reuniao.contaId === contaId ? reuniao : null
  },
}

const escrita: EscritaDaConfirmacao = {
  async confirmarReuniao(contaId, chamadaId, agora) {
    const { data, error } = await servico.rpc('confirmar_reuniao', {
      p_account_id: contaId,
      p_call_id: chamadaId,
      p_agora: agora,
    })
    if (error) throw new Error(error.message)
    return (data as { resultado: ResultadoDaConfirmacao }).resultado
  },
}

const tratar = criarToolConfirmMeeting(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDaConfirmacao> = {
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
