// A porta do calendário externo do especialista (RF-507, RF-508, T-10).
//
// A regra da agenda não conhece provedor. Quem lê a ocupação
// (`cron-calendar-sync`), quem confere o horário antes de marcar e quem escreve
// o evento (`tool-book-meeting`) falam com `PortaDeCalendario`, e o que é do
// Google mora em `calendario-google.ts`, montado pelo `index.ts` de quem o usa.
// Trocar de provedor é escrever outro adaptador, não caçar SDK pelo código.
//
// Três regras seguram o arquivo:
//
// 1. **A janela é de instantes absolutos.** A porta recebe e devolve ISO-8601
//    com deslocamento, nunca data local. Converter fuso é da geração de
//    horários (`horarios.ts`); um provedor que devolve data local (evento de
//    dia inteiro, `dateTime` sem deslocamento) é normalizado no adaptador, por
//    `normalizarHorarioDoProvedor`, antes de a regra ver o dado.
// 2. **Código do provedor morre aqui**, como o código do banco. A porta nunca
//    levanta e nunca devolve o código bruto: devolve `FalhaDoCalendario`, com
//    estado, motivo nosso e frase em português.
// 3. **O estado tem quatro valores, como o dos provedores da F0.** `erro` pede
//    ação de quem administra (a credencial foi recusada); `indisponivel` pede
//    só que se tente de novo (o provedor não respondeu). Juntar os dois joga
//    em quem administra um problema que não é dele.
//
// Portável: sem Deno, sem SDK, sem import de rede.

import { traduzirErroDoProvedor, type MotivoDoProvedor } from '../provedor/erros.ts'
import type { CofreDeCredenciais } from '../secrets.ts'
import { instanteDoRelogio } from './horarios.ts'

// Contrato ---------------------------------------------------------------------

/** Os quatro estados da conexão. `testando` é da tela, não do servidor. */
export type EstadoDaConexaoDoCalendario = 'conectado' | 'nao_configurado' | 'erro' | 'indisponivel'

/** Janela de leitura, em instantes absolutos (ISO-8601 com deslocamento). */
export interface JanelaAbsoluta {
  readonly inicio: string
  readonly fim: string
}

/** Um compromisso lido do calendário, já em instantes absolutos. */
export interface OcupacaoDoCalendario {
  /** Identificador do evento no provedor: é a chave de `specialist_busy_blocks.external_id`. */
  readonly externalId: string
  readonly inicio: string
  readonly fim: string
}

/** O que o evento da reunião carrega (RF-508). Nada além do necessário. */
export interface EventoDaReuniao {
  /** `meetings.id`. O adaptador deriva dele o id do evento, e é isso que torna a criação idempotente. */
  readonly reuniaoId: string
  readonly inicio: string
  readonly fim: string
  readonly titulo: string
  readonly descricao: string
  /** Link da sala (`specialists.room_url`) ou endereço, quando houver. */
  readonly local: string | null
}

/**
 * Por que o calendário não respondeu o que se pediu. Os dois primeiros são do
 * calendário; os outros vêm da tabela comum de `_shared/provedor/erros.ts`.
 */
export type MotivoDoCalendario =
  | 'nao_conectado'
  | 'conexao_expirada'
  | 'sem_permissao_de_calendario'
  | 'agenda_nao_encontrada'
  | 'limite_de_taxa'
  | 'provedor_indisponivel'
  | 'sem_resposta'
  | 'falha_do_calendario'
  // Os três do calendário por endereço iCal (`calendario-ical.ts`).
  | 'endereco_ical_recusado'
  | 'ical_invalido'
  | 'calendario_so_de_leitura'

export interface FalhaDoCalendario {
  readonly ok: false
  readonly estado: Exclude<EstadoDaConexaoDoCalendario, 'conectado'>
  readonly motivo: MotivoDoCalendario
  readonly mensagem: string
}

export type ResultadoDoCalendario<T> = { readonly ok: true; readonly valor: T } | FalhaDoCalendario

/**
 * O calendário de um especialista. Uma instância por calendário conectado: a
 * credencial e a agenda já estão dentro dela. Nenhum método levanta; o que dá
 * errado volta como `FalhaDoCalendario`.
 */
