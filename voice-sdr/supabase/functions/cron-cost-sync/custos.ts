// cron-cost-sync: o preço que chega tarde (seção 4.6, T-20, P-07, R-01).
//
// Roda a cada 15 minutos, dentro do envelope das rotinas, e busca o preço da
// telefonia das chamadas encerradas que ainda não o têm. O custo da chamada é
// metade da métrica norte (custo por reunião), e a telefonia é a parcela que
// nunca está pronta no fim da ligação.
//
// **De onde vem cada componente** está em `ORIGENS_DOS_COMPONENTES`, com a
// razão. Esta rotina cobre a telefonia; voz e modelo têm informante próprio,
// que grava no momento em que o valor existe, e buscá-los de novo aqui seria
// uma segunda medida do mesmo custo sob outro `source` — o único de
// `call_costs` separa informantes, e a soma contaria os dois.
//
// **Preço nulo na primeira consulta é caso normal** (P-07). A resposta sem
// preço não vira linha — nem nula, nem zero —, soma uma tentativa e a chamada
// volta na passagem seguinte. Zero é outra coisa: é preço que chegou e disse
// que a ligação não custou nada, e vira linha com zero. A diferença importa no
// teto de gasto do dia: somar zero onde o preço não chegou faria a guarda
// liberar discagem que já deveria ter parado.
//
// **Idempotente pelo único de `call_costs`.** A escrita é
// `gravar_preco_tardio`, `on conflict (call_id, component, source) do update`:
// duas passagens com a mesma chamada — sobrepostas, ou a segunda depois de uma
// correção de preço — atualizam a mesma parcela, e `calls.cost_cents` é soma
// refeita pelo gatilho, nunca delta.
//
// **Nenhuma chamada é olhada para sempre (R-01).** Passadas 24 h do fim sem
// preço, a rotina marca `cost_sync_gave_up_at` e deixa uma linha da conta em
// `job_runs` com a razão. O componente continua sem parcela, e a ficha o mostra
// como custo parcial.
//
// **Cada consulta vira `integration_events`**, com `correlation_id` igual ao
// `call_id`: é por ele que a cadeia da ligação se reconstrói (RNF-16). A
// consulta que falha também é rastreada, e falha não derruba a passagem — uma
// chamada cuja telefonia recusou não pode deixar as outras 24 sem preço.
//
// **O formato da resposta é suposição declarada**: `GET
// Accounts/{conta}/Calls/{sid}.json` devolve `price` como texto decimal
// negativo em `price_unit` ("-0.01500", "USD"), ou nulo enquanto a operadora
// não fechou a conta. A conferência com a API real é do degrau 3 (P-07).
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e a
// telefonia entram por `PortaDosCustos`, implementada em `index.ts` e dublada
// no teste.

import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-cost-sync'

/** Quem informou o custo, em `call_costs.source`. */
export const FONTE_DO_CUSTO = 'cron-cost-sync'

/** Como a telefonia aparece em `integration_events.provider` e no cofre. */
export const PROVEDOR_DE_TELEFONIA = 'telefonia'

/** Por quanto tempo depois do fim a rotina ainda procura o preço (R-01). */
export const JANELA_DO_PRECO_MS = 24 * 60 * 60_000

/** Moeda quando a resposta não diz qual: a telefonia cobra em dólar. */
export const MOEDA_PADRAO = 'USD'

/** Os componentes de `call_costs.component`, na lista do check. */
export type Componente = 'telephony' | 'voice' | 'model' | 'infra'

/** Quem grava cada componente, e por quê. */
export interface OrigemDoComponente {
  /** O `source` de quem grava; nulo quando ninguém grava nesta fase. */
  readonly informante: string | null
  readonly razao: string
}

/**
 * De onde vem cada um dos quatro componentes. É a razão de esta rotina cobrir
 * só a telefonia, escrita onde quem for estendê-la vai ler.
 */
export const ORIGENS_DOS_COMPONENTES: ReadonlyMap<Componente, OrigemDoComponente> = new Map([
  [
    'telephony',
    {
      informante: FONTE_DO_CUSTO,
      razao:
        'a operadora só publica o preço minutos depois do fim e pode devolvê-lo nulo na primeira consulta (P-07); ninguém tem o valor no fim da ligação, e buscá-lo depois é o motivo desta rotina',
    },
  ],
  [
    'voice',
    {
      informante: 'call-finalize',
      razao:
        'o provedor de voz devolve o custo junto com a conversa, que call-finalize já lê para escrever o desfecho; consultar de novo aqui seria uma segunda medida do mesmo custo sob outro informante, e a soma contaria as duas',
    },
  ],
  [
    'model',
    {
      informante: 'call-classify',
      razao:
        'o custo do modelo sai do uso de tokens da própria resposta, e só call-classify a vê; não há provedor a consultar depois',
    },
  ],
  [
    'infra',
    {
      informante: null,
      razao:
        'o rateio de infraestrutura por chamada não tem informante na F2; o componente fica sem parcela e a ficha o mostra como pendente, nunca como zero',
    },
  ],
])

