// Adaptador Deno da função call-events. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e sobre `call-finalize`, e entrega a decisão para
// `eventos.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **O corpo é lido cru, e uma vez só**, pela razão de `call-init/index.ts`: a
// assinatura cobre o texto exato que chegou, e quem faz `JSON.parse` é
// `eventos.ts`, depois de conferi-la.
//
// **O acionamento é um POST em `call-finalize` com `x-internal-secret`**, o
// mesmo cabeçalho que `call-place` confere para rotina. O corpo é `{ call_id }`
// e nada além. 2xx e 409 contam como acionada: 409 é a reivindicação de
// `call-finalize` dizendo que outra passagem já está finalizando esta chamada,
// que é o desfecho certo do aviso repetido e não uma falha.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { lerInstanteDaRotacao } from '../_shared/provedor/assinatura-de-webhook.ts'
import {
  CHAVE_DO_SEGREDO_DO_FIM,
  contaDoEndereco,
  PROVEDOR_DO_WEBHOOK,
} from '../_shared/provedor/webhooks-da-conta.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'

import { receberAviso, type ChamadaDoAviso, type PortaDoAviso } from './eventos.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

/** O segredo de webhook do provedor de voz, o mesmo de `call-init`. */
const SEGREDO_DO_WEBHOOK = Deno.env.get('SARAH_VOZ_WEBHOOK_SECRET') ?? null
/** O segredo de antes da rotação, e quando ela aconteceu (R-07). */
const SEGREDO_ANTERIOR = Deno.env.get('SARAH_VOZ_WEBHOOK_SECRET_ANTERIOR') ?? null
const ROTACIONADO_EM = lerInstanteDaRotacao(Deno.env.get('SARAH_VOZ_WEBHOOK_ROTACIONADO_EM'))

const CABECALHO_DA_ASSINATURA = 'elevenlabs-signature'
const CABECALHO_INTERNO = 'x-internal-secret'

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function chamadaPor(coluna: string, valor: string): Promise<ChamadaDoAviso | null> {
  const { data, error } = await servico
    .from('calls')
    .select('id, account_id')
    .eq(coluna, valor)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const linha = data as Record<string, unknown>
  return { id: String(linha.id ?? ''), account_id: String(linha.account_id ?? '') }
}

const porta: PortaDoAviso = {
  async segredoDoWebhookDaConta(contaId) {
    // Direto no cofre, sem a cascata de `secrets.ts`: este segredo é da conta e
    // só dela — não há degrau de recurso nem de plataforma que faça sentido.
    const { data, error } = await servico.rpc('get_account_secret', {
      p_account_id: contaId,
      p_provider: PROVEDOR_DO_WEBHOOK,
      p_key_name: CHAVE_DO_SEGREDO_DO_FIM,
    })
    if (error) throw new Error(error.message)
    return typeof data === 'string' && data.trim() !== '' ? data : null
  },

  chamadaPelaConversa: (conversaId) => chamadaPor('provider_conversation_id', conversaId),
  chamadaPelaTelefonia: (sid) => chamadaPor('provider_call_sid', sid),

  async acionarFinalizacao(chamadaId) {
    const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-finalize`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CABECALHO_INTERNO]: await segredoInterno(),
        authorization: `Bearer ${CHAVE_DE_SERVICO}`,
      },
      body: JSON.stringify({ call_id: chamadaId }),
    })
    await resposta.body?.cancel()
    if (!resposta.ok && resposta.status !== 409) {
      throw new Error(`call-finalize respondeu ${resposta.status}`)
    }
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },

  async registrarAvisoSemChamada(aviso) {
    // Sem conta, não há linha de `integration_events` possível: o log da
    // função é o registro.
    console.warn(JSON.stringify({ funcao: 'call-events', desfecho: 'conversa_desconhecida', ...aviso }))
  },
}

Deno.serve(async (requisicao: Request) => {
  let corpo = ''
  if (requisicao.method.toUpperCase() === 'POST') {
    try {
      corpo = await requisicao.text()
    } catch {
      // Corpo ilegível não tem assinatura que confira, e a recusa é a mesma.
    }
  }

  const resposta = await receberAviso(
    {
      metodo: requisicao.method,
      corpo,
      assinatura: requisicao.headers.get(CABECALHO_DA_ASSINATURA),
      contaDoEndereco: contaDoEndereco(requisicao.url),
    },
    porta,
    {
      segredoDoWebhook: SEGREDO_DO_WEBHOOK,
      segredoAnterior: SEGREDO_ANTERIOR,
      rotacionadoEmSegundos: ROTACIONADO_EM,
      agoraEmSegundos: Math.floor(Date.now() / 1000),
    },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
})