export interface PortaDeCalendario {
  /** A ocupação da janela inteira. É o que a rotina de cinco em cinco minutos grava. */
  lerOcupacao(janela: JanelaAbsoluta): Promise<ResultadoDoCalendario<OcupacaoDoCalendario[]>>
  /** Consulta pontual de um horário, antes de marcar (T-10): livre ou tomado. */
  conferirHorario(inicio: string, fim: string): Promise<ResultadoDoCalendario<{ readonly livre: boolean }>>
  /** Escreve o evento da reunião. Repetir para a mesma reunião devolve o mesmo evento. */
  criarEvento(reuniao: EventoDaReuniao): Promise<ResultadoDoCalendario<{ readonly externalEventId: string }>>
  /** Apaga o evento. Evento que já não existe conta como apagado. */
  apagarEvento(externalEventId: string): Promise<ResultadoDoCalendario<{ readonly apagado: true }>>
}

// Frases -----------------------------------------------------------------------

// Registro de interface, não fala da Sarah: direto e declarativo, sem travessão
// (docs/padrao-de-interface.md seção 4). A tela de especialistas lê estas
// frases do corpo, e a fila de exceções também.
export const MENSAGENS_DO_CALENDARIO: Record<MotivoDoCalendario, string> = {
  nao_conectado:
    'Este especialista não tem calendário conectado. Os horários saem só da disponibilidade cadastrada aqui.',
  conexao_expirada:
    'A conexão com o calendário expirou, reconecte a agenda deste especialista para voltar a ler a ocupação.',
  sem_permissao_de_calendario:
    'O aplicativo ainda não tem permissão de calendário. É o estado normal enquanto o Google não conclui a verificação, e não depende de quem administra a conta.',
  agenda_nao_encontrada:
    'A agenda conectada não foi encontrada no calendário. Reconecte o calendário deste especialista e escolha a agenda de novo.',
  limite_de_taxa:
    'O calendário recusou por excesso de consultas. A conexão continua de pé, e a leitura se repete sozinha em alguns minutos.',
  provedor_indisponivel:
    'O calendário está fora do ar. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.',
  sem_resposta:
    'O calendário não respondeu no tempo esperado. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.',
  falha_do_calendario:
    'O calendário recusou o pedido e não informou o motivo. Reconecte a agenda deste especialista se a falha continuar.',
  endereco_ical_recusado:
    'O endereço iCal não abriu. Confira se colou o endereço secreto inteiro, ou gere outro no calendário e cole aqui de novo.',
  ical_invalido:
    'O endereço respondeu, mas não com uma agenda no formato iCal. Copie de novo o endereço secreto no formato iCal do calendário.',
  calendario_so_de_leitura:
    'O calendário por endereço iCal é só de leitura. A reunião chega à agenda do especialista pelo convite por e-mail.',
}

/**
 * Motivos que deixam a conexão em `indisponivel`: nada a fazer além de
 * esperar. O limite de taxa entra aqui, ao contrário da tabela da F0, porque a
 * credencial do calendário não tem plano a trocar: excesso de consulta passa
 * sozinho, e mandar quem administra reconectar não o resolveria.
 */
const SO_ESPERAR: ReadonlySet<MotivoDoCalendario> = new Set([
  'limite_de_taxa',
  'provedor_indisponivel',
  'sem_resposta',
])

export function falhaDoCalendario(motivo: MotivoDoCalendario): FalhaDoCalendario {
  const estado = motivo === 'nao_conectado' ? 'nao_configurado' : SO_ESPERAR.has(motivo) ? 'indisponivel' : 'erro'
  return { ok: false, estado, motivo, mensagem: MENSAGENS_DO_CALENDARIO[motivo] }
}

// Tradução do erro do provedor ---------------------------------------------------

/**
 * Códigos que só o calendário produz, antes da tabela comum. `invalid_grant` é
 * o token de renovação revogado ou vencido; a recusa de escopo é o aplicativo
 * sem permissão de calendário, que é o estado de toda conta enquanto a
 * verificação OAuth do Google não sai (P-04).
 */
const DO_CALENDARIO: ReadonlyArray<readonly [RegExp, MotivoDoCalendario]> = [
  [/invalid[_\-\s]?grant|expired[_\-\s]?or[_\-\s]?revoked/i, 'conexao_expirada'],
  [
    /insufficient[_\-\s]?(scope|permissions?)|scope[_\-\s]?insufficient|access[_\-\s]?denied|unverified|app[_\-\s]?not[_\-\s]?verified|admin[_\-\s]?policy/i,
    'sem_permissao_de_calendario',
  ],
  [/rate[_\-\s]?limit|quota[_\-\s]?exceeded|usage[_\-\s]?limits/i, 'limite_de_taxa'],
  [/not[_\-\s]?found/i, 'agenda_nao_encontrada'],
]

