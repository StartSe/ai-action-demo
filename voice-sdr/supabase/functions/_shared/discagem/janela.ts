// A janela de discagem, medida no fuso do lead (RF-801, T-21, R-10).
//
// A janela mora em `account_settings.dialing_window`: uma faixa por dia da
// semana, com a chave sendo o dia como em `extract(dow from ...)` e o valor
// sendo `{"start": "HH:MM", "end": "HH:MM"}`. Dia ausente é dia sem discagem, e
// a faixa é **fechada no início e aberta no fim**: 09:00 disca, 18:00 não.
//
// Três decisões atravessam o arquivo:
//
// 1. **A autoridade da decisão é o SQL da guarda**, com `at time zone` sobre o
//    fuso do lead (seção 6, passo 4). Este módulo existe para montar a frase da
//    recusa e para a prévia da tela de discagem, e não para decidir se a Sarah
//    liga. Quem decide isso é `guard_dial`, na mesma transação em que grava.
// 2. **A comparação nunca é aritmética de horas** (R-10). A conversão é sempre
//    pelo fuso nomeado, com `Intl`: somar três horas acerta em São Paulo e erra
//    em Manaus, em Rio Branco e em Fernando de Noronha, que são fusos que o
//    Brasil tem de verdade. E erra em toda São Paulo de novo no dia em que o
//    horário de verão voltar.
// 3. **Duas verdades sobre a mesma regra é defeito.** Como a regra vive aqui e
//    no banco, a ponte é teste: `casos-de-janela.ts` é uma tabela de casos só,
//    exercitada pelos dois lados — por este módulo em `test:unit` e pelas
//    funções SQL em PGlite. Divergência entre os dois reprova.
//
// Módulo portável (`_shared/`): sem Deno, sem rede, sem banco e sem relógio.
// `instante` entra por parâmetro como toda regra de tempo desta base.

/** Faixa de um dia, com as chaves da coluna — `start` e `end`, não traduzidas. */
export interface FaixaDaJanela {
  readonly start: string
  readonly end: string
}

/** A janela inteira: dia da semana (`'0'` a `'6'`) para faixa. */
export type JanelaDeDiscagem = Readonly<Record<string, FaixaDaJanela>>

/**
 * Por que a discagem não cabe agora.
 *
 * `dia_sem_faixa` e `janela_invalida` são separados de propósito: "esta conta
 * não disca aos domingos" manda o operador esperar segunda, e "a janela está
 * quebrada" manda alguém abrir a tela de configuração. Tratar configuração
 * malformada como janela vazia esconderia a segunda dentro da primeira.
 */
export type MotivoDaJanela = 'fora_da_faixa' | 'dia_sem_faixa' | 'janela_invalida'

export type SituacaoDaJanela =
  | { readonly dentro: true; readonly faixa: FaixaDaJanela }
  | { readonly dentro: false; readonly motivo: 'fora_da_faixa'; readonly faixa: FaixaDaJanela }
  | { readonly dentro: false; readonly motivo: 'dia_sem_faixa' }
  | { readonly dentro: false; readonly motivo: 'janela_invalida'; readonly erro: string }

/** O que a frase precisa saber: a janela, o instante e os dois fusos (T-21). */
export interface EntradaDaFrase {
  readonly janela: unknown
  readonly instante: string
  readonly fusoDoLead: string
  /** `accounts.timezone`: o fuso de quem lê a frase. */
  readonly fusoDaConta: string
}

/**
 * A janela chega como `unknown` de propósito: ela vem de `jsonb`, e o tipo de
 * uma coluna `jsonb` é promessa do gatilho de validação, não do compilador.
 * Quem lê uma linha antiga, um payload de webhook ou um rascunho de tela
 * precisa da recusa `janela_invalida`, e não de um `as JanelaDeDiscagem`.
 */
export function dentroDaJanela(
  janela: unknown,
  instante: string,
  fusoDoLead: string,
): SituacaoDaJanela {
  const lida = lerJanela(janela)
  if (!lida.ok) return { dentro: false, motivo: 'janela_invalida', erro: lida.erro }

  const partes = partesEm(fusoDoLead, instanteDe(instante, 'instante'))
  const faixa = lida.dias.get(diaDaSemanaDe(partes))
  if (!faixa) return { dentro: false, motivo: 'dia_sem_faixa' }

  // Segundo é o grão da comparação, como do lado do banco (`v_local::time`). O
  // milissegundo cai fora nos dois lados e não muda decisão nenhuma: os limites
  // da faixa são minutos inteiros, e truncar só anda para trás.
  const segundos = partes.hora * 3600 + partes.minuto * 60 + partes.segundo
  const dentro = segundos >= faixa.inicio && segundos < faixa.fim
  return dentro
    ? { dentro: true, faixa: faixa.bruta }
    : { dentro: false, motivo: 'fora_da_faixa', faixa: faixa.bruta }
}

