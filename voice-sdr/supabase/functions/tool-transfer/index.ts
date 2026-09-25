// Adaptador Deno da função tool-transfer. Só amarração: lê o ambiente, monta as
// portas sobre o Supabase com a chave de serviço e entrega a decisão para
// `transferencia.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. O esqueleto confere o segredo antes de qualquer leitura
// por conversa.
//
// **A `PortaDeFerramentas` é a de `_shared/tools/porta-do-supabase.ts`**, a
// mesma de `tool-dnc` e `tool-availability`.
//
// **O item da fila entra por `criar_excecao`** (L-24), com `human_requested` e
// severidade alta, que são decisão desta ferramenta e não do chamador.
//
// **PARA O CI:** o `deno check` deste arquivo e a suíte de contrato
// (`scripts/contrato-das-ferramentas.ts`) contra a função implantada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import { CABECALHO_DA_CONVERSA, type AmbienteDaFerramenta } from '../_shared/tools/esqueleto.ts'
import { criarPortaDeFerramentas, type ClienteDasFerramentas } from '../_shared/tools/porta-do-supabase.ts'

import { criarToolTransfer, type EscritaDaTransferencia, type LeituraDaTransferencia } from './transferencia.ts'

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

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta = criarPortaDeFerramentas(servico as unknown as ClienteDasFerramentas)

const leitura: LeituraDaTransferencia = {
  async destinoDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select('transfer_target')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.transfer_target ?? null
  },
}

const escrita: EscritaDaTransferencia = {
  async abrirItemNaFila(item) {
    const { error } = await servico.rpc('criar_excecao', {
      p_account_id: item.contaId,
      p_kind: 'human_requested',
      p_severity: 'alta',
      p_call_id: item.chamadaId,
      p_lead_id: item.leadId,
      p_context: item.contexto,
    })
    if (error) throw new Error(error.message)
  },
}

const tratar = criarToolTransfer(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDaTransferencia> = {
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
