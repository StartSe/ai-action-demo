// Adaptador Deno da função whatsapp-inbound. Só amarração: ambiente, cliente
// do Supabase com a chave de serviço, cofre, modelo da conta e o
// `EdgeRuntime.waitUntil` da resposta. A decisão mora em `entrada.ts`, a
// resposta em `_shared/whatsapp/resposta.ts` e as consultas em
// `portas-do-supabase.ts`, todos portáveis e testados.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth pelo endereço** (`verify_jwt = false` em `config.toml`): a Z-API não
// assina nem manda cabeçalho nosso. A credencial é `?conta=&chave=`, conferida
// em `entrada.ts` antes de ler o corpo.
//
// **A resposta sai depois do 200.** `receberWebhook` devolve `depois`, e ele
// vai para `EdgeRuntime.waitUntil`, que segura o isolado vivo até a promessa
// terminar (o limite da plataforma para trabalho em segundo plano é bem maior
// que a janela de agrupamento mais o modelo). Sem `EdgeRuntime` (execução
// local fora do Supabase), a promessa roda solta e o erro vai para o log: o
// 200 não espera por ela de jeito nenhum.
//
// **PARA O CI:** o `deno check` deste arquivo e a conferência das suposições
// da Z-API (`SUPOSICOES_DA_ZAPI`) contra uma instância de verdade, e as do
// OpenRouter para mídia (`SUPOSICOES_DA_LEITURA_DE_MIDIA`) contra o provedor.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { conversarComFerramentas } from '../_shared/modelo/conversa-com-ferramentas.ts'
import { lerMidiaComModelo } from '../_shared/modelo/leitura-de-midia.ts'
import { CHAVE_NO_COFRE, PROVEDOR as PROVEDOR_OPENROUTER } from '../_shared/modelo/openrouter.ts'
import { modeloDaTarefa } from '../_shared/modelo/resolucao.ts'
import { NOME_DO_PRODUTO } from '../_shared/marca.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { ROTULO_DA_CHAVE_DE_FERRAMENTAS, segredoDaInstalacao } from '../_shared/segredo-da-instalacao.ts'
import { LIMITE_DO_ENVIO_MS } from '../_shared/whatsapp/envio.ts'
import { LIMITE_DO_DOWNLOAD_MS } from '../_shared/whatsapp/midia.ts'
import { responderConversa } from '../_shared/whatsapp/resposta.ts'

import { receberWebhook } from './entrada.ts'
import { criarPortasDoCanal, type ClienteDoCanal } from './portas-do-supabase.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))
const CHAVE_DO_SERVIDOR = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
const ROTACIONADA_EM = (() => {
  const instante = Date.parse(Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM') ?? '')
  return Number.isFinite(instante) ? instante : null
})()

/** A tarefa do modelo na tabela de `_shared/modelo/resolucao.ts`: ver `portas-do-supabase.ts`. */
const TAREFA = 'classify' as const
const LIMITE_DO_MODELO_MS = 30_000
/** Transcrever um áudio longo leva mais que uma rodada de conversa. */
const LIMITE_DA_LEITURA_DE_MIDIA_MS = 60_000
const APLICACAO = { url: Deno.env.get('SARAH_URL_PUBLICA') ?? undefined, nome: NOME_DO_PRODUTO }

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
    const { data, error } = await servico.from('accounts').select('credentials_mode').eq('id', contaId).maybeSingle()
    if (error) return 'account'
    return (data as { credentials_mode?: string } | null)?.credentials_mode === 'platform' ? 'platform' : 'account'
  },
}
const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const portaDaPergunta = {
  async chaveDoOpenRouter(conta: string) {
    const segredo = await servico.rpc('get_account_secret', {
      p_account_id: conta,
      p_provider: PROVEDOR_OPENROUTER,
      p_key_name: CHAVE_NO_COFRE,
    })
    if (segredo.error) throw new Error(segredo.error.message)
    return typeof segredo.data === 'string' && segredo.data.trim() !== '' ? segredo.data : null
  },
}

const porta = criarPortasDoCanal({
  cliente: servico as unknown as ClienteDoCanal,
  async segredo(contaId, provedor, chave) {
    const resolucao = await cofre.resolveSecret(contaId, provedor, chave)
    return resolucao.ok ? resolucao.valor : null
  },
  buscar: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS) }),
  async rodada(contaId, pedido) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', { p_account_id: contaId, p_tarefa: TAREFA })
    if (error) throw new Error(error.message)
    const resolvido = modeloDaTarefa((data ?? [])[0] ?? null, TAREFA)
    return await conversarComFerramentas(
      contaId,
      resolvido,
      { ...pedido, modelo: resolvido.modelo },
      portaDaPergunta,
      APLICACAO,
      LIMITE_DO_MODELO_MS,
    )
  },
  buscarMidia: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(LIMITE_DO_DOWNLOAD_MS) }),
  async lerMidiaComModelo(contaId, tarefa, pedido) {
    const { data, error } = await servico.rpc('resolver_modelo_da_conta', { p_account_id: contaId, p_tarefa: tarefa })
    if (error) throw new Error(error.message)
    const resolvido = modeloDaTarefa((data ?? [])[0] ?? null, tarefa)
    const resposta = await lerMidiaComModelo(contaId, resolvido, { ...pedido, modelo: resolvido.modelo }, portaDaPergunta, {
      aplicacao: APLICACAO,
      limiteMs: LIMITE_DA_LEITURA_DE_MIDIA_MS,
    })
    return { ...resposta, modelo: resolvido.modelo }
  },
})

declare const EdgeRuntime: { waitUntil(promessa: Promise<unknown>): void } | undefined

function emSegundoPlano(promessa: Promise<unknown>): void {
  const segura = promessa.catch((erro) =>
    console.error('[whatsapp-inbound] resposta_falhou', { erro: erro instanceof Error ? erro.message : String(erro) }),
  )
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime !== null) EdgeRuntime.waitUntil(segura)
}

Deno.serve(async (requisicao: Request) => {
  const resposta = await receberWebhook(
    { metodo: requisicao.method, endereco: requisicao.url, corpo: await requisicao.text() },
    porta,
    { chaves: { vigente: CHAVE_DO_SERVIDOR, anterior: CHAVE_ANTERIOR, rotacionadaEm: ROTACIONADA_EM } },
  )

  if (resposta.depois) {
    emSegundoPlano(
      resposta.depois((contaId, conversaId) => responderConversa({ contaId, conversaId }, porta)),
    )
  }

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
})
