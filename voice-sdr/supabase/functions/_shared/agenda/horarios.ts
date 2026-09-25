// Geração dos horários que a Sarah pode oferecer: a janela semanal do
// especialista, menos os bloqueios declarados, menos a ocupação lida do
// calendário externo, menos as reuniões já marcadas, dentro da antecedência
// mínima e máxima, respeitando o teto diário e falando no fuso do lead.
//
// Módulo portável (`_shared/`): sem Deno, sem rede, sem banco e sem relógio.
// `agora` entra por parâmetro como toda regra de tempo desta base, e a entrada
// é dado — quem consulta é quem chama. Erro de fuso em geração de horário não
// aparece em teste de fumaça: aparece na voz da Sarah oferecendo um horário que
// não existe.
//
// Duas decisões atravessam o arquivo inteiro:
//
// 1. **Intervalo meio aberto `[)`**, igual à restrição de exclusão de
//    `specialist_blocks`. Quem termina às 14h30 convive com quem começa às
//    14h30. Trocar por `[]` aqui faria a regra do módulo divergir da do banco.
// 2. **A faixa semanal vale no fuso do especialista**, nunca em UTC e nunca por
//    soma de minutos a partir do dia anterior. `specialist_availability` guarda
//    `time` justamente porque "toda terça das 9 às 12" não é um ponto no
//    calendário: em dia de mudança de horário de verão, o mesmo relógio de
//    parede cai em outro instante, e é por isso que cada dia recalcula o seu.

/** Faixa semanal, como `specialist_availability` a guarda. */
export interface FaixaDeDisponibilidade {
  /** 0 é domingo e 6 é sábado, como em `extract(dow from ...)`. */
  diaDaSemana: number
  /** Relógio de parede do especialista, `HH:MM` ou `HH:MM:SS`, até `24:00`. */
  inicio: string
  fim: string
}

/** Trecho ocupado do calendário: bloqueio, ocupação externa ou reunião. */
export interface IntervaloOcupado {
  /** Instante ISO-8601 com fuso, como o PostgREST devolve `timestamptz`. */
  inicio: string
  fim: string
}

/** O que da linha de `specialists` decide quando ele pode receber reunião. */
export interface EspecialistaDaAgenda {
  /** `specialists.timezone` (T-21): o fuso em que a faixa semanal é lida. */
  fuso: string
  /** `default_duration_min`: o passo da grade e a duração de cada oferta. */
  duracaoPadraoMin: number
  /** `daily_cap`: quantas reuniões cabem num dia dele. */
  tetoDiario: number
  /** `min_notice_min`: quanto tempo precisa haver entre agora e o começo. */
  antecedenciaMinimaMin: number
  /** `max_notice_days`: até quantos dias à frente a oferta pode chegar. */
  antecedenciaMaximaDias: number
}

export interface EntradaDeHorarios {
  especialista: EspecialistaDaAgenda
  /** Faixas semanais. Sobrepostas do mesmo dia são unidas antes de gerar. */
  disponibilidade: FaixaDeDisponibilidade[]
  /** `specialist_blocks`: o que gente da conta fechou. */
  bloqueios: IntervaloOcupado[]
  /** `specialist_busy_blocks`: o que a rotina leu do calendário externo. */
  ocupacaoExterna: IntervaloOcupado[]
  /**
   * Reuniões que já ocupam a agenda dele **e** contam no teto do dia. Quem
   * chama filtra por status: `scheduled` e `confirmed` entram, cancelada não
   * ocupa horário nem preenche teto.
   */
  reunioesMarcadas: IntervaloOcupado[]
  /** Fuso do lead, que é onde o rótulo é falado — não onde a faixa é lida. */
  fusoDoLead: string
  /** Instante ISO-8601 de agora. O módulo não lê relógio. */
  agora: string
}

/**
 * Por que um candidato não virou oferta. É o que permite provar a regra em vez
 * de só o resultado: sem motivo, "não ofereceu" e "ofereceu errado" têm a mesma
 * cara no teste.
 */