/**
 * O primeiro instante a partir de `instante` em que a janela está aberta, em
 * ISO-8601. Dentro da janela, é o próprio `instante`: a pergunta é "quando
 * libera", e a resposta de quem já está liberado é "agora".
 *
 * Devolve `null` quando nenhum dia abre — janela vazia, que é configuração
 * válida (conta que não disca), e janela malformada, que não é.
 */
export function proximaAbertura(
  janela: unknown,
  instante: string,
  fusoDoLead: string,
): string | null {
  const lida = lerJanela(janela)
  if (!lida.ok) return null

  const ts = instanteDe(instante, 'instante')
  if (dentroDaJanela(janela, instante, fusoDoLead).dentro) return instante

  // Oito voltas: o dia de hoje mais uma semana inteira. Se nenhum dos sete dias
  // da semana abre, não é de mais calendário que a resposta vai aparecer.
  let dia = dataLocalDe(fusoDoLead, ts)
  for (let volta = 0; volta <= 7; volta += 1) {
    const faixa = lida.dias.get(diaDaSemanaDe(dia))
    if (faixa) {
      const abre = instanteDeHoraLocal(fusoDoLead, dia, faixa.inicio)
      if (abre >= ts) return paraIso(abre)
    }
    dia = diaSeguinte(dia)
  }
  return null
}

/**
 * O fuso em que a janela do lead é lida. Lead sem `timezone` cai no fuso da
 * conta, e nunca em UTC: UTC deslocaria a janela em três horas para quem está
 * em São Paulo, e a Sarah ligaria às 21h achando que são 18h.
 */
export function resolverFuso(
  fusoDoLead: string | null | undefined,
  fusoDaConta: string,
): string {
  const doLead = fusoDoLead?.trim()
  if (doLead) return doLead
  const daConta = fusoDaConta.trim()
  if (!daConta) throw new Error('a conta precisa de fuso para a janela ser lida')
  return daConta
}

/**
 * A janela do dia daquele instante, em português e no fuso do lead. Quando o
 * fuso do lead difere o da conta, a frase diz os dois (T-21): quem lê a recusa
 * está olhando o próprio relógio, e "das 9h às 18h" sem mais nada parece
 * mentira para quem vê 19h na parede.
 */
export function fraseDaJanela(entrada: EntradaDaFrase): string {
  const lida = lerJanela(entrada.janela)
  if (!lida.ok) return 'a janela de discagem desta conta está com a configuração inválida'

  const ts = instanteDe(entrada.instante, 'instante')
  const dia = dataLocalDe(entrada.fusoDoLead, ts)
  const faixa = lida.dias.get(diaDaSemanaDe(dia))
  if (!faixa) return `esta conta não disca ${DIAS_NO_PLURAL[diaDaSemanaDe(dia)]}`

  const noFusoDoLead = `das ${horaFalada(faixa.inicio)} às ${horaFalada(faixa.fim)}`
  if (entrada.fusoDaConta === entrada.fusoDoLead) return noFusoDoLead

  const abre = instanteDeHoraLocal(entrada.fusoDoLead, dia, faixa.inicio)
  const fecha = instanteDeHoraLocal(entrada.fusoDoLead, dia, faixa.fim)
  const aqui = `${horaLocal(entrada.fusoDaConta, abre)} às ${horaLocal(entrada.fusoDaConta, fecha)}`
  return `${noFusoDoLead} no horário de ${nomeDoFuso(entrada.fusoDoLead)}, que é ${aqui} aqui`
}

/**
 * Quando a janela abre de novo, em português. `null` quando ela nunca abre, e
 * aí quem chama fala de configuração, não de espera.
 */
export function fraseDaProximaAbertura(entrada: EntradaDaFrase): string | null {
  const abertura = proximaAbertura(entrada.janela, entrada.instante, entrada.fusoDoLead)
  if (!abertura) return null

  const ts = instanteDe(abertura, 'abertura')
  const partes = partesEm(entrada.fusoDoLead, ts)
  const dia = DIAS_DA_SEMANA[diaDaSemanaDe(partes)]
  if (!dia) throw new Error(`instante fora do calendário: ${abertura}`)

  const noFusoDoLead = `${dia} às ${horaLocal(entrada.fusoDoLead, ts)}`
  if (entrada.fusoDaConta === entrada.fusoDoLead) return noFusoDoLead
  const aqui = horaLocal(entrada.fusoDaConta, ts)
  return `${noFusoDoLead} no horário de ${nomeDoFuso(entrada.fusoDoLead)}, que é ${aqui} aqui`
}

