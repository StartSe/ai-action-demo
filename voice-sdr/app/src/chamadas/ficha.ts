/**
 * As decisões da ficha da chamada (RF-414), fora do componente para serem
 * testadas sem montar a tela.
 *
 * Três regras atravessam o arquivo:
 *
 * 1. **Preço que não chegou não é zero** (T-20, P-07). A telefonia é da
 *    operadora e chega minutos depois do fim; componente sem parcela sai como
 *    `null`, e a tela escreve "aguardando preço". Zero diria que a ligação não
 *    custou nada, e o total pareceria fechado quando não está.
 * 2. **A ficha não espera a classificação** (P-03). `estadoDaClassificacao`
 *    separa "processando" de "pronta" para a tela desenhar duração, custo e
 *    transcrição logo que existem, com o aviso ao lado. Esperar tudo para
 *    mostrar algo é o que estoura os 60 s do critério da F2.
 * 3. **O instante na conversa conta do atendimento.** `call-finalize` grava
 *    cada turno como instante absoluto a partir do início da conversa no
 *    provedor, e grava `answered_at` nesse mesmo início. Sem atendimento, a
 *    base é `started_at`. Instante ilegível sai nulo, nunca `00:00`.
 */

import {
  COMPONENTES_DE_CUSTO,
  type ComponenteDeCusto,
  type FichaDaChamada,
  type ParcelaDeCusto,
} from '@/chamadas/tipos'

/** Os estados em que a chamada ainda não terminou, como em `call_live`. */
const ESTADOS_VIVOS = new Set(['queued', 'ringing', 'in_progress'])

/** Um valor numa moeda. */
export interface Valor {
  centavos: number
  moeda: string
}

/** O custo de um componente. `valores` nulo é preço que ainda não chegou. */
export interface CustoDoComponente {
  componente: ComponenteDeCusto
  valores: Valor[] | null
}

export type QuemFalou = 'agent' | 'lead' | 'desconhecido'

export interface TurnoDaFicha {
  quem: QuemFalou
  texto: string
  /** `mm:ss` desde o atendimento. Nulo quando o instante gravado é ilegível. */
  instante: string | null
}

export type EstadoDaClassificacao =
  /** A chamada ainda não terminou: não há o que classificar. */
  | 'em_andamento'
  /** Terminou com conversa, e a classificação ainda não chegou. */
  | 'processando'
  | 'pronta'
  /** Terminou sem conversa (não atendeu, caixa postal muda): nada a classificar. */
  | 'sem_conversa'

export type EstadoDaGravacao =
  | { tipo: 'disponivel' }
  | { tipo: 'expurgada'; em: string }
  | { tipo: 'sem_gravacao' }

export type LeituraDoAviso =
  | { tipo: 'localizado'; instante: string }
  | { tipo: 'nao_localizado' }

export type FaixaDoSentimento = 'negativo' | 'neutro' | 'positivo'