/** A tabela comum, relida para o calendário: aqui a "chave" é a conexão. */
const DA_TABELA_COMUM: Record<MotivoDoProvedor, MotivoDoCalendario> = {
  chave_invalida: 'conexao_expirada',
  sem_permissao: 'sem_permissao_de_calendario',
  sem_credito: 'limite_de_taxa',
  limite_de_taxa: 'limite_de_taxa',
  provedor_indisponivel: 'provedor_indisponivel',
  sem_resposta: 'sem_resposta',
  falha_do_provedor: 'falha_do_calendario',
  // Só a Z-API produz este motivo; para o calendário é uma falha sem nome.
  sessao_desconectada: 'falha_do_calendario',
}

/**
 * Reduz o que o provedor respondeu a estado, motivo e frase. O código bruto é
 * lido aqui e morre aqui: nada do que esta função devolve o carrega.
 */
export function traduzirErroDoCalendario(
  codigo: string | null | undefined,
  status?: number | null,
): FalhaDoCalendario {
  const texto = codigo?.trim() ?? ''
  if (texto) {
    for (const [padrao, motivo] of DO_CALENDARIO) {
      if (padrao.test(texto)) return falhaDoCalendario(motivo)
    }
  }
  if (!texto && status === 404) return falhaDoCalendario('agenda_nao_encontrada')
  return falhaDoCalendario(DA_TABELA_COMUM[traduzirErroDoProvedor(texto, status).motivo])
}

/** O estado da conexão a partir do que a última ida ao calendário respondeu. */
export function estadoDaConexao(
  resultado: ResultadoDoCalendario<unknown> | null,
): EstadoDaConexaoDoCalendario {
  if (!resultado) return 'nao_configurado'
  return resultado.ok ? 'conectado' : resultado.estado
}

/**
 * Embrulha um adaptador para que exceção do provedor não atravesse a porta. O
 * que o adaptador deixou escapar (rede caída, JSON torto, prazo estourado) é
 * `sem_resposta`, e a mensagem da exceção fica para trás: ela pode trazer URL,
 * código ou corpo do provedor.
 *
 * A janela se confere **antes**, fora da proteção: data local ou janela sem
 * duração é defeito de quem chama, e virar `sem_resposta` o esconderia atrás de
 * uma falha de rede que não houve.
 */
export function protegerPorta(porta: PortaDeCalendario): PortaDeCalendario {
  const proteger = async <T>(ida: () => Promise<ResultadoDoCalendario<T>>): Promise<ResultadoDoCalendario<T>> => {
    try {
      return await ida()
    } catch {
      return falhaDoCalendario('sem_resposta')
    }
  }
  return {
    lerOcupacao: (janela) => {
      const conferida = janelaAbsoluta(janela.inicio, janela.fim)
      return proteger(() => porta.lerOcupacao(conferida))
    },
    conferirHorario: (inicio, fim) => {
      const conferida = janelaAbsoluta(inicio, fim)
      return proteger(() => porta.conferirHorario(conferida.inicio, conferida.fim))
    },
    criarEvento: (reuniao) => {
      const conferida = janelaAbsoluta(reuniao.inicio, reuniao.fim)
      return proteger(() => porta.criarEvento({ ...reuniao, inicio: conferida.inicio, fim: conferida.fim }))
    },
    apagarEvento: (id) => proteger(() => porta.apagarEvento(id)),
  }
}

// Credencial ---------------------------------------------------------------------

/** Provedor e chave com que o token de renovação desce a cascata de `secrets.ts`. */
export const SEGREDO_DO_CALENDARIO = { provedor: 'google_calendar', chave: 'refresh_token' } as const

/** O recurso do degrau do meio: a linha de `specialist_calendars`, cujo `refresh_secret_id` aponta o Vault. */
export const RECURSO_DO_CALENDARIO = 'specialist_calendars'

export interface CalendarioConectado {
  readonly id: string
  readonly contaId: string
}

/**
 * O token de renovação do calendário, resolvido por `secrets.ts` com a linha
 * de `specialist_calendars` como recurso. O `index.ts` implementa
 * `segredoDoRecurso` lendo o Vault por `refresh_secret_id`. O valor fica na
 * borda: vai para o adaptador e para `conferirQueNaoVazou`, e para mais nada.
 * Sem valor, o calendário está `nao_configurado`.
 */
export async function resolverTokenDoCalendario(
  cofre: CofreDeCredenciais,
  calendario: CalendarioConectado,
): Promise<{ readonly ok: true; readonly token: string } | FalhaDoCalendario> {
  const resolucao = await cofre.resolveSecret(
    calendario.contaId,
    SEGREDO_DO_CALENDARIO.provedor,
    SEGREDO_DO_CALENDARIO.chave,
    { recurso: { tipo: RECURSO_DO_CALENDARIO, id: calendario.id } },
  )
  return resolucao.ok ? { ok: true, token: resolucao.valor } : falhaDoCalendario('nao_conectado')
}

