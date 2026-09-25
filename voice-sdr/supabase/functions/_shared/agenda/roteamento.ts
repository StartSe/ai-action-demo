// Para quem vai a reunião que a Sarah marca (RF-506, L-16).
//
// Módulo portável (`_shared/`): sem Deno, sem rede, sem banco e sem relógio.
// `agora` entra por parâmetro, a lista de candidatos é dado — quem consulta é
// quem chama —, e a saída é decisão, nunca escrita.
//
// Três decisões atravessam o arquivo:
//
// 1. **Excluir vem antes de rotear.** Especialista desligado e especialista
//    sem faixa de disponibilidade no horizonte saem da lista nos três modos,
//    antes de o modo ser aplicado. Um modo que escolhesse gente inapta
//    devolveria alguém para quem `gerarHorarios` não acharia horário nenhum, e
//    a recusa apareceria uma camada depois, sem nome.
// 2. **O rodízio é determinístico.** A ordem é `last_assigned_at` mais antigo
//    primeiro, nulo antes de todos, empate pelo id. Sorteio transformaria o
//    teste em loteria e a distribuição de carga em boato — que é exatamente a
//    lacuna que RF-506 aponta na referência, onde `routing_weight` filtra por
//    área e não distribui nada.
// 3. **Este módulo decide, não grava.** Avançar `specialists.last_assigned_at`
//    é de `agendar_reuniao` (US-161), na mesma transação do agendamento.
//    Resolver o rodízio com um efeito colateral aqui faria a marca avançar a
//    cada consulta de horário, e a distribuição passaria a depender de quem
//    olhou a agenda, não de quem recebeu reunião.

import { diasDaSemanaNoHorizonte, type FaixaDeDisponibilidade } from './horarios.ts'

/** `account_settings.routing_mode`. */
export type ModoDeRoteamento = 'area' | 'round_robin' | 'fixed'

/** O que da linha de `specialists` decide se ela pode receber esta reunião. */
export interface EspecialistaCandidato {
  id: string
  /** `specialists.area`, nulo em conta que roteia por rodízio ou por fixo. */
  area: string | null
  /** `specialists.active`. */
  ativo: boolean
  /** `specialists.timezone` (T-21): o fuso em que a faixa semanal é lida. */
  fuso: string
  /** `max_notice_days`: até onde o horizonte deste especialista alcança. */
  antecedenciaMaximaDias: number
  /** As faixas de `specialist_availability` dele. */
  disponibilidade: FaixaDeDisponibilidade[]
  /** `specialists.last_assigned_at`, nulo em quem nunca recebeu reunião. */
  ultimaAtribuicaoEm: string | null
}

export interface EntradaDeRoteamento {
  modo: ModoDeRoteamento
  /** Os especialistas da conta. Filtrar por conta é de quem consulta. */
  candidatos: EspecialistaCandidato[]
  /** A área do lead. Dado do lead, e por isso chega em qualquer modo. */
  areaPedida?: string | null
  /** `account_settings.fixed_specialist_id`. Configuração, não dado do lead. */
  especialistaFixo?: string | null
  /** Instante ISO-8601 de agora. O módulo não lê relógio. */
  agora: string
}

/**
 * Por que um candidato saiu antes de o modo ser aplicado. `inativo` ganha de
 * `sem_disponibilidade` porque quem está desligado não tem agenda que importe:
 * a ação é religar a pessoa, não abrir horário para ela.
 */
export type MotivoDeExclusao = 'inativo' | 'sem_disponibilidade'

export interface CandidatoExcluido {
  id: string
  motivo: MotivoDeExclusao
}

/**
 * Por que a conta não roteou ninguém. A frase para a Sarah é da borda, como o
 * código do banco: aqui sai o motivo, e quem o traduz sabe para quem fala.
 * L-24 lê a mesma lista do outro lado, para abrir "reunião sem especialista" na
 * fila de exceções.
 *
 * `especialista_fixo_inativo` cobre também o destino que não está na lista de
 * candidatos: para quem lê, "a pessoa configurada não pode receber esta
 * reunião" é a mesma frase e a mesma ação, e o id que não existe mais é uma
 * configuração tão quebrada quanto a pessoa desligada.
 */
export type MotivoDeRecusaDeRoteamento =
  | 'sem_disponibilidade'
  | 'especialista_fixo_inativo'
  | 'sem_especialista_na_area'

export interface RoteamentoFeito {
  roteou: true
  /** Os aptos que o modo escolheu, o preferido primeiro. */
  escolhidos: EspecialistaCandidato[]
  descartados: CandidatoExcluido[]
}

export interface RoteamentoRecusado {
  roteou: false
  motivo: MotivoDeRecusaDeRoteamento
  descartados: CandidatoExcluido[]
}