export type MotivoDeDescarte =
  | 'fora_da_faixa'
  | 'antecedencia_minima'
  | 'antecedencia_maxima'
  | 'teto_diario'
  | 'reuniao_existente'
  | 'bloqueado'
  | 'ocupado_externo'

export interface CandidatoDescartado {
  inicio: string
  fim: string
  motivo: MotivoDeDescarte
}

export interface OfertaDeHorario {
  /** Instante ISO-8601 do começo. */
  inicio: string
  /** Instante ISO-8601 do fim, exclusivo. */
  fim: string
  /** O fuso em que a faixa foi lida, para a ficha da reunião mostrar. */
  fusoDoEspecialista: string
  /** A frase já no fuso do lead, que é a que a Sarah fala. */
  rotuloNoFusoDoLead: string
}

export interface SaidaDeHorarios {
  ofertas: OfertaDeHorario[]
  descartes: CandidatoDescartado[]
}

/** RF-505: a Sarah oferece até quatro horários, nunca a agenda inteira. */
export const MAXIMO_DE_OFERTAS = 4

const MINUTO = 60_000
const DIA = 86_400_000
const HORA_DO_DIA = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/**
 * Os horários que cabem oferecer, e o motivo de cada candidato recusado.
 *
 * A varredura anda o horizonte em ordem crescente e para quando as quatro
 * ofertas se completam: o que viria depois não é recusa e não teria motivo
 * honesto para carregar.
 */
export function gerarHorarios(entrada: EntradaDeHorarios): SaidaDeHorarios {
  const { especialista, fusoDoLead } = entrada
  conferirEspecialista(especialista)

  const agora = instanteDe(entrada.agora, 'agora')
  const duracao = especialista.duracaoPadraoMin * MINUTO
  const limiteMinimo = agora + especialista.antecedenciaMinimaMin * MINUTO
  const limiteMaximo = agora + especialista.antecedenciaMaximaDias * DIA

  const bloqueios = intervalosDe(entrada.bloqueios, 'bloqueios')
  const ocupacaoExterna = intervalosDe(entrada.ocupacaoExterna, 'ocupacaoExterna')
  const reunioes = intervalosDe(entrada.reunioesMarcadas, 'reunioesMarcadas')
  const faixasPorDia = unirFaixas(entrada.disponibilidade)
  const reunioesDoDia = contarPorDiaLocal(reunioes, especialista.fuso)

  // O rótulo é do lead, mas o fuso do lead também precisa existir: descobrir
  // que ele é inválido só na hora de falar deixaria a oferta pronta e a frase
  // não. Uma leitura basta para o Intl recusar o nome.
  relogioLocal(fusoDoLead, agora)

  const ofertas: OfertaDeHorario[] = []
  const descartes: CandidatoDescartado[] = []

  // O último dia do horizonte entra inteiro de propósito: é dentro dele que o
  // candidato passa de `limiteMaximo`, e é assim que a antecedência máxima vira
  // motivo observável em vez de um dia que a varredura nunca alcança.
  const ultimoDia = chaveDeData(dataLocalDe(especialista.fuso, limiteMaximo))
  let dia = dataLocalDe(especialista.fuso, agora)

  // O teto de voltas é a antecedência mais folga para a virada de dia nas
  // pontas. Ele não decide nada — a saída é sempre pelo último dia —, mas laço
  // sem teto em código que roda na borda é uma trava de produção esperando um
  // fuso que ninguém previu.
  for (let volta = 0; volta <= especialista.antecedenciaMaximaDias + 2; volta += 1) {
    const faixas = faixasPorDia.get(diaDaSemanaDe(dia)) ?? []
    const noTeto = (reunioesDoDia.get(chaveDeData(dia)) ?? 0) >= especialista.tetoDiario

    for (const faixa of faixas) {
      const abre = instanteDeHoraLocal(especialista.fuso, dia, faixa.inicio)
      const fechaEm = instanteDeHoraLocal(especialista.fuso, dia, faixa.fim)

      for (let inicio = abre; inicio < fechaEm; inicio += duracao) {
        const fim = inicio + duracao
        const candidato = { inicio: paraIso(inicio), fim: paraIso(fim) }
        const motivo = recusaDe({
          inicio,
          fim,
          fechaEm,
          limiteMinimo,
          limiteMaximo,
          noTeto,
          reunioes,
          bloqueios,
          ocupacaoExterna,
        })

        if (motivo) {
          descartes.push({ ...candidato, motivo })
          // Sobra que não comporta a duração: os candidatos seguintes desta
          // faixa só seriam piores.
          if (motivo === 'fora_da_faixa') break
          continue
        }

        ofertas.push({
          ...candidato,
          fusoDoEspecialista: especialista.fuso,
          rotuloNoFusoDoLead: rotularInstante(inicio, fusoDoLead),
        })

        if (ofertas.length === MAXIMO_DE_OFERTAS) return { ofertas, descartes }
      }
    }

    if (chaveDeData(dia) === ultimoDia) break
    dia = diaSeguinte(dia)
  }

  return { ofertas, descartes }
}