// Instantes ---------------------------------------------------------------------

const COM_DESLOCAMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i
const SEM_DESLOCAMENTO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/

/** Instante ISO-8601 com deslocamento explícito, e só ele. Data local não serve. */
export function eInstanteAbsoluto(valor: string): boolean {
  return COM_DESLOCAMENTO.test(valor) && !Number.isNaN(Date.parse(valor))
}

/**
 * Monta a janela da porta, recusando data local e janela sem duração. A
 * recusa é exceção porque é defeito de quem chama: a janela nasce do relógio
 * da rotina, nunca de dado de fora.
 */
export function janelaAbsoluta(inicio: string, fim: string): JanelaAbsoluta {
  if (!eInstanteAbsoluto(inicio)) throw new Error(`início da janela sem deslocamento: ${inicio}`)
  if (!eInstanteAbsoluto(fim)) throw new Error(`fim da janela sem deslocamento: ${fim}`)
  if (Date.parse(fim) <= Date.parse(inicio)) throw new Error(`janela sem duração: ${inicio} a ${fim}`)
  return { inicio: paraUtc(Date.parse(inicio)), fim: paraUtc(Date.parse(fim)) }
}

/** Como o provedor escreve um horário: instante, relógio local ou data de dia inteiro. */
export interface HorarioDoProvedor {
  /** `dateTime`: com deslocamento, ou relógio de parede no `fuso`. */
  readonly instante?: string | null
  /** `date`: dia inteiro, que começa à meia-noite do fuso da agenda. */
  readonly data?: string | null
  /** Fuso declarado no próprio horário, que vence o da agenda. */
  readonly fuso?: string | null
}

/**
 * O instante absoluto de um horário do provedor, em ISO-8601 UTC, ou `null`
 * quando não há o que ler. Relógio sem deslocamento e data de dia inteiro são
 * lidos no fuso do próprio horário, senão no da agenda. Nulo não é erro: a
 * leitura de catálogo externo descarta o item e segue com os outros.
 */
export function normalizarHorarioDoProvedor(horario: HorarioDoProvedor, fusoDaAgenda: string): string | null {
  const fuso = horario.fuso?.trim() || fusoDaAgenda
  const instante = horario.instante?.trim()
  if (instante) {
    if (COM_DESLOCAMENTO.test(instante)) {
      const ts = Date.parse(instante)
      return Number.isNaN(ts) ? null : paraUtc(ts)
    }
    const local = SEM_DESLOCAMENTO.exec(instante)
    if (!local) return null
    const [, ano, mes, dia, hora, minuto, segundo] = local
    const data = dataValida(Number(ano), Number(mes), Number(dia))
    if (!data || Number(hora) > 23 || Number(minuto) > 59) return null
    const ts = relogioEmFuso(fuso, data, Number(hora) * 60 + Number(minuto))
    return ts === null ? null : paraUtc(ts + Number(segundo ?? '0') * 1000)
  }
  const somenteData = SO_DATA.exec(horario.data?.trim() ?? '')
  if (!somenteData) return null
  const data = dataValida(Number(somenteData[1]), Number(somenteData[2]), Number(somenteData[3]))
  if (!data) return null
  const ts = relogioEmFuso(fuso, data, 0)
  return ts === null ? null : paraUtc(ts)
}

/** `[)` como no banco: quem termina às 10h convive com quem começa às 10h. */
export function sobrepoe(a: { inicio: string; fim: string }, b: { inicio: string; fim: string }): boolean {
  return Date.parse(a.inicio) < Date.parse(b.fim) && Date.parse(b.inicio) < Date.parse(a.fim)
}

function dataValida(ano: number, mes: number, dia: number): { ano: number; mes: number; dia: number } | null {
  const ts = Date.UTC(ano, mes - 1, dia)
  const conferida = new Date(ts)
  if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) {
    return null
  }
  return { ano, mes, dia }
}

function relogioEmFuso(fuso: string, data: { ano: number; mes: number; dia: number }, minutos: number): number | null {
  try {
    return instanteDoRelogio(fuso, data, minutos)
  } catch {
    // Fuso que o provedor inventou: melhor descartar o item do que lê-lo em UTC.
    return null
  }
}

function paraUtc(ts: number): string {
  return new Date(ts).toISOString().replace('.000Z', 'Z')
}
