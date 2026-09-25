// As decisões puras de `/chamadas` (RF-413): o que a barra de endereço guarda,
// como isso vira o recorte que o serviço recebe, qual dos dois vazios a tela
// mostra, e o mesmo recorte aplicado em memória para o dublê filtrar de
// verdade. Nada aqui toca React nem rede; tudo se prova em `consulta.test.ts`.
//
// Três regras atravessam o arquivo:
//
// 1. **A busca não é o recorte.** A busca guarda o período (`periodo=7d`) e o
//    número como a pessoa digitou; o recorte guarda o instante em ISO e o
//    número normalizado. Link com instante cravado envelhece.
// 2. **O ensaio não entra na lista** (T-16). O ensaio grava em `calls` com
//    `direction = 'rehearsal'`, para reusar transcrição e avaliação. No banco,
//    quem o tira é a visão `chamadas_reais` (US-099), de onde a lista lê; aqui
//    o filtro viaja no recorte (`direcoes`), e é por ele que o dublê, que não
//    roda o banco, tira o ensaio igual.
// 3. **Filtro que a tela não reconhece vira recusa.** `?proposito=venda`
//    escrito à mão não pode cair na lista inteira: quem filtrou veria tudo e
//    acharia que viu o recorte.

import { normalizarTelefone } from '@compartilhado/telefone.ts'
import { PROPOSITOS, type Proposito } from '@compartilhado/playbook/camada-um.ts'

import type {
  ChamadaDaLista,
  OrdenacaoDeChamadas,
  RecorteDeChamadas,
} from '@/chamadas/tipos'

/** Quantas linhas a lista traz, no máximo. Acima disso, o aviso do teto. */
export const TETO_DA_LISTA = 200

/** A lista fechada de `calls.end_reason`, na ordem do seletor. */
export const RESULTADOS = [
  'completed',
  'voicemail',
  'no_answer',
  'busy',
  'invalid_number',
  'transferred',
  'canceled',
  'max_duration',
  'dial_lost',
  'provider_lost',
] as const
export type Resultado = (typeof RESULTADOS)[number]

export type PeriodoDaLista = 'tudo' | '24h' | '7d' | '30d'

export const PERIODOS: readonly PeriodoDaLista[] = ['tudo', '24h', '7d', '30d']

export const ORDENACOES: readonly OrdenacaoDeChamadas[] = ['instante', 'duracao', 'custo']

/** As direções que a lista mostra. O ensaio fica de fora (regra 2). */
export const DIRECOES_DA_LISTA: readonly string[] = ['outbound', 'inbound']

/** Os estados em que a chamada ainda não terminou, como em `call_live`. */
const ESTADOS_EM_CURSO = new Set(['queued', 'ringing', 'in_progress'])

/**
 * O que viaja na barra de endereço. Toda chave sai sempre de `validateSearch`,
 * ainda que indefinida: a busca do match herda a da raiz, e só a atribuição
 * apaga o que veio escrito à mão.
 */
export interface BuscaDeChamadas {
  periodo?: string
  proposito?: string
  resultado?: string
  numero?: string
  ordenacao?: string
}

export const BUSCA_LIMPA: BuscaDeChamadas = {
  periodo: undefined,
  proposito: undefined,
  resultado: undefined,
  numero: undefined,
  ordenacao: undefined,
}

const HORA = 60 * 60 * 1000

const JANELA: Record<Exclude<PeriodoDaLista, 'tudo'>, number> = {
  '24h': 24 * HORA,
  '7d': 7 * 24 * HORA,
  '30d': 30 * 24 * HORA,
}

export type LeituraDaBusca =
  | { ok: true; recorte: RecorteDeChamadas }
  | { ok: false; campo: keyof BuscaDeChamadas }

function daLista<T extends string>(lista: readonly T[], valor: string): T | undefined {
  return lista.find((item) => item === valor)
}

/**
 * O número como a consulta o quer. Número válido vira E.164, que é a única
 * forma que o banco guarda; número incompleto (`11 9999`) segue só com os
 * dígitos, para achar o pedaço. Sem dígito nenhum não há filtro.
 */
export function numeroDaConsulta(texto: string | undefined): string | undefined {
  const bruto = (texto ?? '').trim()
  if (!bruto) return undefined
  const numero = normalizarTelefone(bruto)
  if (numero.ok) return numero.e164
  const digitos = bruto.replace(/\D/g, '')
  return digitos || undefined
}

/**
 * O recorte que o serviço recebe. O relógio entra por parâmetro para o teste
 * fixá-lo; a tela o chama dentro do `queryFn`, no instante em que a consulta
 * sai.
 */
