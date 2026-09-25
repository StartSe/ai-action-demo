// As decisões puras de `/reunioes` (US-179, RF-510): o que a barra de endereço
// guarda, como isso vira o recorte que o serviço recebe, a semana da agenda no
// fuso da conta e o mesmo recorte aplicado em memória para o dublê filtrar de
// verdade. Nada aqui toca React nem rede; tudo se prova em `consulta.test.ts`.
//
// Quatro regras atravessam o arquivo:
//
// 1. **A busca não é o recorte.** A busca guarda o período por nome
//    (`periodo=hoje`) e a semana por deslocamento (`semana=1`); o recorte
//    guarda os instantes em ISO. Link com instante cravado envelhece.
// 2. **O dia é o da conta.** "Hoje" e "esta semana" começam à meia-noite no
//    fuso da conta, e a conta de fuso é de `_shared/agenda/horarios.ts`, a
//    mesma que gera os horários que a Sarah oferece. Uma segunda conversão
//    aqui seria uma segunda verdade.
// 3. **O ensaio não entra** (T-16). No banco, quem o tira é a visão
//    `reunioes_reais`; aqui o filtro viaja no recorte (`origens`), e é por ele
//    que o dublê, que não roda o banco, tira o ensaio igual.
// 4. **Filtro que a tela não reconhece vira recusa.** `?estado=perdida`
//    escrito à mão não pode cair na agenda inteira.

import { instanteDoRelogio, relogioEm } from '@compartilhado/agenda/horarios.ts'

import { MODALIDADES, type Modalidade } from '@/especialistas/tipos'
import {
  ESTADOS_DA_REUNIAO,
  type EspecialistaDaAgenda,
  type EstadoDaReuniao,
  type OrigemDaReuniao,
  type RecorteDeReunioes,
  type ReuniaoDaLista,
} from '@/reunioes/tipos'

/** Quantas reuniões a consulta traz, no máximo. Acima disso, o aviso do teto. */
export const TETO_DA_LISTA = 200

/** As origens que a tela mostra. O ensaio fica de fora (regra 3). */
export const ORIGENS_DA_LISTA: readonly OrigemDaReuniao[] = ['ligacao', 'manual']

export const VISOES = ['agenda', 'lista'] as const
export type VisaoDasReunioes = (typeof VISOES)[number]

export const PERIODOS = [
  'proximas',
  'hoje',
  'proximos-7d',
  'ultimos-7d',
  'ultimos-30d',
  'tudo',
] as const
export type PeriodoDasReunioes = (typeof PERIODOS)[number]

/** O período de quem abre a lista sem escolher: daqui para a frente. */
export const PERIODO_PADRAO: PeriodoDasReunioes = 'proximas'

/**
 * O que viaja na barra de endereço. Toda chave sai sempre de `validateSearch`,
 * ainda que indefinida: a busca do match herda a da raiz, e só a atribuição
 * apaga o que veio escrito à mão.
 */
export interface BuscaDeReunioes {
  vista?: string
  periodo?: string
  semana?: string
  especialista?: string
  estado?: string
  modalidade?: string
}

export const BUSCA_LIMPA: BuscaDeReunioes = {
  vista: undefined,
  periodo: undefined,
  semana: undefined,
  especialista: undefined,
  estado: undefined,
  modalidade: undefined,
}

const DIA = 24 * 60 * 60 * 1000

/** Deslocamento da semana: `-1` é a anterior. Três dígitos bastam para anos. */
const DESLOCAMENTO = /^-?\d{1,3}$/

/** Especialista é uuid; o que não tiver essa forma nunca casaria com linha nenhuma. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function daLista<T extends string>(lista: readonly T[], valor: string): T | undefined {
  return lista.find((item) => item === valor)
}

/** A data civil de um dia contado desde a época (o `diaCivil` de `relogioEm`). */
function dataDoDiaCivil(diaCivil: number): { ano: number; mes: number; dia: number } {
  const data = new Date(diaCivil * DIA)
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() }
}

/** O instante em que o dia civil começa no fuso. */
function inicioDoDia(fuso: string, diaCivil: number): number {
  return instanteDoRelogio(fuso, dataDoDiaCivil(diaCivil), 0)
}

export interface SemanaDaAgenda {
  /** Os sete dias civis, de segunda a domingo. */
  dias: readonly number[]
  desde: string
  ate: string
}

