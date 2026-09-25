// cron-calendar-sync: a ocupação dos próximos 30 dias no banco (seção 4.6, T-10).
//
// Roda a cada 5 minutos, dentro do envelope das rotinas, e grava em
// `specialist_busy_blocks` o que cada calendário conectado diz estar ocupado.
// A ferramenta de agenda lê só o banco: consultar o provedor dentro da ligação
// estoura o prazo (T-10), então a ocupação precisa estar aqui antes.
//
// **Idempotente (RNF-06) e reconciliada.** A gravação é
// `gravar_ocupacao_do_calendario`, que substitui o retrato inteiro do
// calendário numa transação: evento que continua é atualizado pela chave
// `(specialist_id, external_id)`, evento novo entra e evento que sumiu do
// provedor sai. Rodar duas vezes sobre a mesma agenda não duplica bloco, e
// compromisso cancelado não bloqueia horário para sempre.
//
// **Um calendário que falha não para os outros.** Conexão expirada, provedor
// fora do ar ou gravação recusada viram a frase de `sync_error` naquela linha,
// com `synced_at` intocado, e a passagem segue. O envelope só vê erro quando a
// própria anotação da falha não grava: aí é o banco que caiu, e seguir seria
// processar calendários sem conseguir registrar nada.
//
// **A segunda via do evento da reunião** (RF-508) também mora aqui. A
// ferramenta cria o evento na mesma requisição do agendamento; o que falhou lá
// fica em `meetings` com a próxima tentativa, e a rotina, que já abre o
// calendário do especialista a cada cinco minutos, tenta de novo pelas regras
// de `_shared/agenda/evento-da-reuniao.ts` (recuo, teto, idempotência pelo id
// derivado da reunião). Calendário que nem abriu também conta a tentativa: é
// assim que a reunião chega ao teto e aparece marcada na tela, em vez de
// esperar em silêncio uma conexão que ninguém consertou. Uma reunião que falha
// não para as outras nem a ocupação.
//
// **O evento da reunião cancelada sai por aqui também** (US-181). Quem cancela
// é `marcar_desfecho_da_reuniao`, na interface, e o token do calendário só
// existe no servidor; a rotina procura as canceladas que ainda têm
// `external_event_id` e apaga pelo id. Falha deixa o id na linha, e a passagem
// seguinte tenta de novo: não há teto, porque um evento que fica no calendário
// é um especialista esperando um lead que desmarcou.
//
// **Calendário por endereço iCal é só de leitura** (`_shared/agenda/calendario-ical.ts`).
// A rotina lê a ocupação dele como a de qualquer outro, e pula as duas etapas
// do evento: não há onde escrever, e a reunião chega à agenda do especialista
// pelo `.ics` do convite por e-mail. Tentar criaria falha e desistência em
// toda reunião, para um calendário que está funcionando.
//
// **A janela é de instantes absolutos**, do instante da passagem até 30 dias
// depois. Fuso é assunto do adaptador (data local do provedor) e da geração
// de horários, nunca da rotina.
//
// Módulo portável: sem Deno, sem rede, sem banco. A camada de dados e o
// calendário entram por `PortaDaSincronizacao`, implementada em `index.ts` e
// dublada no teste.

import {
  falhaDoCalendario,
  janelaAbsoluta,
  protegerPorta,
  type FalhaDoCalendario,
  type JanelaAbsoluta,
  type OcupacaoDoCalendario,
  type PortaDeCalendario,
} from '../_shared/agenda/calendario.ts'
import {
  TETO_DE_TENTATIVAS,
  apagarEventoDaReuniao,
  criarEventoDaReuniao,
  type PortaDoEventoDaReuniao,
  type ReuniaoParaEvento,
} from '../_shared/agenda/evento-da-reuniao.ts'
import { PROVEDOR_ICAL } from '../_shared/agenda/calendario-ical.ts'
import {
  executarRotina,
  type ItemDaRotina,
  type PortaDeExecucao,
  type ResultadoDaExecucao,
} from '../_shared/rotinas/execucao.ts'
import { segredoDaRotinaConfere } from '../_shared/rotinas/portao.ts'

