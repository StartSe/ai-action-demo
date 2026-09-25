// A política de retentativa por resultado da ligação (RF-417, quinto critério
// de aceite da F6).
//
// A ligação que não virou conversa vira uma próxima tentativa, e o que decide
// quando é o resultado dela:
//
// - **sem atendimento**: nova tentativa depois do recuo da política, que cresce
//   com a tentativa (`retry_backoff_minutes`, um valor por tentativa, o último
//   se repete);
// - **ocupado**: recuo curto (`retry_busy_minutes`), porque quem está no
//   telefone agora provavelmente estará livre daqui a pouco;
// - **caixa postal**: OUTRO TURNO do dia. Quem não atende às 10h costuma estar
//   em reunião de manhã inteira, e ligar de novo às 11h cai na mesma caixa. No
//   último turno do dia, vai para o primeiro turno do próximo dia útil;
// - **número inválido**: nada. Ligar de novo para número que não existe é
//   gastar tentativa e crédito para ouvir a mesma operadora.
//
// Quatro decisões atravessam o arquivo:
//
// 1. **Turno é dado, não `if`.** A conta declara os turnos (`retry_shifts`) com
//    início e fim; o módulo só escolhe. Os dias úteis são os dias que a janela
//    de discagem da conta tem (`dialing_window`): dia em que a conta não disca
//    não é dia de retentativa.
// 2. **A janela de discagem não é conferida aqui.** A decisão devolve o horário
//    candidato e o turno; quem recusa de fato é `guard_dial`, no momento da
//    discagem (seção 6). Conferir a janela nos dois lugares seria a segunda
//    verdade sobre a mesma regra, e a primeira a divergir seria a daqui.
// 3. **A regra vive também no banco**, em `public.decidir_retentativa`, porque
//    `reprogramar_tentativa` aplica a política na mesma transação em que
//    enfileira (US-189). A ponte é `casos-de-retentativa.ts`: uma tabela de
//    casos, exercitada por este módulo em `test:unit` e pela função SQL em
//    PGlite. Divergência reprova dos dois lados.
// 4. **Motivo é código, nunca frase.** A frase mora em `app/src/copy/` e nas
//    falas do servidor.
//
// O-04 da revisão técnica: a DETECÇÃO de secretária eletrônica é da F2
// (`voicemail_detection` grava `answered_by = 'machine'` e
// `end_reason = 'voicemail'`). O que a F6 entrega é a REPROGRAMAÇÃO a partir
// desse resultado; este módulo não detecta nada.
//
// Módulo portável (`_shared/`): sem Deno, sem rede e sem banco. O relógio
// entra por parâmetro e o fuso do lead vem resolvido de fora (`resolverFuso`,
// com o DDD de `_shared/ddd.ts` já aplicado na entrada do lead).

import {
  diaDaSemanaDe,
  diaSeguinte,
  instanteDeHoraLocal,
  paraIso,
  partesEm,
  type DataLocal,
} from '../discagem/janela.ts'

/** Os resultados que reprogramam ou recusam, como códigos. */
export const RESULTADOS_DE_RETENTATIVA = ['sem_atendimento', 'ocupado', 'caixa_postal', 'numero_invalido'] as const
export type ResultadoDaLigacao = (typeof RESULTADOS_DE_RETENTATIVA)[number]

export type MotivoDaRetentativa =
  | ResultadoDaLigacao
  | 'teto_de_tentativas'
  | 'fora_de_turno'

/** Um turno de `account_settings.retry_shifts`, com as chaves da coluna. */
export interface TurnoDeRetentativa {
  readonly name: string
  readonly start: string
  readonly end: string
}

export interface PoliticaDeRetentativa {
  /** `retry_max_attempts`: quantas tentativas a discagem tem ao todo. */
  readonly tetoDeTentativas: number
  /** `retry_backoff_minutes`: a espera depois da tentativa n é o n-ésimo; o último se repete. */
  readonly recuosEmMinutos: readonly number[]
  /** `retry_busy_minutes`. */
  readonly recuoOcupadoEmMinutos: number
  /** Os dias da semana (0 é domingo) em que a janela de discagem abre. */
  readonly diasUteis: readonly number[]
}

export interface PedidoDeRetentativa {
  readonly resultado: ResultadoDaLigacao
  /** A tentativa que acabou de falhar, a partir de 1. */
  readonly tentativa: number
  readonly politica: PoliticaDeRetentativa
  readonly agora?: () => number
  readonly fusoDoLead: string
  readonly turnos: readonly TurnoDeRetentativa[]
}