/**
 * A semana da agenda no fuso da conta, de segunda a domingo, deslocada de
 * `deslocamento` semanas a partir da que contém `agora`.
 */
export function semanaDaAgenda(fuso: string, agora: number, deslocamento: number): SemanaDaAgenda {
  const hoje = relogioEm(agora, fuso)
  // `diaDaSemana` é 0 no domingo: a segunda fica seis dias antes dele.
  const segunda = hoje.diaCivil - ((hoje.diaDaSemana + 6) % 7) + deslocamento * 7
  const dias = Array.from({ length: 7 }, (_, indice) => segunda + indice)
  return {
    dias,
    desde: new Date(inicioDoDia(fuso, segunda)).toISOString(),
    ate: new Date(inicioDoDia(fuso, segunda + 7)).toISOString(),
  }
}

/** Onde o período começa e acaba, em dias civis a partir de hoje. */
const JANELA: Record<PeriodoDasReunioes, { desde?: number; ate?: number; crescente: boolean }> = {
  proximas: { desde: 0, crescente: true },
  hoje: { desde: 0, ate: 1, crescente: true },
  'proximos-7d': { desde: 0, ate: 7, crescente: true },
  // O passado se lê do mais recente para trás: é o que alguém procura primeiro.
  'ultimos-7d': { desde: -7, ate: 0, crescente: false },
  'ultimos-30d': { desde: -30, ate: 0, crescente: false },
  tudo: { crescente: false },
}

export type LeituraDaBusca =
  | { ok: true; visao: VisaoDasReunioes; recorte: RecorteDeReunioes; semana: SemanaDaAgenda | null }
  | { ok: false; campo: keyof BuscaDeReunioes }

/**
 * O recorte que o serviço recebe. Na agenda, o período é a semana escolhida;
 * na lista, é o período nomeado. O relógio entra por parâmetro para o teste
 * fixá-lo; a tela o chama dentro do `queryFn`, no instante em que a consulta
 * sai.
 */
export function recorteDaBusca(
  busca: BuscaDeReunioes,
  fusoDaConta: string,
  agora: () => number = Date.now,
): LeituraDaBusca {
  const visao = busca.vista ? daLista(VISOES, busca.vista) : 'agenda'
  if (!visao) return { ok: false, campo: 'vista' }

  const periodo = busca.periodo ? daLista(PERIODOS, busca.periodo) : PERIODO_PADRAO
  if (!periodo) return { ok: false, campo: 'periodo' }

  if (busca.semana !== undefined && !DESLOCAMENTO.test(busca.semana)) {
    return { ok: false, campo: 'semana' }
  }

  if (busca.especialista !== undefined && !UUID.test(busca.especialista)) {
    return { ok: false, campo: 'especialista' }
  }

  const estado: EstadoDaReuniao | undefined = busca.estado
    ? daLista(ESTADOS_DA_REUNIAO, busca.estado)
    : undefined
  if (busca.estado && !estado) return { ok: false, campo: 'estado' }

  const modalidade: Modalidade | undefined = busca.modalidade
    ? daLista(MODALIDADES, busca.modalidade)
    : undefined
  if (busca.modalidade && !modalidade) return { ok: false, campo: 'modalidade' }

  const instante = agora()
  const recorte: RecorteDeReunioes = { crescente: true, origens: ORIGENS_DA_LISTA }
  let semana: SemanaDaAgenda | null = null

  if (visao === 'agenda') {
    semana = semanaDaAgenda(fusoDaConta, instante, Number(busca.semana ?? 0))
    recorte.desde = semana.desde
    recorte.ate = semana.ate
  } else {
    const janela = JANELA[periodo]
    const hoje = relogioEm(instante, fusoDaConta).diaCivil
    recorte.crescente = janela.crescente
    if (janela.desde !== undefined) {
      recorte.desde = new Date(inicioDoDia(fusoDaConta, hoje + janela.desde)).toISOString()
    }
    if (janela.ate !== undefined) {
      recorte.ate = new Date(inicioDoDia(fusoDaConta, hoje + janela.ate)).toISOString()
    }
  }

  if (busca.especialista) recorte.especialistaId = busca.especialista
  if (estado) recorte.estado = estado
  if (modalidade) recorte.modalidade = modalidade
  return { ok: true, visao, recorte, semana }
}