/** O nome da rotina na seção 4.6 e em `job_runs.routine`. */
export const NOME_DA_ROTINA = 'cron-calendar-sync'

/** Quantos dias à frente a rotina lê (seção 4.6). */
export const DIAS_DA_JANELA = 30

/**
 * Frase de `sync_error` quando a gravação da ocupação foi recusada. A mensagem
 * do banco fica no log, não na linha: ela pode trazer nome de coluna e valor,
 * e a tela de especialistas mostra `sync_error` a quem administra.
 */
export const FALHA_AO_GRAVAR =
  'A ocupação lida do calendário não pôde ser gravada. A leitura se repete sozinha na próxima passagem.'

/** Uma linha de `reivindicar_calendarios_para_sincronizar`. */
export interface CalendarioParaSincronizar {
  readonly id: string
  readonly account_id: string
  readonly specialist_id: string
  readonly provider: string
  readonly external_id: string
  readonly refresh_secret_id: string
  /** `specialists.timezone`: como o adaptador lê data local do provedor. */
  readonly timezone: string
}

/** Um bloco como vai para `gravar_ocupacao_do_calendario`. */
export interface BlocoDeOcupacao {
  readonly external_id: string
  readonly starts_at: string
  readonly ends_at: string
}

export interface OcupacaoParaGravar {
  readonly calendarioId: string
  readonly blocos: readonly BlocoDeOcupacao[]
  readonly instante: string
}

export interface PortaDaSincronizacao extends PortaDoEventoDaReuniao {
  /** `reivindicar_calendarios_para_sincronizar`: `for update skip locked`, grava `sync_claimed_at`. */
  reivindicarCalendarios(limite: number, instante: string): Promise<readonly CalendarioParaSincronizar[]>
  /**
   * O calendário do especialista, pronto para ler: resolve o token pelo Vault
   * e monta o adaptador do provedor. Sem token, ou provedor sem adaptador,
   * devolve a falha no lugar da porta.
   */
  abrirCalendario(calendario: CalendarioParaSincronizar): Promise<PortaDeCalendario | FalhaDoCalendario>
  /** `gravar_ocupacao_do_calendario`: substitui o retrato e avança `synced_at`. */
  gravarOcupacao(ocupacao: OcupacaoParaGravar): Promise<void>
  /** `registrar_falha_de_sincronizacao`: grava `sync_error`, não toca em `synced_at`. */
  registrarFalha(calendarioId: string, mensagem: string): Promise<void>
  /**
   * As reuniões ativas e futuras do especialista do calendário ainda sem
   * evento, com menos de `teto` tentativas e cuja próxima tentativa (ou
   * nenhuma, se a ferramenta nem chegou a registrar) já passou de `instante`.
   * No máximo `limite`.
   */
  reunioesSemEvento(
    calendario: CalendarioParaSincronizar,
    filtro: { readonly instante: string; readonly teto: number; readonly limite: number },
  ): Promise<readonly ReuniaoParaEvento[]>
  /**
   * As reuniões canceladas do especialista do calendário que ainda têm
   * `external_event_id`. No máximo `limite`.
   */
  reunioesCanceladasComEvento(
    calendario: CalendarioParaSincronizar,
    filtro: { readonly limite: number },
  ): Promise<readonly EventoCancelado[]>
  /** Para onde vai o que não pode ir para a linha (mensagem do banco). */
  registrarNoLog?(evento: Readonly<Record<string, unknown>>): void
}

/** A reunião cancelada cujo evento ainda está no calendário do especialista. */
export interface EventoCancelado {
  readonly id: string
  readonly account_id: string
  readonly external_event_id: string
}