export type DecisaoDeRetentativa =
  | {
      readonly reprogramar: true
      /** ISO-8601 em UTC, sem milissegundo. */
      readonly quando: string
      /** O `name` do turno em que a próxima tentativa cai. */
      readonly turno: string
      readonly motivo: ResultadoDaLigacao
    }
  | { readonly reprogramar: false; readonly motivo: MotivoDaRetentativa }

/**
 * O resultado da ligação a partir de `calls.end_reason`. Os outros motivos de
 * fim não são desta política: `dial_lost` e `provider_lost` têm a reprogramação
 * da varredura (`reprogramar_chamada_perdida`), e conversa que aconteceu não se
 * repete.
 */
export function resultadoDoFim(endReason: string | null | undefined): ResultadoDaLigacao | null {
  switch (endReason) {
    case 'no_answer':
      return 'sem_atendimento'
    case 'busy':
      return 'ocupado'
    case 'voicemail':
      return 'caixa_postal'
    case 'invalid_number':
      return 'numero_invalido'
    default:
      return null
  }
}

const MINUTO_MS = 60_000
const HORA_DO_RELOGIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

interface TurnoLido {
  readonly nome: string
  /** Segundos do dia. */
  readonly inicio: number
  readonly fim: number
}

/** Decide. Nunca devolve nulo, e entrada malformada é exceção (defeito de quem chama). */
export function decidirRetentativa(pedido: PedidoDeRetentativa): DecisaoDeRetentativa {
  const { resultado, tentativa, politica, fusoDoLead } = pedido
  if (!RESULTADOS_DE_RETENTATIVA.includes(resultado)) {
    throw new RangeError(`resultado desconhecido: ${String(resultado)}`)
  }
  if (!Number.isInteger(tentativa) || tentativa < 1) {
    throw new RangeError(`tentativa precisa ser inteiro a partir de 1, e veio ${tentativa}`)
  }
  conferirPolitica(politica)
  const turnos = lerTurnos(pedido.turnos)
  const agora = (pedido.agora ?? Date.now)()

  if (resultado === 'numero_invalido') return { reprogramar: false, motivo: 'numero_invalido' }
  if (tentativa >= politica.tetoDeTentativas) return { reprogramar: false, motivo: 'teto_de_tentativas' }

  const dias = new Set(politica.diasUteis)
  if (turnos.length === 0 || dias.size === 0) return { reprogramar: false, motivo: 'fora_de_turno' }

  let escolha: { instante: number; turno: TurnoLido } | null
  if (resultado === 'caixa_postal') {
    escolha = outroTurno(agora, fusoDoLead, turnos, dias)
  } else {
    const recuo = resultado === 'ocupado'
      ? politica.recuoOcupadoEmMinutos
      : politica.recuosEmMinutos[Math.min(tentativa, politica.recuosEmMinutos.length) - 1]!
    escolha = encaixar(agora + recuo * MINUTO_MS, fusoDoLead, turnos, dias)
  }

  if (!escolha) return { reprogramar: false, motivo: 'fora_de_turno' }
  return {
    reprogramar: true,
    quando: paraIso(Math.floor(escolha.instante / 1000) * 1000),
    turno: escolha.turno.nome,
    motivo: resultado,
  }
}

/**
 * O turno em que o instante cai, ou o começo do próximo turno depois dele.
 * Dentro de um turno, o próprio instante.
 */
function encaixar(
  instante: number,
  fuso: string,
  turnos: readonly TurnoLido[],
  dias: ReadonlySet<number>,
): { instante: number; turno: TurnoLido } | null {
  const partes = partesEm(fuso, instante)
  const segundos = partes.hora * 3600 + partes.minuto * 60 + partes.segundo
  const hoje: DataLocal = { ano: partes.ano, mes: partes.mes, dia: partes.dia }
  if (dias.has(diaDaSemanaDe(hoje))) {
    const dentro = turnos.find((t) => segundos >= t.inicio && segundos < t.fim)
    if (dentro) return { instante, turno: dentro }
  }
  return proximoComeco(hoje, segundos, fuso, turnos, dias)
}

/**
 * Caixa postal: o começo do próximo turno diferente do turno de agora. Fora de
 * qualquer turno, o próximo que começa; no último do dia, o primeiro do
 * próximo dia útil.
 */