/**
 * A chave da consulta. Sai da busca e do fuso, e não do recorte: o recorte
 * carrega instantes, e uma chave nova a cada leitura do relógio seria uma
 * consulta nova a cada desenho.
 */
export function chaveDaBusca(busca: BuscaDeReunioes, fusoDaConta: string): readonly string[] {
  return [
    'reunioes',
    fusoDaConta,
    busca.vista ?? 'agenda',
    busca.periodo ?? PERIODO_PADRAO,
    busca.semana ?? '0',
    busca.especialista ?? '',
    busca.estado ?? '',
    busca.modalidade ?? '',
  ]
}

/**
 * O recorte aplicado em memória, com a ordem e o teto: é como o dublê
 * responde, para o teste de tela provar que a tela pediu o recorte certo e que
 * a lista encolheu. A consulta do Supabase faz o mesmo no banco.
 */
export function aplicarRecorte(
  reunioes: readonly ReuniaoDaLista[],
  recorte: RecorteDeReunioes,
  teto: number = TETO_DA_LISTA,
): { reunioes: ReuniaoDaLista[]; truncada: boolean } {
  const desde = recorte.desde ? Date.parse(recorte.desde) : null
  const ate = recorte.ate ? Date.parse(recorte.ate) : null

  const filtradas = reunioes
    .filter((reuniao) => recorte.origens.includes(reuniao.origem))
    .filter((reuniao) => desde === null || Date.parse(reuniao.inicio) >= desde)
    .filter((reuniao) => ate === null || Date.parse(reuniao.inicio) < ate)
    .filter((reuniao) => !recorte.especialistaId || reuniao.especialista.id === recorte.especialistaId)
    .filter((reuniao) => !recorte.estado || reuniao.estado === recorte.estado)
    .filter((reuniao) => !recorte.modalidade || reuniao.modalidade === recorte.modalidade)
    .sort((a, b) => {
      const diferenca = Date.parse(a.inicio) - Date.parse(b.inicio)
      if (diferenca !== 0) return recorte.crescente ? diferenca : -diferenca
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  return { reunioes: filtradas.slice(0, teto), truncada: filtradas.length > teto }
}

/** O relógio de parede de um instante num fuso, como a agenda o desenha. */
export function relogioDaReuniao(instante: string, fuso: string) {
  return relogioEm(instante, fuso)
}

/**
 * As linhas da agenda: os especialistas do filtro, os ativos e, entre os
 * desligados, só quem tem reunião na semana — a reunião de quem saiu continua
 * sendo trabalho de alguém.
 */
export function especialistasDaAgenda(
  especialistas: readonly EspecialistaDaAgenda[],
  reunioes: readonly ReuniaoDaLista[],
  especialistaId: string | undefined,
): EspecialistaDaAgenda[] {
  const comReuniao = new Set(reunioes.map((reuniao) => reuniao.especialista.id))
  return especialistas
    .filter((especialista) => !especialistaId || especialista.id === especialistaId)
    .filter((especialista) => especialista.ativo || comReuniao.has(especialista.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * As reuniões de um especialista distribuídas pelos sete dias da semana, lidos
 * no fuso da conta. A ordem dentro do dia é a do horário.
 */
export function reunioesPorDia(
  reunioes: readonly ReuniaoDaLista[],
  especialistaId: string,
  semana: SemanaDaAgenda,
  fusoDaConta: string,
): ReuniaoDaLista[][] {
  const primeiro = semana.dias[0] ?? 0
  const dias: ReuniaoDaLista[][] = semana.dias.map(() => [])
  for (const reuniao of reunioes) {
    if (reuniao.especialista.id !== especialistaId) continue
    const indice = relogioEm(reuniao.inicio, fusoDaConta).diaCivil - primeiro
    dias[indice]?.push(reuniao)
  }
  for (const dia of dias) dia.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  return dias
}

/** A data civil de um dia da semana da agenda, para o cabeçalho. */
export function dataDoDia(diaCivil: number): { ano: number; mes: number; dia: number; diaDaSemana: number } {
  const data = new Date(diaCivil * DIA)
  return { ...dataDoDiaCivil(diaCivil), diaDaSemana: data.getUTCDay() }
}
