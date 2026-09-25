// Adaptador Deno da função call-audio. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase e o Storage, e entrega a decisão para `audio.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth jwt** (o padrão do gateway, sem bloco em `config.toml`). A sessão é
// resolvida por `auth.getUser`, e a leitura da chamada é feita com a chave de
// serviço: a conta sai da linha, e o vínculo de quem pediu é conferido contra
// ela em `audio.ts`. Ler com o cliente da sessão e deixar a RLS filtrar daria o
// mesmo 404, mas esconderia a regra no banco e deixaria o teste sem o que medir.
//
// **Dependência que esta frente não cria**: o balde `recordings` no Storage,
// privado, o mesmo em que `call-finalize` grava.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { BALDE_DAS_GRAVACOES } from '../call-finalize/finalizacao.ts'

import { atenderAudio, RETENCAO_PADRAO_EM_DIAS, type PortaDoAudio } from './audio.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta: PortaDoAudio = {
  async usuarioDaSessao(jwt) {
    const { data, error } = await servico.auth.getUser(jwt)
    if (error || !data.user) return null
    return { id: data.user.id }
  },

  async gravacaoDaChamada(chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select('id, account_id, recording_path, recording_expires_at')
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const linha = data as {
      id: string
      account_id: string
      recording_path?: string | null
      recording_expires_at?: string | null
    }
    return {
      id: linha.id,
      account_id: linha.account_id,
      recording_path: linha.recording_path ?? null,
      recording_expires_at: linha.recording_expires_at ?? null,
    }
  },

  async papelNaConta(contaId, usuarioId) {
    const { data, error } = await servico
      .from('account_members')
      .select('role')
      .eq('account_id', contaId)
      .eq('user_id', usuarioId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as { role?: string } | null)?.role ?? null
  },

  async retencaoDaConta(contaId) {
    const { data, error } = await servico
      .from('account_settings')
      .select('retention_days')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const dias = (data as { retention_days?: unknown } | null)?.retention_days
    return typeof dias === 'number' ? dias : RETENCAO_PADRAO_EM_DIAS
  },

  async assinarGravacao(caminho, validadeEmSegundos) {
    const { data, error } = await servico.storage
      .from(BALDE_DAS_GRAVACOES)
      .createSignedUrl(caminho, validadeEmSegundos)
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'URL assinada ausente')
    return data.signedUrl
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em chamada_invalida, que já tem frase.
  }

  const resposta = await atenderAudio(
    {
      metodo: requisicao.method,
      chamadaId: corpo?.chamadaId ?? corpo?.call_id ?? null,
      autorizacao: requisicao.headers.get('authorization'),
    },
    porta,
    { agora: new Date().toISOString(), segredosDaInstalacao: [CHAVE_DE_SERVICO] },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
