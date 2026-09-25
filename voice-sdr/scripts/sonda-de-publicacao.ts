// A sonda de meia hora que a revisão técnica pede em T-01 e O-05, e o passo de
// `check:full` que a executa.
//
// POR QUE ELA NÃO RODA NO LAÇO: publicar um agente, atender webhook do provedor
// e discar para um número real exigem credencial, endereço público e telefonia.
// O laço de execução é em processo, sem container, sem rede e sem permissão do
// macOS (`CLAUDE.md`, "Validação: em processo, sem container"). Então a sonda é
// escrita aqui, entra no degrau 3 como passo próprio (`npm run check:sonda`) e
// **sai com zero quando SARAH_ELEVENLABS_API_KEY está ausente**, que é o caso de
// toda máquina de desenvolvimento e de todo envio que não leve segredo. Sem essa
// saída silenciosa, o degrau 3 ficaria vermelho por falta de credencial e o time
// aprenderia a ignorar a esteira.
//
// O QUE ELA RESPONDE:
//   1. T-01 — o provedor honra o conjunto de ferramentas devolvido na resposta
//      do webhook de início de conversa? Se honrar, um agente por conta volta a
//      servir e T-01 cai para MENOR (docs/decisao-do-agente.md).
//   2. P-01 — `response_timeout_secs` explícito em 5 s em cada ferramenta, com
//      p95 e p99 do tempo de resposta medidos em 20 chamadas, a primeira fria.
//   3. P-02 — o modelo de linguagem escolhido na publicação, lido de volta do
//      provedor depois de publicar.
//   4. P-11 — `x-conversation-id` chegando por cabeçalho de ferramenta.
//
// O relatório sai em texto no fim da corrida. Quem o lê atualiza o campo
// **Estado** de `docs/decisao-do-agente.md` para `confirmada` ou `derrubada`.

import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Sem esta variável a sonda não tem o que fazer, e sair com zero é o certo. */
const VARIAVEL_DA_CREDENCIAL = 'SARAH_ELEVENLABS_API_KEY'

const BASE_DA_API = 'https://api.elevenlabs.io'

/**
 * O teto que P-01 manda declarar em cada ferramenta. O PRD trata 3 s como corte
 * do provedor; a revisão mostra que o corte é escolha nossa, e 5 s é o valor
 * que a publicação passa a dizer em voz alta.
 */
const TEMPO_LIMITE_DE_FERRAMENTA_S = 5

/**
 * O modelo da conversa (P-02). A tabela de stack do PRD só escolhe o modelo de
 * fora da chamada; dentro dela a escolha move latência, custo por minuto e
 * qualidade de chamada de ferramenta, e por isso vai explícita na publicação.
 */
const MODELO_DA_CONVERSA = 'gemini-2.0-flash'

/** Ferramenta que entra na publicação. */
const FERRAMENTA_PUBLICADA = 'sonda_publicada'

/**
 * Ferramenta que a sonda tenta enfiar pela resposta do webhook de início, sem
 * nunca ter sido publicada. Se ela aparecer numa chamada, o provedor honrou a
 * substituição e a suposição de T-01 caiu.
 */
const FERRAMENTA_SUBSTITUTA = 'sonda_substituta'

const CHAMADAS_PADRAO = 20

type Configuracao = {
  chave: string
  /** Número de teste para onde a sonda liga, em E.164. */
  destino: string
  /** Identificador do número de saída registrado no provedor. */
  numeroDeSaida: string
  /** Endereço público que chega neste processo (túnel ou host da esteira). */
  enderecoPublico: string
  porta: number
  chamadas: number
}

type ToqueDeFerramenta = {
  ferramenta: string
  /** Milissegundos entre a chegada da requisição e a resposta escrita. */
  duracaoMs: number
  /** O cabeçalho que P-11 quer ver chegar, ou null quando não veio. */
  conversationId: string | null
}

type Registro = {
  toques: ToqueDeFerramenta[]
  /** Quantas vezes o webhook de início foi atendido. */
  iniciosAtendidos: number
}