/**
 * A hora daquele instante no relógio de parede daquele fuso, escrita como a
 * janela a escreve: `14h`, `14h30`.
 *
 * Exportada porque a recusa por intervalo mínimo diz o horário em que o número
 * libera (RF-407), e duas formas de escrever hora na mesma tela é defeito: a
 * janela falaria `9h30` e o intervalo falaria `09:30` na frase seguinte.
 */
export function horaNoFuso(fuso: string, instante: string): string {
  return horaLocal(fuso, instanteDe(instante, 'instante'))
}

// Leitura da janela --------------------------------------------------------------
//
// As regras são as mesmas do gatilho `validar_janela_de_discagem`, e é por isso
// que a tabela de casos cobra dos dois: o banco recusa a janela malformada na
// escrita, e este módulo a recusa na leitura. O que o gatilho tem a mais é a
// mensagem que nomeia o dia — a tela de configuração é quem precisa dela.

/** Faixa já em segundos do dia, com o texto original ao lado para a frase. */
interface FaixaLida {
  readonly inicio: number
  readonly fim: number
  readonly bruta: FaixaDaJanela
}

type JanelaLida =
  | { readonly ok: true; readonly dias: ReadonlyMap<number, FaixaLida> }
  | { readonly ok: false; readonly erro: string }

const HORA_DO_RELOGIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
/** `24:00` é o fim do dia inteiro e não existe como hora do relógio. */
const FIM_DO_DIA = '24:00'
const DIA_DA_SEMANA = /^[0-6]$/

function lerJanela(janela: unknown): JanelaLida {
  if (typeof janela !== 'object' || janela === null || Array.isArray(janela)) {
    return { ok: false, erro: `a janela precisa ser um objeto, e veio ${tipoDe(janela)}` }
  }

  const dias = new Map<number, FaixaLida>()
  for (const [dia, valor] of Object.entries(janela)) {
    if (!DIA_DA_SEMANA.test(dia)) {
      return { ok: false, erro: `a janela traz o dia "${dia}", e o dia vai de 0 a 6` }
    }
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      return { ok: false, erro: `a faixa do dia ${dia} precisa ser um objeto, e veio ${tipoDe(valor)}` }
    }

    const chaves = Object.keys(valor).sort()
    if (chaves.length !== 2 || chaves[0] !== 'end' || chaves[1] !== 'start') {
      return {
        ok: false,
        erro: `a faixa do dia ${dia} aceita exatamente start e end, e veio: ${chaves.join(', ')}`,
      }
    }

    const { start, end } = valor as { start: unknown; end: unknown }
    if (typeof start !== 'string' || !HORA_DO_RELOGIO.test(start)) {
      return { ok: false, erro: `o início do dia ${dia} precisa ser HH:MM, e veio ${tipoDe(start)}` }
    }
    if (typeof end !== 'string' || (!HORA_DO_RELOGIO.test(end) && end !== FIM_DO_DIA)) {
      return { ok: false, erro: `o fim do dia ${dia} precisa ser HH:MM até 24:00, e veio ${tipoDe(end)}` }
    }
    // Largura fixa faz a comparação de texto ordenar como o relógio.
    if (end <= start) {
      return { ok: false, erro: `a faixa do dia ${dia} vai de ${start} a ${end} e não tem duração` }
    }

    dias.set(Number(dia), { inicio: segundosDoDia(start), fim: segundosDoDia(end), bruta: { start, end } })
  }

  return { ok: true, dias }
}

function tipoDe(valor: unknown): string {
  if (valor === null) return 'null'
  if (Array.isArray(valor)) return 'array'
  if (typeof valor === 'string') return `"${valor}"`
  return typeof valor
}

function segundosDoDia(hora: string): number {
  const h = Number(hora.slice(0, 2))
  const m = Number(hora.slice(3, 5))
  return h * 3600 + m * 60
}

// Frase --------------------------------------------------------------------------

const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const DIAS_NO_PLURAL = [
  'aos domingos',
  'às segundas-feiras',
  'às terças-feiras',
  'às quartas-feiras',
  'às quintas-feiras',
  'às sextas-feiras',
  'aos sábados',
]