/** Os componentes que esta rotina consulta, derivados do catálogo. */
export const COMPONENTES_DA_ROTINA: readonly Componente[] = [...ORIGENS_DOS_COMPONENTES.entries()]
  .filter(([, origem]) => origem.informante === FONTE_DO_CUSTO)
  .map(([componente]) => componente)

/** Uma linha de `reivindicar_precos_tardios`. */
export interface ChamadaSemPreco {
  readonly id: string
  readonly account_id: string
  readonly provider_call_sid: string
  readonly ended_at: string
  readonly cost_sync_attempts: number
}

/** O que a telefonia respondeu. Nula quando não houve consulta (sem credencial). */
export interface RespostaDaTelefonia {
  /** Nulo é "sem resposta": tempo esgotado ou conexão recusada. */
  readonly status_code: number | null
  readonly corpo: unknown
  readonly latency_ms: number
}

/** O preço lido da resposta. */
export type PrecoDaTelefonia =
  | { readonly estado: 'conhecido'; readonly centavos: number; readonly moeda: string }
  | { readonly estado: 'pendente' }

/** A parcela que vai para `gravar_preco_tardio`. */
export interface ParcelaTardia {
  readonly call_id: string
  readonly component: Componente
  readonly amount_cents: number
  readonly currency: string
  readonly source: string
}

/** Uma linha de `integration_events`. */
export interface RastroDaConsulta {
  readonly account_id: string
  readonly direction: 'outbound'
  readonly provider: string
  /** O caminho, sem o endereço do provedor nem o identificador da conta nele. */
  readonly endpoint: string
  readonly request: Readonly<Record<string, unknown>>
  readonly response: Readonly<Record<string, unknown>>
  readonly status_code: number | null
  readonly latency_ms: number
  /** O `call_id`, para a cadeia da ligação (RNF-16). */
  readonly correlation_id: string
}

/** O que a rotina anota na chamada. Chave ausente é "não mexi". */
export interface NotaDoPreco {
  readonly cost_sync_attempts?: number
  readonly cost_sync_gave_up_at?: string
}

/** A linha da conta em `job_runs` quando a rotina desiste de uma chamada. */
export interface LinhaDaDesistencia {
  readonly routine: string
  readonly account_id: string
  readonly started_at: string
  readonly finished_at: string
  readonly items: number
  readonly error: string
}

export interface PortaDosCustos {
  /** `reivindicar_precos_tardios`: `for update skip locked`, grava `cost_sync_claimed_at`. */
  reivindicarChamadas(limite: number, instante: string): Promise<readonly ChamadaSemPreco[]>
  /** `GET Calls/{sid}.json` na telefonia da conta. Nulo quando a credencial não resolve. */
  consultarTelefonia(contaId: string, providerCallSid: string): Promise<RespostaDaTelefonia | null>
  rastrear(rastro: RastroDaConsulta): Promise<void>
  /** `gravar_preco_tardio`: `on conflict (call_id, component, source) do update`. */
  gravarPreco(parcela: ParcelaTardia): Promise<void>
  anotar(chamadaId: string, nota: NotaDoPreco): Promise<void>
  registrarDesistencia(linha: LinhaDaDesistencia): Promise<void>
}

const MOEDA = /^[A-Z]{3}$/
const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/

/**
 * O preço a partir do corpo da telefonia. `price` nulo, ausente ou ilegível é
 * `pendente` — nunca zero. O valor vem negativo (é débito na conta da
 * operadora) e vira centavos positivos, arredondados como em `call-finalize`:
 * a coluna é inteira, e um preço abaixo de meio centavo vira zero conhecido,
 * que é o valor que a soma teria de qualquer jeito.
 */
export function lerPrecoDaTelefonia(corpo: unknown): PrecoDaTelefonia {
  if (typeof corpo !== 'object' || corpo === null) return { estado: 'pendente' }
  const campos = corpo as Record<string, unknown>

  const preco = campos.price
  let valor: number
  if (typeof preco === 'number') {
    valor = preco
  } else if (typeof preco === 'string' && DECIMAL.test(preco.trim())) {
    valor = Number(preco.trim())
  } else {
    return { estado: 'pendente' }
  }
  if (!Number.isFinite(valor)) return { estado: 'pendente' }

  const unidade = typeof campos.price_unit === 'string' ? campos.price_unit.trim().toUpperCase() : ''
  return {
    estado: 'conhecido',
    centavos: Math.round(Math.abs(valor) * 100),
    moeda: MOEDA.test(unidade) ? unidade : MOEDA_PADRAO,
  }
}

/** O que fazer com a chamada depois de ouvir a telefonia. */
export type DecisaoDoPreco =
  | { readonly decisao: 'gravar'; readonly centavos: number; readonly moeda: string }
  | { readonly decisao: 'tentar_de_novo' }
  | { readonly decisao: 'desistir'; readonly razao: string }

/**
 * A decisão, pura. 404 é chamada que a operadora não conhece, e esperar não a
 * faz existir. Sem preço dentro das 24 h é tentar de novo; fora delas,
 * desistir.
 */