function lerConfiguracao(ambiente: NodeJS.ProcessEnv): Configuracao | null {
  const chave = ambiente[VARIAVEL_DA_CREDENCIAL]?.trim()
  if (!chave) return null

  const faltando: string[] = []
  function obrigatoria(nome: string): string {
    const valor = ambiente[nome]?.trim()
    if (!valor) faltando.push(nome)
    return valor ?? ''
  }

  const destino = obrigatoria('SARAH_SONDA_NUMERO_DE_TESTE')
  const numeroDeSaida = obrigatoria('SARAH_SONDA_NUMERO_DE_SAIDA')
  const enderecoPublico = obrigatoria('SARAH_SONDA_ENDERECO_PUBLICO')

  if (faltando.length > 0) {
    throw new Error(
      `sonda: ${VARIAVEL_DA_CREDENCIAL} está posta, então a sonda vai rodar, mas falta ${faltando.join(', ')}.`,
    )
  }

  return {
    chave,
    destino,
    numeroDeSaida,
    enderecoPublico: enderecoPublico.replace(/\/+$/, ''),
    porta: Number(ambiente['SARAH_SONDA_PORTA'] ?? 8787),
    chamadas: Number(ambiente['SARAH_SONDA_CHAMADAS'] ?? CHAMADAS_PADRAO),
  }
}

/** Uma ferramenta de webhook, na forma que a publicação do provedor espera. */
function descreverFerramenta(nome: string, endereco: string): unknown {
  return {
    type: 'webhook',
    name: nome,
    description: 'Ferramenta da sonda de publicação. Não usar em produção.',
    // P-01: o teto é nosso e vai escrito, em vez de herdado do padrão do
    // provedor, que é maior.
    response_timeout_secs: TEMPO_LIMITE_DE_FERRAMENTA_S,
    api_schema: {
      url: `${endereco}/ferramenta/${nome}`,
      method: 'POST',
      // P-11: a variável de sistema do provedor desce por cabeçalho. É isto que
      // a sonda confere do outro lado.
      request_headers: { 'x-conversation-id': '{{system__conversation_id}}' },
    },
  }
}