export function recorteDaBusca(
  busca: BuscaDeChamadas,
  agora: () => number = Date.now,
): LeituraDaBusca {
  const periodo = busca.periodo ? daLista(PERIODOS, busca.periodo) : 'tudo'
  if (!periodo) return { ok: false, campo: 'periodo' }

  const proposito: Proposito | undefined = busca.proposito
    ? daLista(PROPOSITOS, busca.proposito)
    : undefined
  if (busca.proposito && !proposito) return { ok: false, campo: 'proposito' }

  const resultado = busca.resultado ? daLista(RESULTADOS, busca.resultado) : undefined
  if (busca.resultado && !resultado) return { ok: false, campo: 'resultado' }

  const ordenacao = busca.ordenacao ? daLista(ORDENACOES, busca.ordenacao) : 'instante'
  if (!ordenacao) return { ok: false, campo: 'ordenacao' }

  const recorte: RecorteDeChamadas = { ordenacao, direcoes: DIRECOES_DA_LISTA }
  if (periodo !== 'tudo') recorte.desde = new Date(agora() - JANELA[periodo]).toISOString()
  if (proposito) recorte.proposito = proposito
  if (resultado) recorte.resultado = resultado
  const numero = numeroDaConsulta(busca.numero)
  if (numero) recorte.numero = numero
  return { ok: true, recorte }
}

/**
 * Se a busca recorta alguma coisa. A ordenação não conta: ela muda a ordem,
 * não o conjunto.
 */
export function temRecorte(busca: BuscaDeChamadas): boolean {
  return Boolean(
    (busca.periodo && busca.periodo !== 'tudo') ||
      busca.proposito ||
      busca.resultado ||
      busca.numero,
  )
}

/**
 * A chave da consulta. Sai da busca, e não do recorte: o recorte carrega um
 * instante, e uma chave nova a cada leitura do relógio seria uma consulta nova
 * a cada desenho.
 */
export function chaveDaBusca(busca: BuscaDeChamadas): readonly string[] {
  return [
    'chamadas',
    busca.periodo ?? 'tudo',
    busca.proposito ?? '',
    busca.resultado ?? '',
    busca.numero ?? '',
    busca.ordenacao ?? 'instante',
  ]
}

export type EstadoDaLista = 'lista' | 'conta-sem-chamada' | 'recorte-sem-resultado'

/** Qual das três telas: a lista, a conta que nunca ligou ou o recorte vazio. */
export function estadoDaLista(quantidade: number, busca: BuscaDeChamadas): EstadoDaLista {
  if (quantidade > 0) return 'lista'
  return temRecorte(busca) ? 'recorte-sem-resultado' : 'conta-sem-chamada'
}

export function estaEmCurso(chamada: Pick<ChamadaDaLista, 'status'>): boolean {
  return ESTADOS_EM_CURSO.has(chamada.status)
}

/** O total em centavos, somado sem olhar a moeda. Só serve para ordenar. */
function custoParaOrdenar(chamada: ChamadaDaLista): number {
  return chamada.parcelas.reduce((soma, parcela) => soma + parcela.centavos, 0)
}

const VALOR_DA_ORDENACAO: Record<
  OrdenacaoDeChamadas,
  (chamada: ChamadaDaLista) => number
> = {
  instante: (chamada) => Date.parse(chamada.iniciadaEm) || 0,
  // Sem duração medida vai para o fim, como `nulls last` na consulta.
  duracao: (chamada) => chamada.duracaoSeg ?? -1,
  custo: custoParaOrdenar,
}

/**
 * O recorte aplicado em memória, com a ordenação e o teto: é como o dublê
 * responde, para o teste de tela provar que a tela pediu o recorte certo e que
 * a lista encolheu. A consulta do Supabase faz o mesmo no banco.
 */
export function aplicarRecorte(
  chamadas: readonly ChamadaDaLista[],
  recorte: RecorteDeChamadas,
  teto: number = TETO_DA_LISTA,
): { chamadas: ChamadaDaLista[]; truncada: boolean } {
  const desde = recorte.desde ? Date.parse(recorte.desde) : null
  const valor = VALOR_DA_ORDENACAO[recorte.ordenacao]

  const filtradas = chamadas
    .filter((chamada) => recorte.direcoes.includes(chamada.direcao))
    .filter((chamada) => desde === null || Date.parse(chamada.iniciadaEm) >= desde)
    .filter((chamada) => !recorte.proposito || chamada.proposito === recorte.proposito)
    .filter((chamada) => !recorte.resultado || chamada.motivoDoFim === recorte.resultado)
    .filter((chamada) => !recorte.numero || (chamada.numero ?? '').includes(recorte.numero))
    .sort((a, b) => {
      const diferenca = valor(b) - valor(a)
      if (diferenca !== 0) return diferenca
      // Desempate pelo mais recente, e depois pelo id em comparação crua.
      const instante = VALOR_DA_ORDENACAO.instante(b) - VALOR_DA_ORDENACAO.instante(a)
      if (instante !== 0) return instante
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  return { chamadas: filtradas.slice(0, teto), truncada: filtradas.length > teto }
}
