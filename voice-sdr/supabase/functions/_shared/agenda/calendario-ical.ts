// O calendário externo por endereço iCal: o caminho sem OAuth.
//
// **Por que existe.** O OAuth do Google pede um aplicativo verificado pelo
// Google em nome de quem opera a instalação, e o produto não depende de conta
// nossa em terceiro. Todo calendário grande publica a agenda num endereço
// secreto no formato iCal (Google Calendar, Outlook, Apple): o especialista
// cola o endereço na tela, e a rotina lê a ocupação por ele. É só leitura: a
// reunião chega à agenda do especialista pelo convite por e-mail, com o `.ics`
// anexado (`_shared/agenda/convite-de-reuniao.ts`).
//
// **O endereço é segredo.** Quem o tem lê a agenda inteira. Ele vai para o
// Vault pelo mesmo ponteiro do token de renovação
// (`specialist_calendars.refresh_secret_id`, provedor `ical`), e nenhuma falha
// devolvida carrega o endereço, o corpo ou o status cru.
//
// **O parser é o mínimo que os três provedores escrevem**, e cada pedaço tem
// fixture no teste: VEVENT com DTSTART e DTEND (ou DURATION), em UTC, com
// TZID (IANA ou o nome do Windows que o Outlook usa) ou como data de dia
// inteiro; RRULE com FREQ, INTERVAL, COUNT, UNTIL, BYDAY e BYMONTHDAY; EXDATE;
// RECURRENCE-ID trocando uma ocorrência; STATUS:CANCELLED e TRANSP:TRANSPARENT
// ficam de fora, porque não ocupam o horário. A recorrência se expande no
// relógio de parede do fuso do evento, para a reunião das 9h continuar às 9h
// depois do horário de verão.
//
// Portável: sem Deno, sem rede. O `fetch` entra por `buscar`.

import { instanteDoRelogio } from './horarios.ts'
import {
  falhaDoCalendario,
  sobrepoe,
  type FalhaDoCalendario,
  type JanelaAbsoluta,
  type OcupacaoDoCalendario,
  type PortaDeCalendario,
  type ResultadoDoCalendario,
} from './calendario.ts'
import type { Buscar } from './calendario-google.ts'

/** O nome do provedor em `specialist_calendars.provider`. */
export const PROVEDOR_ICAL = 'ical'

/** `specialist_calendars.external_id` do calendário por endereço: não há agenda a escolher. */
export const AGENDA_DO_ICAL = 'endereco_ical'

/** Acima disto não é agenda de uma pessoa, e a leitura para antes de estourar a memória da borda. */
export const MAXIMO_DE_CARACTERES = 5_000_000

/** Teto de voltas da expansão de uma regra de recorrência. */
export const TETO_DE_VOLTAS = 5_000

/** A leitura não tem ninguém esperando, mas não pode prender a rotina. */
export const PRAZO_PADRAO_MS = 10_000

// O endereço -----------------------------------------------------------------------

export type EnderecoDoIcal =
  | { readonly ok: true; readonly endereco: string }
  | { readonly ok: false; readonly motivo: 'vazio' | 'formato' }

/**
 * O endereço como vai para o Vault. `webcal://` (Apple, e o botão de assinar
 * do Outlook) é o mesmo endereço por HTTPS; `http://` sem TLS é recusado,
 * porque o endereço é segredo e viajaria aberto.
 */