function outroTurno(
  agora: number,
  fuso: string,
  turnos: readonly TurnoLido[],
  dias: ReadonlySet<number>,
): { instante: number; turno: TurnoLido } | null {
  const partes = partesEm(fuso, agora)
  const segundos = partes.hora * 3600 + partes.minuto * 60 + partes.segundo
  const hoje: DataLocal = { ano: partes.ano, mes: partes.mes, dia: partes.dia }
  const atual = dias.has(diaDaSemanaDe(hoje))
    ? turnos.find((t) => segundos >= t.inicio && segundos < t.fim)
    : undefined
  // Dentro de um turno, o próximo começa no fim dele ou depois: procurar a
  // partir do fim garante que o escolhido é outro, mesmo com turnos colados.
  return proximoComeco(hoje, atual ? atual.fim - 1 : segundos, fuso, turnos, dias)
}

/** O primeiro começo de turno estritamente depois de `segundos` em `dia`, ou nos dias seguintes. */
function proximoComeco(
  dia: DataLocal,
  segundos: number,
  fuso: string,
  turnos: readonly TurnoLido[],
  dias: ReadonlySet<number>,
): { instante: number; turno: TurnoLido } | null {
  if (dias.has(diaDaSemanaDe(dia))) {
    const depois = turnos.find((t) => t.inicio > segundos)
    if (depois) return { instante: instanteDeHoraLocal(fuso, dia, depois.inicio), turno: depois }
  }
  let proximo = diaSeguinte(dia)
  // Oito voltas: se nenhum dia da semana é útil, não é mais calendário que resolve.
  for (let volta = 0; volta < 8; volta += 1) {
    if (dias.has(diaDaSemanaDe(proximo))) {
      const primeiro = turnos[0]!
      return { instante: instanteDeHoraLocal(fuso, proximo, primeiro.inicio), turno: primeiro }
    }
    proximo = diaSeguinte(proximo)
  }
  return null
}

function conferirPolitica(politica: PoliticaDeRetentativa): void {
  const inteiroPositivo = (valor: number) => Number.isInteger(valor) && valor >= 1
  if (!inteiroPositivo(politica.tetoDeTentativas)) {
    throw new RangeError(`teto de tentativas inválido: ${politica.tetoDeTentativas}`)
  }
  if (politica.recuosEmMinutos.length === 0 || !politica.recuosEmMinutos.every(inteiroPositivo)) {
    throw new RangeError('a tabela de recuo precisa de ao menos um valor, todos inteiros positivos')
  }
  if (!inteiroPositivo(politica.recuoOcupadoEmMinutos)) {
    throw new RangeError(`recuo de ocupado inválido: ${politica.recuoOcupadoEmMinutos}`)
  }
  if (!politica.diasUteis.every((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6)) {
    throw new RangeError('dia útil vai de 0 (domingo) a 6 (sábado)')
  }
}

/**
 * Os turnos lidos e conferidos, com as regras de `turnos_de_retentativa_validos`
 * no banco: nome não vazio e único, HH:MM, início antes do fim, em ordem e sem
 * sobreposição.
 */
export function lerTurnos(turnos: readonly TurnoDeRetentativa[]): readonly TurnoLido[] {
  const lidos: TurnoLido[] = []
  const nomes = new Set<string>()
  for (const turno of turnos) {
    const nome = typeof turno.name === 'string' ? turno.name.trim() : ''
    if (nome === '' || nomes.has(nome)) throw new RangeError(`turno sem nome ou repetido: "${nome}"`)
    nomes.add(nome)
    if (!HORA_DO_RELOGIO.test(turno.start) || !HORA_DO_RELOGIO.test(turno.end)) {
      throw new RangeError(`o turno ${nome} precisa de início e fim em HH:MM`)
    }
    const inicio = segundosDoDia(turno.start)
    const fim = segundosDoDia(turno.end)
    if (fim <= inicio) throw new RangeError(`o turno ${nome} termina antes de começar`)
    const anterior = lidos.at(-1)
    if (anterior && inicio < anterior.fim) {
      throw new RangeError(`o turno ${nome} começa antes do fim de ${anterior.nome}`)
    }
    lidos.push({ nome, inicio, fim })
  }
  return lidos
}

function segundosDoDia(hora: string): number {
  return Number(hora.slice(0, 2)) * 3600 + Number(hora.slice(3, 5)) * 60
}

/** Os dias úteis a partir da janela de discagem: as chaves que ela tem. */
export function diasDaJanela(janela: unknown): readonly number[] {
  if (typeof janela !== 'object' || janela === null || Array.isArray(janela)) return []
  return Object.keys(janela)
    .filter((dia) => /^[0-6]$/.test(dia))
    .map(Number)
    .sort((a, b) => a - b)
}