/**
 * A frase do horário no fuso pedido: "quinta-feira, 8 de outubro de 2026,
 * 14h30". Montada aqui, e não pelo `Intl`, porque o texto que a Sarah fala não
 * pode mudar com a versão do ICU da máquina.
 */
export function rotularInstante(instante: number | string, fuso: string): string {
  const ts = typeof instante === 'number' ? instante : instanteDe(instante, 'instante')
  const partes = partesEm(fuso, ts)
  const nomeDoDia = DIAS_DA_SEMANA[diaDaSemanaDe(partes)]
  const nomeDoMes = MESES[partes.mes - 1]
  if (!nomeDoDia || !nomeDoMes) throw new Error(`instante fora do calendário: ${ts}`)
  return `${nomeDoDia}, ${partes.dia} de ${nomeDoMes} de ${partes.ano}, ${dois(partes.hora)}h${dois(partes.minuto)}`
}

/** O relógio de parede de um instante num fuso, com o dia da semana (0 é domingo). */
export interface RelogioLocal {
  readonly ano: number
  readonly mes: number
  readonly dia: number
  readonly diaDaSemana: number
  readonly hora: number
  readonly minuto: number
  /** Dias desde a época Unix da data civil local: diferença entre dois é "quantos dias depois". */
  readonly diaCivil: number
}

/**
 * O relógio de parede do instante no fuso pedido. Existe para que as falas da
 * agenda (`_shared/speech/agenda.ts`) leiam hora e dia sem uma segunda
 * conversão de fuso: a conta de calendário mora aqui, e aqui só.
 */
export function relogioEm(instante: number | string, fuso: string): RelogioLocal {
  const ts = typeof instante === 'number' ? instante : instanteDe(instante, 'instante')
  const partes = partesEm(fuso, ts)
  return {
    ano: partes.ano,
    mes: partes.mes,
    dia: partes.dia,
    diaDaSemana: diaDaSemanaDe(partes),
    hora: partes.hora,
    minuto: partes.minuto,
    diaCivil: Math.floor(Date.UTC(partes.ano, partes.mes - 1, partes.dia) / DIA),
  }
}

/**
 * O instante em que um relógio de parede acontece num fuso. Existe para que o
 * adaptador de calendário normalize o que o provedor devolve em data local
 * (evento de dia inteiro, `dateTime` sem deslocamento) sem uma segunda conta de
 * fuso fora deste módulo. `mes` vai de 1 a 12; `minutos` conta desde a
 * meia-noite. Relógio que não existiu naquele dia (buraco de horário de verão)
 * adianta até voltar a existir, como a faixa semanal.
 */
export function instanteDoRelogio(
  fuso: string,
  data: { readonly ano: number; readonly mes: number; readonly dia: number },
  minutos: number,
): number {
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1440) {
    throw new Error(`minutos fora do dia: ${minutos}`)
  }
  return instanteDeHoraLocal(fuso, { ano: data.ano, mes: data.mes, dia: data.dia }, minutos)
}