/** A janela da passagem: do instante até `DIAS_DA_JANELA` dias depois. */
export function janelaDaPassagem(instante: string): JanelaAbsoluta {
  const inicio = Date.parse(instante)
  return janelaAbsoluta(
    new Date(inicio).toISOString(),
    new Date(inicio + DIAS_DA_JANELA * 24 * 60 * 60_000).toISOString(),
  )
}

/**
 * A ocupação como o banco a recebe. Bloco sem duração sai: o check de
 * `specialist_busy_blocks` o recusaria, e um evento torto derrubaria a agenda
 * inteira. Repetido pelo mesmo evento fica o primeiro, porque a chave única
 * não aceita dois no mesmo comando.
 */
export function blocosDaOcupacao(ocupacao: readonly OcupacaoDoCalendario[]): BlocoDeOcupacao[] {
  const vistos = new Set<string>()
  const blocos: BlocoDeOcupacao[] = []
  for (const item of ocupacao) {
    const chave = item.externalId.trim()
    if (!chave || vistos.has(chave)) continue
    if (!(Date.parse(item.fim) > Date.parse(item.inicio))) continue
    vistos.add(chave)
    blocos.push({ external_id: chave, starts_at: item.inicio, ends_at: item.fim })
  }
  return blocos
}

type ItemDoCalendario = ItemDaRotina & { readonly calendario: CalendarioParaSincronizar }

export interface PedidoDaSincronizacao {
  readonly porta: PortaDaSincronizacao
  readonly execucao: PortaDeExecucao
  readonly agora?: () => number
}

/** Uma passagem de `cron-calendar-sync`, dentro do envelope das rotinas. */
export function sincronizarCalendarios(pedido: PedidoDaSincronizacao): Promise<ResultadoDaExecucao> {
  const { porta } = pedido

  return executarRotina<ItemDoCalendario>({
    nome: NOME_DA_ROTINA,
    porta: pedido.execucao,
    agora: pedido.agora,
    trabalho: {
      async reivindicar(limite, instante) {
        const calendarios = await porta.reivindicarCalendarios(limite, instante)
        return calendarios.map((calendario) => ({ chave: calendario.id, calendario }))
      },
      async processar(item, instante) {
        await sincronizarUm(porta, item.calendario, instante)
      },
    },
  })
}

/** Quantas reuniões sem evento cada passagem por um calendário tenta. */
export const EVENTOS_POR_PASSAGEM = 10

/** Provedores que a rotina só lê: nada de evento da reunião por eles. */
export const PROVEDORES_SO_DE_LEITURA: ReadonlySet<string> = new Set([PROVEDOR_ICAL])

async function sincronizarUm(porta: PortaDaSincronizacao, calendario: CalendarioParaSincronizar, instante: string) {
  let aberto: PortaDeCalendario | FalhaDoCalendario
  try {
    aberto = await porta.abrirCalendario(calendario)
  } catch {
    // Exceção ao montar a porta (Vault fora, fuso inválido): a mensagem pode
    // trazer o que não deve ir para a linha, e para quem administra é o mesmo
    // que o calendário não ter respondido.
    aberto = falhaDoCalendario('sem_resposta')
  }
  await sincronizarOcupacao(porta, calendario, aberto, instante)
  if (PROVEDORES_SO_DE_LEITURA.has(calendario.provider)) return
  await reenviarEventos(porta, calendario, aberto, instante)
  await apagarEventosCancelados(porta, calendario, aberto)
}