export type ResultadoDeRoteamento = RoteamentoFeito | RoteamentoRecusado

/**
 * Quem pode receber esta reunião, na ordem em que o modo os prefere.
 *
 * A entrada não é tocada: os objetos devolvidos são os mesmos que entraram, e
 * nenhuma marca avança aqui.
 */
export function escolherEspecialista(entrada: EntradaDeRoteamento): ResultadoDeRoteamento {
  const { modo, candidatos, agora } = entrada
  conferirModo(modo)
  const especialistaFixo = conferirDestinoDoModo(modo, entrada.especialistaFixo)

  const descartados: CandidatoExcluido[] = []
  const aptos: EspecialistaCandidato[] = []
  const horizontes = new Map<string, Set<number>>()

  for (const candidato of candidatos) {
    // A marca se confere na entrada, e não no comparador: com um candidato só,
    // `sort` nunca chama o comparador, e uma marca ilegível passaria calada
    // para virar ordem de chegada no dia em que aparecesse um segundo.
    marcaDe(candidato)
    const motivo = exclusaoDe(candidato, agora, horizontes)
    if (motivo) descartados.push({ id: candidato.id, motivo })
    else aptos.push(candidato)
  }

  const escolhidos = aplicarModo(modo, aptos, entrada.areaPedida, especialistaFixo)
  if (escolhidos.length > 0) return { roteou: true, escolhidos, descartados }

  const motivo = recusaDe({ modo, temApto: aptos.length > 0 })
  if (!motivo) throw new Error(`o modo ${modo} recusou sem motivo`)
  return { roteou: false, motivo, descartados }
}

// Exclusão ---------------------------------------------------------------------

/**
 * A conferência em ordem, e portanto a precedência quando as duas causas
 * coexistem. Como em `horarios.ts`, a ordem mora aqui e em nenhum outro lugar:
 * espalhada por `if` pelo corpo, ela viraria ordem de escrita e mudaria sem
 * ninguém decidir nada.
 */
function exclusaoDe(
  candidato: EspecialistaCandidato,
  agora: string,
  horizontes: Map<string, Set<number>>,
): MotivoDeExclusao | null {
  if (!candidato.ativo) return 'inativo'
  return temFaixaNoHorizonte(candidato, agora, horizontes) ? null : 'sem_disponibilidade'
}

/**
 * Se alguma faixa semanal dele cai num dia que o horizonte alcança.
 *
 * O horizonte é o dele, não o da conta: `max_notice_days` é coluna de
 * `specialists` justamente porque cada um responde até onde quer. Quem só
 * atende às quartas e aceita dois dias de antecedência não é candidato numa
 * quinta-feira — e oferecê-lo assim mesmo empurraria a recusa para
 * `gerarHorarios`, que devolveria lista vazia sem saber dizer de quem.
 *
 * A duração da faixa não se confere aqui: o banco já recusa faixa sem duração
 * (`specialist_availability`), e quem mede a sobra que comporta a reunião é
 * `gerarHorarios`. Esta pergunta é só "ele atende neste dia da semana".
 */
function temFaixaNoHorizonte(
  candidato: EspecialistaCandidato,
  agora: string,
  horizontes: Map<string, Set<number>>,
): boolean {
  if (candidato.disponibilidade.length === 0) return false

  const chave = `${encodeURIComponent(candidato.fuso)}|${candidato.antecedenciaMaximaDias}`
  let horizonte = horizontes.get(chave)
  if (!horizonte) {
    horizonte = diasDaSemanaNoHorizonte(candidato.fuso, agora, candidato.antecedenciaMaximaDias)
    horizontes.set(chave, horizonte)
  }

  return candidato.disponibilidade.some((faixa) => {
    if (!Number.isInteger(faixa.diaDaSemana) || faixa.diaDaSemana < 0 || faixa.diaDaSemana > 6) {
      throw new Error(`dia da semana fora de 0..6: ${faixa.diaDaSemana}`)
    }
    return horizonte.has(faixa.diaDaSemana)
  })
}

// Modos ------------------------------------------------------------------------