/**
 * O nome que se fala do fuso. A zona IANA é identificador, não texto de
 * interface: "no horário de America/Sao_Paulo" não é frase que alguém leia.
 * Os nomes são os das zonas que o Brasil usa, e o que faltar cai no último
 * trecho do identificador, que é o menos errado dos padrões.
 */
const NOMES_DE_FUSO: Readonly<Record<string, string>> = {
  'America/Sao_Paulo': 'São Paulo',
  'America/Manaus': 'Manaus',
  'America/Rio_Branco': 'Rio Branco',
  'America/Campo_Grande': 'Campo Grande',
  'America/Cuiaba': 'Cuiabá',
  'America/Noronha': 'Fernando de Noronha',
  'America/Belem': 'Belém',
  'America/Fortaleza': 'Fortaleza',
  'America/Recife': 'Recife',
  'America/Bahia': 'Salvador',
}

/**
 * O nome de um fuso para gente ler: a cidade de referência, ou o trecho final
 * do identificador. Exportado porque o convite da reunião diz em que fuso está
 * o horário de cada destinatário, e duas grafias do mesmo fuso é defeito.
 */
export function nomeDoFuso(fuso: string): string {
  const conhecido = NOMES_DE_FUSO[fuso]
  if (conhecido) return conhecido
  const trecho = fuso.split('/').pop() ?? fuso
  return trecho.replace(/_/g, ' ')
}

/** `9h`, `9h30`, e `24h` para o fim do dia inteiro, que não tem hora de relógio. */
function horaFalada(segundos: number): string {
  const minutos = Math.floor(segundos / 60)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m === 0 ? `${h}h` : `${h}h${dois(m)}`
}

function horaLocal(fuso: string, instante: number): string {
  const partes = partesEm(fuso, instante)
  return horaFalada(partes.hora * 3600 + partes.minuto * 60)
}

// Calendário -----------------------------------------------------------------------
//
// A conversão é a mesma de `agenda/horarios.ts`, e pela mesma razão: o `Intl` é
// quem conhece a tabela de fusos, e é a única conversão que continua certa
// quando o horário de verão voltar. Exportadas para a política de retentativa
// (`automacao/politica-de-retentativa.ts`) não ter uma terceira cópia.

export interface DataLocal {
  ano: number
  mes: number
  dia: number
}

export interface PartesLocais extends DataLocal {
  hora: number
  minuto: number
  segundo: number
}

const DIA_EM_MS = 86_400_000
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

export function partesEm(fuso: string, instante: number): PartesLocais {
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

export function dataLocalDe(fuso: string, instante: number): DataLocal {
  const { ano, mes, dia } = partesEm(fuso, instante)
  return { ano, mes, dia }
}

/**
 * O instante em que aquele relógio de parede acontece naquele fuso. Duas
 * passagens porque o deslocamento a aplicar é o do instante de destino, não o
 * do palpite: em dia de mudança, os dois diferem em uma hora.
 */
export function instanteDeHoraLocal(fuso: string, data: DataLocal, segundos: number): number {
  const alvo = Date.UTC(
    data.ano,
    data.mes - 1,
    data.dia,
    Math.floor(segundos / 3600),
    Math.floor((segundos % 3600) / 60),
  )
  const primeiro = alvo - (relogioLocal(fuso, alvo) - alvo)
  const segundo = alvo - (relogioLocal(fuso, primeiro) - primeiro)
  if (relogioLocal(fuso, segundo) === alvo) return segundo
  // Buraco de horário de verão: aquele relógio de parede não existiu naquele
  // dia. A janela passa a valer quando o relógio volta a existir — adiantar, e
  // nunca recuar para o dia anterior.
  return Math.max(primeiro, segundo)
}

/** 0 é domingo, como em `extract(dow from ...)`. 1970-01-01 foi quinta-feira. */
export function diaDaSemanaDe(data: DataLocal): number {
  const dias = Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA_EM_MS)
  return (((dias + 4) % 7) + 7) % 7
}

export function diaSeguinte(data: DataLocal): DataLocal {
  return dataLocalDe('UTC', Date.UTC(data.ano, data.mes - 1, data.dia + 1))
}

function instanteDe(iso: string, campo: string): number {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`)
  return ts
}

export function paraIso(instante: number): string {
  const p = partesEm('UTC', instante)
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}:${dois(p.segundo)}Z`
}

function dois(valor: number): string {
  return String(valor).padStart(2, '0')
}