export function normalizarEnderecoIcal(bruto: string): EnderecoDoIcal {
  const texto = bruto.trim()
  if (texto === '') return { ok: false, motivo: 'vazio' }
  if (/\s/.test(texto)) return { ok: false, motivo: 'formato' }
  const comEsquema = texto.replace(/^webcals?:\/\//i, 'https://')
  let url: URL
  try {
    url = new URL(comEsquema)
  } catch {
    return { ok: false, motivo: 'formato' }
  }
  if (url.protocol !== 'https:' || url.hostname === '' || url.username !== '' || url.password !== '') {
    return { ok: false, motivo: 'formato' }
  }
  return { ok: true, endereco: url.toString() }
}

// As linhas ----------------------------------------------------------------------

interface Propriedade {
  readonly nome: string
  readonly parametros: Readonly<Record<string, string>>
  readonly valor: string
}

/** Linha dobrada (RFC 5545 3.1): a continuação começa com espaço ou tabulação. */
function desdobrar(texto: string): string[] {
  return texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n')
}

function lerPropriedade(linha: string): Propriedade | null {
  // O valor começa no primeiro `:` fora de aspas; parâmetro pode trazer `:`
  // entre aspas (TZID="America/Sao_Paulo").
  let aspas = false
  let corte = -1
  for (let indice = 0; indice < linha.length; indice++) {
    const caractere = linha[indice]
    if (caractere === '"') aspas = !aspas
    else if (caractere === ':' && !aspas) {
      corte = indice
      break
    }
  }
  if (corte <= 0) return null
  const [nome = '', ...partes] = linha.slice(0, corte).split(';')
  const parametros: Record<string, string> = {}
  for (const parte of partes) {
    const igual = parte.indexOf('=')
    if (igual <= 0) continue
    parametros[parte.slice(0, igual).toUpperCase()] = parte.slice(igual + 1).replace(/^"|"$/g, '')
  }
  return { nome: nome.toUpperCase(), parametros, valor: linha.slice(corte + 1).trim() }
}

// Os horários --------------------------------------------------------------------

interface DataCivil {
  readonly ano: number
  readonly mes: number
  readonly dia: number
}

/** Um horário como o iCal o escreve, antes de virar instante. */
interface HorarioDoIcal {
  readonly tipo: 'utc' | 'local' | 'data'
  readonly data: DataCivil
  /** Segundos desde a meia-noite. Zero na data de dia inteiro. */
  readonly segundos: number
  /** O fuso IANA do horário local; nulo é o do especialista. */
  readonly fuso: string | null
}

/**
 * O nome do Windows que o Outlook escreve no TZID, para o IANA. Só os que
 * uma agenda brasileira encontra; fora da lista, o TZID que não for IANA
 * válido vale o fuso do especialista.
 */
const FUSOS_DO_WINDOWS: ReadonlyMap<string, string> = new Map([
  ['e. south america standard time', 'America/Sao_Paulo'],
  ['sa eastern standard time', 'America/Fortaleza'],
  ['bahia standard time', 'America/Bahia'],
  ['tocantins standard time', 'America/Araguaina'],
  ['central brazilian standard time', 'America/Cuiaba'],
  ['sa western standard time', 'America/Manaus'],
  ['sa pacific standard time', 'America/Rio_Branco'],
  ['argentina standard time', 'America/Argentina/Buenos_Aires'],
  ['utc', 'UTC'],
  ['gmt standard time', 'Europe/London'],
  ['w. europe standard time', 'Europe/Berlin'],
  ['romance standard time', 'Europe/Paris'],
  ['eastern standard time', 'America/New_York'],
  ['central standard time', 'America/Chicago'],
  ['mountain standard time', 'America/Denver'],
  ['pacific standard time', 'America/Los_Angeles'],
])

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

function resolverFuso(tzid: string | undefined): string | null {
  const limpo = tzid?.trim().replace(/^\/+/, '') ?? ''
  if (limpo === '') return null
  const doWindows = FUSOS_DO_WINDOWS.get(limpo.toLowerCase())
  if (doWindows) return doWindows
  return fusoValido(limpo) ? limpo : null
}

function dataValida(ano: number, mes: number, dia: number): DataCivil | null {
  const conferida = new Date(Date.UTC(ano, mes - 1, dia))
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null
  return { ano, mes, dia }
}

function lerHorario(valor: string, parametros: Readonly<Record<string, string>>): HorarioDoIcal | null {
  const casamento = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(valor.trim())
  if (!casamento) return null
  const [, ano, mes, dia, hora, minuto, segundo, utc] = casamento
  const data = dataValida(Number(ano), Number(mes), Number(dia))
  if (!data) return null
  if (hora === undefined) return { tipo: 'data', data, segundos: 0, fuso: null }
  if (Number(hora) > 23 || Number(minuto) > 59 || Number(segundo ?? '0') > 60) return null
  const segundos = Number(hora) * 3600 + Number(minuto) * 60 + Math.min(59, Number(segundo ?? '0'))
  if (utc) return { tipo: 'utc', data, segundos, fuso: null }
  return { tipo: 'local', data, segundos, fuso: resolverFuso(parametros.TZID) }
}

/** O instante do horário, em milissegundos, ou nulo quando o relógio não existe no fuso. */
function instanteDe(horario: HorarioDoIcal, fusoPadrao: string): number | null {
  if (horario.tipo === 'utc') {
    return Date.UTC(horario.data.ano, horario.data.mes - 1, horario.data.dia) + horario.segundos * 1000
  }
  const fuso = horario.fuso ?? fusoPadrao
  try {
    const minutos = Math.floor(horario.segundos / 60)
    return instanteDoRelogio(fuso, horario.data, minutos) + (horario.segundos % 60) * 1000
  } catch {
    return null
  }
}

/** O mesmo relógio de parede noutra data: é assim que a recorrência anda. */
function naData(horario: HorarioDoIcal, data: DataCivil): HorarioDoIcal {
  return { ...horario, data }
}

/** `PT1H30M`, `P1D`, `P2W`, `-PT15M` (ignorado: duração negativa não ocupa). */
function lerDuracao(valor: string): number | null {
  const casamento = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(valor.trim())
  if (!casamento || valor.trim().toUpperCase() === 'P' || /T$/i.test(valor.trim())) return null
  const [, semanas, dias, horas, minutos, segundos] = casamento
  const total =
    Number(semanas ?? 0) * 7 * 86_400 +
    Number(dias ?? 0) * 86_400 +
    Number(horas ?? 0) * 3600 +
    Number(minutos ?? 0) * 60 +
    Number(segundos ?? 0)
  return total * 1000
}

// A recorrência --------------------------------------------------------------------

const DIAS_DA_SEMANA = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

interface Regra {
  readonly frequencia: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  readonly intervalo: number
  readonly contagem: number | null
  readonly ate: HorarioDoIcal | null
  /** `BYDAY`: dia da semana (0 = domingo) e, no mensal, a ordem (1, 2, -1). */
  readonly dias: readonly { readonly semana: number; readonly ordem: number | null }[]
  readonly diasDoMes: readonly number[]
}

function lerRegra(valor: string): Regra | null {
  const partes = new Map(
    valor.split(';').map((parte) => {
      const [chave = '', conteudo = ''] = parte.split('=')
      return [chave.trim().toUpperCase(), conteudo.trim()] as const
    }),
  )
  const frequencia = partes.get('FREQ')?.toUpperCase()
  if (frequencia !== 'DAILY' && frequencia !== 'WEEKLY' && frequencia !== 'MONTHLY' && frequencia !== 'YEARLY') return null
  const intervalo = Number(partes.get('INTERVAL') ?? '1')
  const contagem = partes.has('COUNT') ? Number(partes.get('COUNT')) : null
  const ate = partes.has('UNTIL') ? lerHorario(partes.get('UNTIL') ?? '', {}) : null
  if (!Number.isInteger(intervalo) || intervalo < 1) return null
  if (contagem !== null && (!Number.isInteger(contagem) || contagem < 1)) return null
  if (partes.has('UNTIL') && ate === null) return null

  const dias: { semana: number; ordem: number | null }[] = []
  for (const bruto of (partes.get('BYDAY') ?? '').split(',').filter(Boolean)) {
    const casamento = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(bruto.trim())
    if (!casamento) return null
    dias.push({
      semana: DIAS_DA_SEMANA.indexOf(casamento[2]!.toUpperCase() as (typeof DIAS_DA_SEMANA)[number]),
      ordem: casamento[1] ? Number(casamento[1]) : null,
    })
  }
  const diasDoMes = (partes.get('BYMONTHDAY') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)
  if (diasDoMes.some((dia) => !Number.isInteger(dia) || dia === 0 || Math.abs(dia) > 31)) return null
  return { frequencia, intervalo, contagem, ate, dias, diasDoMes }
}

function somarDias(data: DataCivil, dias: number): DataCivil {
  const ts = new Date(Date.UTC(data.ano, data.mes - 1, data.dia + dias))
  return { ano: ts.getUTCFullYear(), mes: ts.getUTCMonth() + 1, dia: ts.getUTCDate() }
}

function diaDaSemana(data: DataCivil): number {
  return new Date(Date.UTC(data.ano, data.mes - 1, data.dia)).getUTCDay()
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

function comparar(a: DataCivil, b: DataCivil): number {
  return a.ano - b.ano || a.mes - b.mes || a.dia - b.dia
}

/** As datas de um mês que a regra mensal (ou anual, no mês do início) escolhe, em ordem. */
function datasDoMes(ano: number, mes: number, regra: Regra, diaDoInicio: number): DataCivil[] {
  const total = diasNoMes(ano, mes)
  const escolhidos = new Set<number>()
  for (const dia of regra.diasDoMes) {
    const real = dia > 0 ? dia : total + dia + 1
    if (real >= 1 && real <= total) escolhidos.add(real)
  }
  for (const { semana, ordem } of regra.dias) {
    const ocorrencias: number[] = []
    for (let dia = 1; dia <= total; dia++) if (diaDaSemana({ ano, mes, dia }) === semana) ocorrencias.push(dia)
    if (ordem === null) ocorrencias.forEach((dia) => escolhidos.add(dia))
    else {
      const escolhido = ordem > 0 ? ocorrencias[ordem - 1] : ocorrencias[ocorrencias.length + ordem]
      if (escolhido !== undefined) escolhidos.add(escolhido)
    }
  }
  if (regra.diasDoMes.length === 0 && regra.dias.length === 0 && diaDoInicio <= total) escolhidos.add(diaDoInicio)
  return [...escolhidos].sort((a, b) => a - b).map((dia) => ({ ano, mes, dia }))
}

/**
 * As datas da regra a partir do início, em ordem, até passar do limite. O
 * início conta como a primeira ocorrência (RFC 5545 3.8.5.3), e COUNT conta
 * desde ele, inclusive o que ficou antes da janela.
 */
function* datasDaRegra(inicio: DataCivil, regra: Regra, limite: DataCivil): Generator<DataCivil> {
  let voltas = 0
  const cedo = (data: DataCivil) => comparar(data, inicio) < 0
  const tarde = (data: DataCivil) => comparar(data, limite) > 0

  if (regra.frequencia === 'DAILY') {
    for (let data = inicio; !tarde(data) && voltas < TETO_DE_VOLTAS; data = somarDias(data, regra.intervalo), voltas++) {
      yield data
    }
    return
  }

  if (regra.frequencia === 'WEEKLY') {
    const dias = regra.dias.length > 0 ? [...new Set(regra.dias.map((dia) => dia.semana))] : [diaDaSemana(inicio)]
    // A semana começa na segunda (WKST=MO, o padrão).
    const segunda = somarDias(inicio, -((diaDaSemana(inicio) + 6) % 7))
    for (let semana = segunda; !tarde(semana) && voltas < TETO_DE_VOLTAS; semana = somarDias(semana, 7 * regra.intervalo), voltas++) {
      const daSemana = dias.map((dia) => somarDias(semana, (dia + 6) % 7)).sort(comparar)
      for (const data of daSemana) if (!cedo(data) && !tarde(data)) yield data
    }
    return
  }

  for (
    let passo = 0;
    voltas < TETO_DE_VOLTAS;
    passo += regra.intervalo, voltas++
  ) {
    const meses = regra.frequencia === 'MONTHLY' ? passo : passo * 12
    const indice = inicio.mes - 1 + meses
    const ano = inicio.ano + Math.floor(indice / 12)
    const mes = (indice % 12) + 1
    if (comparar({ ano, mes, dia: 1 }, limite) > 0) return
    for (const data of datasDoMes(ano, mes, regra, inicio.dia)) if (!cedo(data) && !tarde(data)) yield data
  }
}

// Os eventos ---------------------------------------------------------------------

interface EventoLido {
  uid: string
  inicio: HorarioDoIcal | null
  fim: HorarioDoIcal | null
  duracaoMs: number | null
  regra: Regra | null
  regraInvalida: boolean
  excecoes: HorarioDoIcal[]
  recorrencia: HorarioDoIcal | null
  livre: boolean
}

function eventoVazio(): EventoLido {
  return { uid: '', inicio: null, fim: null, duracaoMs: null, regra: null, regraInvalida: false, excecoes: [], recorrencia: null, livre: false }
}

function lerEventos(texto: string): EventoLido[] {
  const eventos: EventoLido[] = []
  let atual: EventoLido | null = null
  // Componente dentro do evento (VALARM) tem propriedades que não são dele.
  let profundidade = 0
  for (const linha of desdobrar(texto)) {
    const propriedade = lerPropriedade(linha)
    if (!propriedade) continue
    const { nome, parametros, valor } = propriedade
    if (nome === 'BEGIN') {
      if (valor.toUpperCase() === 'VEVENT' && atual === null) atual = eventoVazio()
      else if (atual !== null) profundidade++
      continue
    }
    if (nome === 'END') {
      if (atual !== null && profundidade > 0) profundidade--
      else if (atual !== null && valor.toUpperCase() === 'VEVENT') {
        eventos.push(atual)
        atual = null
      }
      continue
    }
    if (atual === null || profundidade > 0) continue
    switch (nome) {
      case 'UID':
        atual.uid = valor
        break
      case 'DTSTART':
        atual.inicio = lerHorario(valor, parametros)
        break
      case 'DTEND':
        atual.fim = lerHorario(valor, parametros)
        break
      case 'DURATION':
        atual.duracaoMs = lerDuracao(valor)
        break
      case 'RRULE':
        atual.regra = lerRegra(valor)
        atual.regraInvalida = atual.regra === null
        break
      case 'EXDATE':
        for (const item of valor.split(',')) {
          const horario = lerHorario(item, parametros)
          if (horario) atual.excecoes.push(horario)
        }
        break
      case 'RECURRENCE-ID':
        atual.recorrencia = lerHorario(valor, parametros)
        break
      case 'STATUS':
        if (valor.toUpperCase() === 'CANCELLED') atual.livre = true
        break
      case 'TRANSP':
        if (valor.toUpperCase() === 'TRANSPARENT') atual.livre = true
        break
    }
  }
  return eventos
}

function paraIso(ts: number): string {
  return new Date(ts).toISOString().replace('.000Z', 'Z')
}

/** A duração do evento: DTEND menos DTSTART, senão DURATION, senão um dia para data inteira. */
function duracaoDe(evento: EventoLido, inicioTs: number, fusoPadrao: string): number | null {
  if (evento.fim) {
    const fimTs = instanteDe(evento.fim, fusoPadrao)
    return fimTs === null ? null : fimTs - inicioTs
  }
  if (evento.duracaoMs !== null) return evento.duracaoMs
  return evento.inicio?.tipo === 'data' ? 86_400_000 : 0
}

/**
 * A ocupação que o texto iCal descreve dentro da janela. O que não se lê
 * (horário torto, regra que o parser não conhece, relógio que não existe)
 * fica de fora sem derrubar o resto; a regra desconhecida ainda ocupa a
 * primeira ocorrência, que é a única que se sabe.
 */
export function ocupacaoDoIcal(texto: string, janela: JanelaAbsoluta, fusoPadrao: string): OcupacaoDoCalendario[] {
  const eventos = lerEventos(texto)
  const inicioDaJanela = Date.parse(janela.inicio)
  const fimDaJanela = Date.parse(janela.fim)
  const chave = (ts: number) => paraIso(ts)

  // As ocorrências trocadas por RECURRENCE-ID saem da série, por instante.
  const trocadas = new Map<string, Set<string>>()
  for (const evento of eventos) {
    if (!evento.recorrencia || !evento.uid) continue
    const ts = instanteDe(evento.recorrencia, fusoPadrao)
    if (ts === null) continue
    const doUid = trocadas.get(evento.uid) ?? new Set<string>()
    doUid.add(chave(ts))
    trocadas.set(evento.uid, doUid)
  }

  const ocupacao: OcupacaoDoCalendario[] = []
  const acrescentar = (id: string, inicioTs: number, duracao: number) => {
    const fimTs = inicioTs + duracao
    if (!(duracao > 0) || !(fimTs > inicioDaJanela) || !(inicioTs < fimDaJanela)) return
    ocupacao.push({ externalId: id, inicio: paraIso(inicioTs), fim: paraIso(fimTs) })
  }

  for (const evento of eventos) {
    if (!evento.inicio || evento.livre) continue
    const inicioTs = instanteDe(evento.inicio, fusoPadrao)
    if (inicioTs === null) continue
    const duracao = duracaoDe(evento, inicioTs, fusoPadrao)
    if (duracao === null) continue
    const uid = evento.uid || `sem-uid:${chave(inicioTs)}`

    if (evento.recorrencia) {
      const original = instanteDe(evento.recorrencia, fusoPadrao)
      acrescentar(`${uid}:${chave(original ?? inicioTs)}`, inicioTs, duracao)
      continue
    }
    if (!evento.regra) {
      acrescentar(uid, inicioTs, duracao)
      continue
    }

    const excluidas = new Set(
      evento.excecoes
        .map((excecao) => instanteDe(excecao.tipo === 'data' ? naData(evento.inicio!, excecao.data) : excecao, fusoPadrao))
        .filter((ts): ts is number => ts !== null)
        .map(chave),
    )
    const trocadasDoUid = trocadas.get(evento.uid) ?? new Set<string>()
    // UNTIL em data inteira inclui o dia todo (RFC 5545 3.3.10).
    const ateBruto = evento.regra.ate ? instanteDe(evento.regra.ate, fusoPadrao) : null
    const ate = ateBruto !== null && evento.regra.ate?.tipo === 'data' ? ateBruto + 86_400_000 - 1 : ateBruto
    // A última data que pode começar dentro da janela, com um dia de folga
    // para o fuso: a comparação fina é pelo instante, logo abaixo.
    const limite = somarDias(civilDe(fimDaJanela), 1)
    let contadas = 0
    for (const data of datasDaRegra(evento.inicio.data, evento.regra, limite)) {
      const ocorrencia = instanteDe(naData(evento.inicio, data), fusoPadrao)
      if (ocorrencia === null) continue
      if (ate !== null && ocorrencia > ate) break
      contadas++
      if (evento.regra.contagem !== null && contadas > evento.regra.contagem) break
      if (ocorrencia >= fimDaJanela) break
      const id = chave(ocorrencia)
      if (excluidas.has(id) || trocadasDoUid.has(id)) continue
      acrescentar(`${uid}:${id}`, ocorrencia, duracao)
    }
  }
  return ocupacao
}

function civilDe(ts: number): DataCivil {
  const data = new Date(ts)
  return { ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1, dia: data.getUTCDate() }
}

// A porta ------------------------------------------------------------------------

export interface OpcoesDoIcal {
  readonly buscar: Buscar
  /** O endereço secreto, já normalizado, lido do Vault. */
  readonly endereco: string
  /** O fuso do especialista, para horário flutuante e data de dia inteiro. */
  readonly fuso: string
  readonly prazoMs?: number
}

/** A resposta que não é agenda: começa por `BEGIN:VCALENDAR`, ou não é iCal. */
function eIcal(texto: string): boolean {
  return /^\s*BEGIN:VCALENDAR/i.test(texto.replace(/^\uFEFF/, ''))
}

/** Status do endereço, para o motivo. O código cru morre aqui. */
function falhaDoStatus(status: number): FalhaDoCalendario {
  if (status === 401 || status === 403 || status === 404 || status === 410) return falhaDoCalendario('endereco_ical_recusado')
  if (status === 429) return falhaDoCalendario('limite_de_taxa')
  if (status >= 500) return falhaDoCalendario('provedor_indisponivel')
  return falhaDoCalendario('falha_do_calendario')
}

export function criarCalendarioIcal(opcoes: OpcoesDoIcal): PortaDeCalendario {
  const prazoMs = opcoes.prazoMs ?? PRAZO_PADRAO_MS

  async function ler(janela: JanelaAbsoluta): Promise<ResultadoDoCalendario<OcupacaoDoCalendario[]>> {
    const resposta = await opcoes.buscar(opcoes.endereco, {
      method: 'GET',
      headers: { accept: 'text/calendar, text/plain;q=0.8' },
      signal: AbortSignal.timeout(prazoMs),
    })
    if (resposta.status !== 200) return falhaDoStatus(resposta.status)
    const texto = await resposta.text()
    if (texto.length > MAXIMO_DE_CARACTERES || !eIcal(texto)) return falhaDoCalendario('ical_invalido')
    return { ok: true, valor: ocupacaoDoIcal(texto, janela, opcoes.fuso) }
  }

  const soLeitura = async () => falhaDoCalendario('calendario_so_de_leitura')

  return {
    lerOcupacao: ler,
    async conferirHorario(inicio, fim) {
      const lida = await ler({ inicio, fim })
      if (!lida.ok) return lida
      return { ok: true, valor: { livre: !lida.valor.some((item) => sobrepoe(item, { inicio, fim })) } }
    },
    criarEvento: soLeitura,
    apagarEvento: soLeitura,
  }
}