async function chamarProvedor(
  configuracao: Configuracao,
  caminho: string,
  corpo?: unknown,
): Promise<unknown> {
  const resposta = await fetch(`${BASE_DA_API}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: {
      'xi-api-key': configuracao.chave,
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })

  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new Error(`sonda: ${caminho} devolveu ${resposta.status}: ${texto.slice(0, 400)}`)
  }
  return texto.length === 0 ? null : (JSON.parse(texto) as unknown)
}

function valorDeTexto(objeto: unknown, ...caminho: string[]): string | null {
  let atual: unknown = objeto
  for (const passo of caminho) {
    if (typeof atual !== 'object' || atual === null) return null
    atual = (atual as Record<string, unknown>)[passo]
  }
  return typeof atual === 'string' ? atual : null
}

/**
 * Sobe o receptor dos dois webhooks: o de início de conversa, que é onde a
 * substituição de ferramentas é tentada, e o da ferramenta, que é onde o
 * cabeçalho e o tempo de resposta são medidos.
 */
function subirReceptor(configuracao: Configuracao, registro: Registro) {
  const servidor = createServer((requisicao: IncomingMessage, resposta: ServerResponse) => {
    const comeco = performance.now()
    const caminho = (requisicao.url ?? '/').split('?')[0] ?? '/'

    if (caminho === '/inicio') {
      registro.iniciosAtendidos += 1
      responderJson(resposta, {
        type: 'conversation_initiation_client_data',
        dynamic_variables: { sonda: 'sim' },
        conversation_config_override: {
          agent: {
            first_message: 'Oi, aqui é a sonda de publicação.',
            // A tentativa: uma ferramenta que nunca foi publicada. Se o provedor
            // a honrar, ela aparece em /ferramenta/sonda_substituta.
            prompt: {
              tools: [descreverFerramenta(FERRAMENTA_SUBSTITUTA, configuracao.enderecoPublico)],
            },
          },
        },
      })
      return
    }

    const casada = /^\/ferramenta\/([\w-]+)$/.exec(caminho)
    if (casada?.[1]) {
      const cabecalho = requisicao.headers['x-conversation-id']
      responderJson(resposta, { ok: true })
      registro.toques.push({
        ferramenta: casada[1],
        duracaoMs: performance.now() - comeco,
        conversationId: typeof cabecalho === 'string' ? cabecalho : null,
      })
      return
    }

    resposta.writeHead(404).end()
  })

  return new Promise<{ encerrar: () => Promise<void> }>((resolver) => {
    servidor.listen(configuracao.porta, () =>
      resolver({
        encerrar: () => new Promise<void>((pronto) => servidor.close(() => pronto())),
      }),
    )
  })
}

function responderJson(resposta: ServerResponse, corpo: unknown): void {
  const texto = JSON.stringify(corpo)
  resposta.writeHead(200, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(texto),
  })
  resposta.end(texto)
}

/**
 * Percentil por ordenação, com o índice arredondado para cima. Em 20 amostras o
 * p95 é a 19ª e o p99 é a 20ª — que é o ponto: p99 com 20 chamadas é o pior
 * caso observado, e o relatório diz isso em vez de fingir precisão.
 */
function percentil(amostras: readonly number[], fracao: number): number {
  if (amostras.length === 0) return Number.NaN
  const ordenadas = [...amostras].sort((a, b) => a - b)
  const indice = Math.min(ordenadas.length - 1, Math.ceil(fracao * ordenadas.length) - 1)
  return ordenadas[Math.max(0, indice)] ?? Number.NaN
}

async function publicarAgenteDeTeste(configuracao: Configuracao): Promise<string> {
  const criado = await chamarProvedor(configuracao, '/v1/convai/agents/create', {
    name: `sonda-de-publicacao-${Date.now()}`,
    conversation_config: {
      agent: {
        first_message: 'Oi, aqui é a sonda.',
        language: 'pt',
        prompt: {
          prompt: 'Você é uma sonda técnica. Chame a ferramenta disponível e encerre.',
          // P-02: o modelo da conversa é escolha da publicação, não padrão do
          // provedor.
          llm: MODELO_DA_CONVERSA,
          tools: [descreverFerramenta(FERRAMENTA_PUBLICADA, configuracao.enderecoPublico)],
        },
      },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true } },
      },
      // O webhook de início: é ele que a sonda usa para tentar a substituição.
      conversation_initiation_client_data_webhook: {
        url: `${configuracao.enderecoPublico}/inicio`,
        request_headers: {},
      },
    },
  })

  const id = valorDeTexto(criado, 'agent_id')
  if (!id) throw new Error('sonda: a criação do agente não devolveu agent_id.')
  return id
}

async function discar(configuracao: Configuracao, agente: string): Promise<void> {
  await chamarProvedor(configuracao, '/v1/convai/twilio/outbound-call', {
    agent_id: agente,
    agent_phone_number_id: configuracao.numeroDeSaida,
    to_number: configuracao.destino,
  })
}

/** Teto de espera por chamada. Passou disso, a chamada não tocou ferramenta. */
const ESPERA_POR_CHAMADA_MS = 120_000

/**
 * As 20 chamadas são em série, e cada uma espera o seu toque de ferramenta. Em
 * paralelo o p95 mediria fila nossa em vez de tempo de resposta, e o número
 * que P-01 quer é o da ferramenta atendida sozinha.
 */
async function esperarToque(registro: Registro, toquesAntes: number): Promise<boolean> {
  const limite = performance.now() + ESPERA_POR_CHAMADA_MS
  while (performance.now() < limite) {
    if (registro.toques.length > toquesAntes) return true
    await new Promise((pronto) => setTimeout(pronto, 500))
  }
  return false
}

function relatar(configuracao: Configuracao, registro: Registro, modeloNoProvedor: string | null) {
  const duracoes = registro.toques.map((toque) => toque.duracaoMs)
  const substitutas = registro.toques.filter(
    (toque) => toque.ferramenta === FERRAMENTA_SUBSTITUTA,
  )
  const comCabecalho = registro.toques.filter((toque) => toque.conversationId !== null)

  const honrou = substitutas.length > 0

  console.log('\n=== sonda de publicação ===')
  console.log(`chamadas pedidas: ${configuracao.chamadas}`)
  console.log(`inícios de conversa atendidos: ${registro.iniciosAtendidos}`)
  console.log(`toques de ferramenta: ${registro.toques.length}`)
  console.log('')
  console.log(
    `T-01 — o provedor honrou a substituição de ferramentas pelo webhook de início? ${honrou ? 'SIM' : 'NÃO'}`,
  )
  console.log(
    honrou
      ? '  → T-01 cai para MENOR. Um agente por conta volta a servir e agent_publications passa a ter uma linha por conta (docs/decisao-do-agente.md, "O que derruba a suposição").'
      : '  → a suposição se sustenta: quatro publicações, uma por propósito. Passe o Estado de docs/decisao-do-agente.md para `confirmada`.',
  )
  console.log('')
  console.log(`P-01 — response_timeout_secs declarado: ${TEMPO_LIMITE_DE_FERRAMENTA_S} s`)
  console.log(`  primeira resposta (função fria): ${(duracoes[0] ?? Number.NaN).toFixed(0)} ms`)
  console.log(`  p95: ${percentil(duracoes, 0.95).toFixed(0)} ms`)
  console.log(`  p99: ${percentil(duracoes, 0.99).toFixed(0)} ms`)
  console.log('  (medido do lado de cá: chegada da requisição até a resposta escrita.')
  console.log('   A ida e volta que o provedor espera soma a rede, que daqui não se vê.)')
  console.log('')
  console.log(`P-02 — modelo pedido na publicação: ${MODELO_DA_CONVERSA}`)
  console.log(`  modelo lido de volta do provedor: ${modeloNoProvedor ?? 'não devolvido'}`)
  console.log('')
  console.log(
    `P-11 — x-conversation-id chegou em ${comCabecalho.length} de ${registro.toques.length} toques`,
  )
}

const configuracao = lerConfiguracao(process.env)

if (!configuracao) {
  console.log(
    `sonda de publicação: ${VARIAVEL_DA_CREDENCIAL} ausente; nada a rodar.\n` +
      '  A sonda publica agente, atende webhook e liga para um número real (T-01, P-01, P-02, P-11).\n' +
      '  Sem credencial, rede e número de teste ela não tem o que medir, e falhar por isso\n' +
      '  deixaria o degrau 3 vermelho em todo envio sem segredo.',
  )
  process.exit(0)
}

const registro: Registro = { toques: [], iniciosAtendidos: 0 }
const receptor = await subirReceptor(configuracao, registro)

try {
  const agente = await publicarAgenteDeTeste(configuracao)
  console.log(`sonda: agente de teste publicado (${agente}).`)

  const lido = await chamarProvedor(configuracao, `/v1/convai/agents/${agente}`)
  const modeloNoProvedor = valorDeTexto(lido, 'conversation_config', 'agent', 'prompt', 'llm')

  let semToque = 0
  for (let i = 0; i < configuracao.chamadas; i += 1) {
    const toquesAntes = registro.toques.length
    console.log(`sonda: chamada ${i + 1} de ${configuracao.chamadas}`)
    await discar(configuracao, agente)
    if (!(await esperarToque(registro, toquesAntes))) {
      semToque += 1
      console.log('  sem toque de ferramenta dentro do teto de espera.')
    }
  }
  if (semToque > 0) {
    console.log(`sonda: ${semToque} chamada(s) terminaram sem tocar ferramenta nenhuma.`)
  }

  relatar(configuracao, registro, modeloNoProvedor)
} finally {
  await receptor.encerrar()
}