/**
 * Os dias da semana (0 é domingo, como em `extract(dow from ...)`) que o
 * horizonte de `dias` alcança, lidos no fuso pedido.
 *
 * Existe para que "especialista sem faixa de disponibilidade no período" seja
 * uma pergunta respondível fora deste módulo (`roteamento.ts`) sem que a conta
 * de calendário se espalhe: a conversão de instante para data civil mora aqui,
 * e aqui só.
 *
 * O horizonte cobre o dia de hoje inteiro e vai até o dia em que
 * `agora + dias` cai, os dois inclusive — o mesmo recorte que `gerarHorarios`
 * varre, para que um dia contado aqui seja um dia oferecido lá.
 */
export function diasDaSemanaNoHorizonte(fuso: string, agora: string, dias: number): Set<number> {
  if (!Number.isInteger(dias) || dias < 0) {
    throw new Error(`dias precisa ser inteiro não negativo: ${dias}`)
  }
  const inicio = instanteDe(agora, 'agora')
  // Sete datas civis distintas já contêm os sete dias da semana; passar disso é
  // percorrer calendário para reencontrar o conjunto inteiro. O `relogioLocal`
  // fica de fora de propósito: ele recusaria fuso inexistente, e a conferência
  // do nome do fuso é a mesma nos dois caminhos.
  if (dias >= 6) {
    relogioLocal(fuso, inicio)
    return new Set([0, 1, 2, 3, 4, 5, 6])
  }

  const ultimo = chaveDeData(dataLocalDe(fuso, inicio + dias * DIA))
  const encontrados = new Set<number>()
  let dia = dataLocalDe(fuso, inicio)
  // O teto não decide nada — a saída é pela data —, mas laço sobre calendário
  // na borda sem teto é trava de produção esperando um fuso imprevisto.
  for (let volta = 0; volta <= dias + 2; volta += 1) {
    encontrados.add(diaDaSemanaDe(dia))
    if (chaveDeData(dia) === ultimo) break
    dia = diaSeguinte(dia)
  }
  return encontrados
}

// Recusa -----------------------------------------------------------------------

interface Conferencia {
  inicio: number
  fim: number
  fechaEm: number
  limiteMinimo: number
  limiteMaximo: number
  noTeto: boolean
  reunioes: Faixa[]
  bloqueios: Faixa[]
  ocupacaoExterna: Faixa[]
}

/**
 * As conferências em ordem, e portanto a precedência quando duas causas
 * coexistem. Ganha sempre a que leva a uma resposta diferente de quem lê:
 * `fora_da_faixa` diz que aquilo nem chega a ser horário do especialista;
 * `antecedencia_*` e `teto_diario` dizem que a resposta é outro dia, não outro
 * horário; só depois vem quem ocupou o horário, e aí a agenda desta casa
 * (`reuniao_existente`, `bloqueado`) explica mais do que a de fora
 * (`ocupado_externo`), porque é a única sobre a qual alguém aqui pode agir.
 *
 * A ordem mora aqui e em nenhum outro lugar. Espalhada por `if` pelo corpo do
 * gerador, ela viraria ordem de escrita, que muda sem ninguém decidir nada.
 */
const CONFERENCIAS: readonly {
  motivo: MotivoDeDescarte
  recusa: (c: Conferencia) => boolean
}[] = [
  { motivo: 'fora_da_faixa', recusa: (c) => c.fim > c.fechaEm },
  { motivo: 'antecedencia_minima', recusa: (c) => c.inicio < c.limiteMinimo },
  { motivo: 'antecedencia_maxima', recusa: (c) => c.inicio >= c.limiteMaximo },
  { motivo: 'teto_diario', recusa: (c) => c.noTeto },
  { motivo: 'reuniao_existente', recusa: (c) => colideCom(c.reunioes, c.inicio, c.fim) },
  { motivo: 'bloqueado', recusa: (c) => colideCom(c.bloqueios, c.inicio, c.fim) },
  { motivo: 'ocupado_externo', recusa: (c) => colideCom(c.ocupacaoExterna, c.inicio, c.fim) },
]

function recusaDe(conferencia: Conferencia): MotivoDeDescarte | null {
  for (const { motivo, recusa } of CONFERENCIAS) if (recusa(conferencia)) return motivo
  return null
}