async function sincronizarOcupacao(
  porta: PortaDaSincronizacao,
  calendario: CalendarioParaSincronizar,
  aberto: PortaDeCalendario | FalhaDoCalendario,
  instante: string,
) {
  if ('ok' in aberto) {
    await porta.registrarFalha(calendario.id, aberto.mensagem)
    return
  }

  // Protegida aqui também: o adaptador do Google já vem protegido, mas a
  // rotina não pode depender de quem montou a porta para seguir aos outros.
  const lida = await protegerPorta(aberto).lerOcupacao(janelaDaPassagem(instante))
  if (!lida.ok) {
    await porta.registrarFalha(calendario.id, lida.mensagem)
    return
  }

  try {
    await porta.gravarOcupacao({ calendarioId: calendario.id, blocos: blocosDaOcupacao(lida.valor), instante })
  } catch (erro) {
    porta.registrarNoLog?.({
      funcao: NOME_DA_ROTINA,
      passo: 'gravar_ocupacao',
      calendario: calendario.id,
      erro: mensagemDe(erro),
    })
    await porta.registrarFalha(calendario.id, FALHA_AO_GRAVAR)
  }
}

/**
 * Nova tentativa do evento de cada reunião pendente do especialista. Exceção
 * de banco numa reunião vai para o log e a seguinte segue: a reunião continua
 * pendente e volta na próxima passagem.
 */
async function reenviarEventos(
  porta: PortaDaSincronizacao,
  calendario: CalendarioParaSincronizar,
  aberto: PortaDeCalendario | FalhaDoCalendario,
  instante: string,
) {
  let pendentes: readonly ReuniaoParaEvento[]
  try {
    pendentes = await porta.reunioesSemEvento(calendario, {
      instante,
      teto: TETO_DE_TENTATIVAS,
      limite: EVENTOS_POR_PASSAGEM,
    })
  } catch (erro) {
    porta.registrarNoLog?.({ funcao: NOME_DA_ROTINA, passo: 'reunioes_sem_evento', calendario: calendario.id, erro: mensagemDe(erro) })
    return
  }
  const agora = () => Date.parse(instante)
  for (const reuniao of pendentes) {
    try {
      await criarEventoDaReuniao({ reuniao, calendario: aberto, porta, agora })
    } catch (erro) {
      porta.registrarNoLog?.({ funcao: NOME_DA_ROTINA, passo: 'evento_da_reuniao', reuniao: reuniao.id, erro: mensagemDe(erro) })
    }
  }
}

/**
 * O evento de cada reunião cancelada sai do calendário. Calendário que falha
 * (inclusive o que nem abriu) deixa o id na linha para a próxima passagem, e
 * a falha vai para o log: a linha do calendário já recebeu a frase na
 * ocupação, e a reunião não tem coluna de erro de remoção.
 */
async function apagarEventosCancelados(
  porta: PortaDaSincronizacao,
  calendario: CalendarioParaSincronizar,
  aberto: PortaDeCalendario | FalhaDoCalendario,
) {
  let cancelados: readonly EventoCancelado[]
  try {
    cancelados = await porta.reunioesCanceladasComEvento(calendario, { limite: EVENTOS_POR_PASSAGEM })
  } catch (erro) {
    porta.registrarNoLog?.({ funcao: NOME_DA_ROTINA, passo: 'reunioes_canceladas', calendario: calendario.id, erro: mensagemDe(erro) })
    return
  }
  for (const reuniao of cancelados) {
    try {
      const desfecho = await apagarEventoDaReuniao({ reuniao, calendario: aberto, porta })
      if (!desfecho.ok) {
        porta.registrarNoLog?.({ funcao: NOME_DA_ROTINA, passo: 'apagar_evento', reuniao: reuniao.id, erro: desfecho.motivo })
      }
    } catch (erro) {
      porta.registrarNoLog?.({ funcao: NOME_DA_ROTINA, passo: 'apagar_evento', reuniao: reuniao.id, erro: mensagemDe(erro) })
    }
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
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
  sincronizacao: PedidoDaSincronizacao,
  opcoes: { readonly segredoInterno: string },
): Promise<RespostaDaRotina> {
  if (pedido.metodo.toUpperCase() !== 'POST') return { status: 405, corpo: { ok: false } }
  if (!(await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno))) {
    return { status: 401, corpo: { ok: false } }
  }

  const resultado = await sincronizarCalendarios(sincronizacao)
  return { status: resultado.ok ? 200 : 500, corpo: { ...resultado } }
}