export function decidirPreco(
  chamada: ChamadaSemPreco,
  resposta: RespostaDaTelefonia | null,
  instanteMs: number,
): DecisaoDoPreco {
  if (resposta !== null && resposta.status_code === 404) {
    return { decisao: 'desistir', razao: 'a telefonia não conhece a chamada (404)' }
  }

  if (resposta !== null && resposta.status_code !== null && resposta.status_code >= 200 && resposta.status_code < 300) {
    const preco = lerPrecoDaTelefonia(resposta.corpo)
    if (preco.estado === 'conhecido') {
      return { decisao: 'gravar', centavos: preco.centavos, moeda: preco.moeda }
    }
  }

  if (instanteMs - Date.parse(chamada.ended_at) > JANELA_DO_PRECO_MS) {
    const tentativas = chamada.cost_sync_attempts + 1
    return {
      decisao: 'desistir',
      razao: `o preço da telefonia não chegou em 24 h (${tentativas} consultas)`,
    }
  }
  return { decisao: 'tentar_de_novo' }
}

type ItemDoCusto = ItemDaRotina & { readonly chamada: ChamadaSemPreco }

export interface PedidoDosCustos {
  readonly porta: PortaDosCustos
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-cost-sync`, dentro do envelope das rotinas. */
export function sincronizarCustos(pedido: PedidoDosCustos): Promise<ResultadoDaExecucao> {
  const { porta } = pedido
  const agora = pedido.agora ?? Date.now

  return executarRotina<ItemDoCusto>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const chamadas = await porta.reivindicarChamadas(limite, instante)
        return chamadas.map((chamada) => ({ chave: chamada.id, chamada }))
      },
      async processar(item, instante) {
        await buscarPreco(porta, item.chamada, instante)
      },
    },
  })
}

async function buscarPreco(porta: PortaDosCustos, chamada: ChamadaSemPreco, instante: string) {
  const endpoint = `Calls/${chamada.provider_call_sid}.json`

  let resposta: RespostaDaTelefonia | null
  try {
    resposta = await porta.consultarTelefonia(chamada.account_id, chamada.provider_call_sid)
  } catch {
    resposta = { status_code: null, corpo: null, latency_ms: 0 }
  }

  const decisao = decidirPreco(chamada, resposta, Date.parse(instante))

  // Sem credencial não houve consulta, e rastro de chamada externa que não
  // aconteceu confundiria a cadeia da ligação.
  if (resposta !== null) {
    await porta.rastrear({
      account_id: chamada.account_id,
      direction: 'outbound',
      provider: PROVEDOR_DE_TELEFONIA,
      endpoint,
      request: { call_sid: chamada.provider_call_sid, motivo: 'preco' },
      response: respostaDoRastro(decisao),
      status_code: resposta.status_code,
      latency_ms: Math.max(0, Math.round(resposta.latency_ms)),
      correlation_id: chamada.id,
    })
  }

  switch (decisao.decisao) {
    case 'gravar':
      for (const componente of COMPONENTES_DA_ROTINA) {
        await porta.gravarPreco({
          call_id: chamada.id,
          component: componente,
          amount_cents: decisao.centavos,
          currency: decisao.moeda,
          source: FONTE_DO_CUSTO,
        })
      }
      return
    case 'tentar_de_novo':
      await porta.anotar(chamada.id, { cost_sync_attempts: chamada.cost_sync_attempts + 1 })
      return
    case 'desistir':
      await porta.anotar(chamada.id, {
        cost_sync_attempts: chamada.cost_sync_attempts + 1,
        cost_sync_gave_up_at: instante,
      })
      await porta.registrarDesistencia({
        routine: NOME_DA_ROTINA,
        account_id: chamada.account_id,
        started_at: instante,
        finished_at: instante,
        items: 1,
        error: `desistência do preço da chamada ${chamada.id}: ${decisao.razao}; o custo fica parcial`,
      })
      return
  }
}

/** O resumo da resposta que vai para o rastro: a decisão, nunca o corpo inteiro. */
function respostaDoRastro(decisao: DecisaoDoPreco): Record<string, unknown> {
  switch (decisao.decisao) {
    case 'gravar':
      return { preco: 'conhecido', centavos: decisao.centavos, moeda: decisao.moeda }
    case 'tentar_de_novo':
      return { preco: 'pendente' }
    case 'desistir':
      return { preco: 'desistencia' }
  }
}

// A borda --------------------------------------------------------------------

export interface PedidoDaRotina {
  readonly metodo: string
  /** O cabeçalho `x-internal-secret`. */
  readonly segredo: string | null
}

export interface RespostaDaRotina {
  readonly status: number
  readonly corpo: Readonly<Record<string, unknown>>
}

/**
 * O que o `index.ts` chama. O segredo é conferido antes de tocar em qualquer
 * porta: sem ele, nem `job_runs` recebe linha.
 */
export async function atenderRotina(
  pedido: PedidoDaRotina,
  custos: PedidoDosCustos,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await sincronizarCustos(custos)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