/** `[)`: quem termina às 14h30 não colide com quem começa às 14h30. */
function colideCom(faixas: Faixa[], inicio: number, fim: number): boolean {
  return faixas.some((faixa) => inicio < faixa.fim && faixa.inicio < fim)
}

// Faixas -----------------------------------------------------------------------

interface Faixa {
  inicio: number
  fim: number
}

interface FaixaEmMinutos {
  inicio: number
  fim: number
}

/**
 * Faixas do mesmo dia da semana unidas. O banco aceita sobreposta — nenhuma
 * expressão imutável sobre `time` serve de chave de exclusão (US-158) — e sem
 * a união o mesmo horário seria oferecido duas vezes. Encostadas também se
 * unem: lacuna de zero minuto não é lacuna, e reiniciar a grade no meio-dia
 * perderia o horário que atravessa a emenda.
 */
function unirFaixas(faixas: FaixaDeDisponibilidade[]): Map<number, FaixaEmMinutos[]> {
  const porDia = new Map<number, FaixaEmMinutos[]>()

  for (const faixa of faixas) {
    if (!Number.isInteger(faixa.diaDaSemana) || faixa.diaDaSemana < 0 || faixa.diaDaSemana > 6) {
      throw new Error(`dia da semana fora de 0..6: ${faixa.diaDaSemana}`)
    }
    const inicio = minutosDoDia(faixa.inicio)
    const fim = minutosDoDia(faixa.fim)
    if (fim <= inicio) throw new Error(`faixa sem duração: ${faixa.inicio}–${faixa.fim}`)
    const doDia = porDia.get(faixa.diaDaSemana) ?? []
    doDia.push({ inicio, fim })
    porDia.set(faixa.diaDaSemana, doDia)
  }

  for (const [dia, doDia] of porDia) {
    const ordenadas = [...doDia].sort((a, b) => a.inicio - b.inicio || a.fim - b.fim)
    const unidas: FaixaEmMinutos[] = []
    for (const faixa of ordenadas) {
      const anterior = unidas[unidas.length - 1]
      if (anterior && faixa.inicio <= anterior.fim) {
        anterior.fim = Math.max(anterior.fim, faixa.fim)
        continue
      }
      unidas.push({ ...faixa })
    }
    porDia.set(dia, unidas)
  }

  return porDia
}

// Calendário -------------------------------------------------------------------

interface DataLocal {
  ano: number
  mes: number
  dia: number
}

interface PartesLocais extends DataLocal {
  hora: number
  minuto: number
  segundo: number
}

const FORMATADORES = new Map<string, Intl.DateTimeFormat>()

function formatador(fuso: string): Intl.DateTimeFormat {
  const guardado = FORMATADORES.get(fuso)
  if (guardado) return guardado
  // O construtor é quem recusa nome de fuso que não existe, com RangeError.
  const novo = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  FORMATADORES.set(fuso, novo)
  return novo
}

function partesEm(fuso: string, instante: number): PartesLocais {
  const partes = formatador(fuso).formatToParts(instante)
  const valor = (tipo: string): number => {
    const parte = partes.find((p) => p.type === tipo)
    if (!parte) throw new Error(`o fuso ${fuso} não devolveu ${tipo}`)
    return Number(parte.value)
  }
  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    // Meia-noite sai como 24 em alguns ICU; o dia já veio certo ao lado.
    hora: valor('hour') % 24,
    minuto: valor('minute'),
    segundo: valor('second'),
  }
}

/** O relógio de parede daquele fuso, lido como se fosse UTC. */
function relogioLocal(fuso: string, instante: number): number {
  const p = partesEm(fuso, instante)
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
}

function dataLocalDe(fuso: string, instante: number): DataLocal {
  const { ano, mes, dia } = partesEm(fuso, instante)
  return { ano, mes, dia }
}

/**
 * O instante em que aquele relógio de parede acontece naquele fuso. Duas
 * passagens porque o deslocamento a aplicar é o do instante de destino, não o
 * do palpite: em dia de mudança, os dois diferem em uma hora.
 */