function aplicarModo(
  modo: ModoDeRoteamento,
  aptos: EspecialistaCandidato[],
  areaPedida: string | null | undefined,
  especialistaFixo: string | null,
): EspecialistaCandidato[] {
  if (modo === 'fixed') {
    // Um, e só ele. Cair de volta no rodízio quando o configurado não está
    // apto é o engano que `account_settings_destino_do_modo` evita no banco: a
    // tela continuaria dizendo "fixo" e a reunião iria para outra pessoa.
    return aptos.filter((candidato) => candidato.id === especialistaFixo)
  }

  if (modo === 'area') {
    // Área do lead ausente não casa com área nenhuma. Devolver todos aqui seria
    // rodízio disfarçado de roteamento por área.
    const pedida = normalizar(areaPedida)
    const daArea = pedida === null ? [] : aptos.filter((c) => normalizar(c.area) === pedida)
    // Dentro da área este modo não escolhe: devolve todos os aptos, e a ordem é
    // estável por id só para a saída ser reprodutível. Distribuir carga é o que
    // `round_robin` faz, e é o modo que a conta escolhe quando quer isso —
    // RF-506 registra que a referência filtrava por área e não distribuía nada.
    return [...daArea].sort(ordemDeId)
  }

  return [...aptos].sort(ordemDeRodizio)
}

/**
 * Rodízio: quem esperou mais vai primeiro. Nulo antes de todos, porque quem
 * nunca recebeu reunião esperou desde sempre.
 *
 * O empate se resolve pelo id, em comparação de texto crua. `localeCompare`
 * depende do ICU da máquina, e a mesma conta ordenaria diferente em dois
 * ambientes — que é o mesmo defeito do sorteio, só mais difícil de ver.
 */
function ordemDeRodizio(a: EspecialistaCandidato, b: EspecialistaCandidato): number {
  const marcaA = marcaDe(a)
  const marcaB = marcaDe(b)
  if (marcaA === null && marcaB !== null) return -1
  if (marcaA !== null && marcaB === null) return 1
  if (marcaA !== null && marcaB !== null && marcaA !== marcaB) return marcaA - marcaB
  return ordemDeId(a, b)
}

function ordemDeId(a: EspecialistaCandidato, b: EspecialistaCandidato): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

function marcaDe(candidato: EspecialistaCandidato): number | null {
  if (candidato.ultimaAtribuicaoEm === null) return null
  const ts = Date.parse(candidato.ultimaAtribuicaoEm)
  if (Number.isNaN(ts)) {
    throw new Error(`ultimaAtribuicaoEm não é instante ISO-8601: ${candidato.ultimaAtribuicaoEm}`)
  }
  return ts
}

// Recusa -----------------------------------------------------------------------

interface Conferencia {
  modo: ModoDeRoteamento
  temApto: boolean
}

/**
 * Os motivos em ordem, e portanto a precedência. Ganha sempre o que leva a uma
 * resposta diferente de quem lê: `sem_disponibilidade` diz que não há para quem
 * rotear em modo nenhum, e trocar o modo não resolveria; os outros dois dizem
 * que há gente apta e que é a configuração ou a área que não fecha.
 *
 * A distinção entre "estava desligado" e "não tem hora" não se perde: ela está
 * em `descartados`, candidato a candidato, que é de onde a tela tira o que
 * dizer a quem administra a conta.
 */
const RECUSAS: readonly {
  motivo: MotivoDeRecusaDeRoteamento
  recusa: (c: Conferencia) => boolean
}[] = [
  { motivo: 'sem_disponibilidade', recusa: (c) => !c.temApto },
  { motivo: 'especialista_fixo_inativo', recusa: (c) => c.modo === 'fixed' },
  { motivo: 'sem_especialista_na_area', recusa: (c) => c.modo === 'area' },
]

function recusaDe(conferencia: Conferencia): MotivoDeRecusaDeRoteamento | null {
  for (const { motivo, recusa } of RECUSAS) if (recusa(conferencia)) return motivo
  return null
}

// Conferências da entrada --------------------------------------------------------

const MODOS: readonly ModoDeRoteamento[] = ['area', 'round_robin', 'fixed']

function conferirModo(modo: ModoDeRoteamento): void {
  if (!MODOS.includes(modo)) throw new Error(`modo de roteamento desconhecido: ${modo}`)
}

/**
 * `fixed` tem destino e os outros dois não têm — a mesma igualdade que
 * `account_settings_destino_do_modo` cobra no banco, cobrada aqui para que a
 * configuração que o banco recusa não passe por outro caminho e caia calada no
 * modo errado.
 */
function conferirDestinoDoModo(
  modo: ModoDeRoteamento,
  especialistaFixo: string | null | undefined,
): string | null {
  const destino = especialistaFixo ?? null
  if (modo === 'fixed' && destino === null) {
    throw new Error('modo fixed sem especialistaFixo: o destino do modo é obrigatório')
  }
  if (modo !== 'fixed' && destino !== null) {
    throw new Error(`modo ${modo} com especialistaFixo: destino que ninguém honra`)
  }
  return destino
}

/** Área comparada como o unique de `specialists` compara nome: sem caixa e sem borda. */
function normalizar(area: string | null | undefined): string | null {
  if (typeof area !== 'string') return null
  const limpa = area.trim().toLowerCase()
  return limpa === '' ? null : limpa
}