function milissegundos(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/** Segundos em `mm:ss`, ou `h:mm:ss` a partir de uma hora. */
export function formatarSegundos(total: number): string {
  const inteiro = Math.max(0, Math.floor(total))
  const horas = Math.floor(inteiro / 3600)
  const minutos = Math.floor((inteiro % 3600) / 60)
  const segundos = inteiro % 60
  const mmss = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`
  return horas > 0 ? `${horas}:${mmss}` : mmss
}

/** O instante de um fato da conversa, contado do atendimento. */
export function instanteNaConversa(
  ficha: Pick<FichaDaChamada, 'atendidaEm' | 'iniciadaEm'>,
  em: string | null,
): string | null {
  const base = milissegundos(ficha.atendidaEm) ?? milissegundos(ficha.iniciadaEm)
  const instante = milissegundos(em)
  if (base === null || instante === null) return null
  return formatarSegundos((instante - base) / 1000)
}

export function turnosDaFicha(ficha: FichaDaChamada): TurnoDaFicha[] {
  return ficha.turnos.map((turno) => ({
    quem: turno.quem === 'agent' || turno.quem === 'lead' ? turno.quem : 'desconhecido',
    texto: turno.texto,
    instante: instanteNaConversa(ficha, turno.em),
  }))
}

function somarPorMoeda(parcelas: readonly ParcelaDeCusto[]): Valor[] {
  const porMoeda = new Map<string, number>()
  for (const parcela of parcelas) {
    porMoeda.set(parcela.moeda, (porMoeda.get(parcela.moeda) ?? 0) + parcela.centavos)
  }
  return [...porMoeda.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([moeda, centavos]) => ({ moeda, centavos }))
}

/**
 * Os quatro componentes, sempre na mesma ordem. Mais de uma parcela do mesmo
 * componente (dois informantes) se soma, como faz o gatilho que materializa
 * `calls.cost_cents`: a ficha não pode mostrar um total que a soma das linhas
 * não fecha.
 */
export function custoPorComponente(parcelas: readonly ParcelaDeCusto[]): CustoDoComponente[] {
  return COMPONENTES_DE_CUSTO.map((componente) => {
    const doComponente = parcelas.filter((parcela) => parcela.componente === componente)
    return {
      componente,
      valores: doComponente.length === 0 ? null : somarPorMoeda(doComponente),
    }
  })
}

/**
 * O total, uma entrada por moeda. A voz e o modelo chegam em dólar e a
 * telefonia na moeda da conta; somar as duas num número só inventaria um
 * câmbio que ninguém aplicou.
 */
export function totalDoCusto(parcelas: readonly ParcelaDeCusto[]): Valor[] {
  return somarPorMoeda(parcelas)
}

/** Quantos dos quatro componentes ainda esperam preço. */
export function componentesSemPreco(parcelas: readonly ParcelaDeCusto[]): number {
  return custoPorComponente(parcelas).filter((custo) => custo.valores === null).length
}

export function estadoDaClassificacao(
  ficha: Pick<FichaDaChamada, 'status' | 'origemDaClassificacao' | 'turnos'>,
): EstadoDaClassificacao {
  if (ESTADOS_VIVOS.has(ficha.status)) return 'em_andamento'
  if (ficha.origemDaClassificacao !== null) return 'pronta'
  if (ficha.turnos.length === 0) return 'sem_conversa'
  return 'processando'
}

/**
 * A mesma regra de `call-audio`: caminho nulo sem data de expurgo é gravação
 * que nunca houve; caminho nulo com data, ou data vencida, é expurgo. A ficha
 * decide antes de pedir o áudio, para não oferecer um reprodutor que vai
 * receber 410.
 */
export function estadoDaGravacao(
  ficha: Pick<FichaDaChamada, 'caminhoDaGravacao' | 'gravacaoExpiraEm'>,
  agora: string,
): EstadoDaGravacao {
  const caminho = ficha.caminhoDaGravacao?.trim() ?? ''
  const expira = milissegundos(ficha.gravacaoExpiraEm)
  if (expira === null && caminho === '') return { tipo: 'sem_gravacao' }
  const agoraMs = milissegundos(agora) ?? Date.now()
  if (ficha.gravacaoExpiraEm !== null && (caminho === '' || (expira !== null && expira <= agoraMs))) {
    return { tipo: 'expurgada', em: ficha.gravacaoExpiraEm }
  }
  return { tipo: 'disponivel' }
}

/** O aviso de gravação (RF-420). Sem instante registrado, não se presume. */
export function leituraDoAviso(
  ficha: Pick<FichaDaChamada, 'avisoDeGravacaoEm' | 'atendidaEm' | 'iniciadaEm'>,
): LeituraDoAviso {
  const instante = instanteNaConversa(ficha, ficha.avisoDeGravacaoEm)
  return instante === null ? { tipo: 'nao_localizado' } : { tipo: 'localizado', instante }
}

/** O sentimento de -1 a 1 em três faixas, com a fronteira em ±0,2. */
export function faixaDoSentimento(sentimento: number): FaixaDoSentimento {
  if (sentimento < -0.2) return 'negativo'
  if (sentimento > 0.2) return 'positivo'
  return 'neutro'
}

/** O texto de uma chave da classificação, quando é texto. */
export function textoDaClassificacao(
  classificacao: Readonly<Record<string, unknown>>,
  chave: string,
): string | null {
  const valor = Object.hasOwn(classificacao, chave) ? classificacao[chave] : undefined
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

/** Centavos na moeda deles, no formato brasileiro (`R$ 1,20`, `US$ 0,35`). */
export function formatarValor(valor: Valor): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: valor.moeda }).format(
    valor.centavos / 100,
  )
}

/** Número com casas fixas e vírgula decimal (`0,60`, `8,5`). */
export function formatarDecimal(numero: number, casas: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(numero)
}