function instanteDeHoraLocal(fuso: string, data: DataLocal, minutos: number): number {
  const alvo = Date.UTC(data.ano, data.mes - 1, data.dia, Math.floor(minutos / 60), minutos % 60)
  const primeiro = alvo - (relogioLocal(fuso, alvo) - alvo)
  const segundo = alvo - (relogioLocal(fuso, primeiro) - primeiro)
  if (relogioLocal(fuso, segundo) === alvo) return segundo
  // Buraco de horário de verão: aquele relógio de parede não existiu naquele
  // dia. A faixa passa a valer quando o relógio volta a existir — adiantar, e
  // nunca recuar para o dia anterior, que é o que a passagem dupla faria
  // sozinha.
  return Math.max(primeiro, segundo)
}

/** 0 é domingo, como no Postgres. 1970-01-01 foi quinta-feira. */
function diaDaSemanaDe(data: DataLocal): number {
  const dias = Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA)
  return (((dias + 4) % 7) + 7) % 7
}

function diaSeguinte(data: DataLocal): DataLocal {
  const proximo = Date.UTC(data.ano, data.mes - 1, data.dia + 1)
  return dataLocalDe('UTC', proximo)
}

function chaveDeData(data: DataLocal): string {
  return `${data.ano}-${dois(data.mes)}-${dois(data.dia)}`
}

/**
 * Quantas reuniões caem em cada dia **do calendário do especialista**. Contar
 * por dia de UTC daria o dia errado para todo fuso negativo: uma reunião das
 * 21h em Manaus já é do dia seguinte em UTC, e o teto se mudaria de dia junto.
 */
function contarPorDiaLocal(reunioes: Faixa[], fuso: string): Map<string, number> {
  const contagem = new Map<string, number>()
  for (const reuniao of reunioes) {
    const chave = chaveDeData(dataLocalDe(fuso, reuniao.inicio))
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
  }
  return contagem
}

// Conversões -------------------------------------------------------------------

function conferirEspecialista(especialista: EspecialistaDaAgenda): void {
  const inteiroNaoNegativo = (valor: number, campo: string): void => {
    if (!Number.isInteger(valor) || valor < 0) {
      throw new Error(`${campo} precisa ser inteiro não negativo: ${valor}`)
    }
  }
  if (!Number.isInteger(especialista.duracaoPadraoMin) || especialista.duracaoPadraoMin <= 0) {
    throw new Error(`duracaoPadraoMin precisa ser inteiro positivo: ${especialista.duracaoPadraoMin}`)
  }
  inteiroNaoNegativo(especialista.tetoDiario, 'tetoDiario')
  inteiroNaoNegativo(especialista.antecedenciaMinimaMin, 'antecedenciaMinimaMin')
  inteiroNaoNegativo(especialista.antecedenciaMaximaDias, 'antecedenciaMaximaDias')
}

function instanteDe(iso: string, campo: string): number {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`)
  return ts
}

function intervalosDe(intervalos: IntervaloOcupado[], campo: string): Faixa[] {
  return intervalos.map((intervalo) => {
    const inicio = instanteDe(intervalo.inicio, `${campo}.inicio`)
    const fim = instanteDe(intervalo.fim, `${campo}.fim`)
    if (fim <= inicio) throw new Error(`${campo} sem duração: ${intervalo.inicio}–${intervalo.fim}`)
    return { inicio, fim }
  })
}

function minutosDoDia(hora: string): number {
  const casou = HORA_DO_DIA.exec(hora.trim())
  if (!casou) throw new Error(`hora fora do formato HH:MM: ${hora}`)
  const h = Number(casou[1])
  const m = Number(casou[2])
  const s = Number(casou[3] ?? '0')
  // Faixa com segundo não é agenda, e arredondar calado ofereceria um horário
  // que a faixa não abre.
  if (s !== 0) throw new Error(`faixa com segundo não se oferece: ${hora}`)
  const total = h * 60 + m
  if (m > 59 || total > 1440) throw new Error(`hora fora do dia: ${hora}`)
  return total
}

function paraIso(instante: number): string {
  const p = partesEm('UTC', instante)
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}:${dois(p.segundo)}Z`
}

function dois(valor: number): string {
  return String(valor).padStart(2, '0')
}
