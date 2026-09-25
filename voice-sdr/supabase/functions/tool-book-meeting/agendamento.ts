// tool-book-meeting: a reunião marcada no horário que o lead escolheu (RF-506,
// seção 9 do PRD). Referência: docs/PRD-implementacao.md seção 5,
// docs/revisao-tecnica.md T-08, T-09, T-10, T-16 e T-23.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`). O que
// ela decide, nesta ordem:
//
// 1. **Só horário oferecido nesta chamada** (T-09). `slot_position` é "a
//    segunda opção" e se resolve contra `call_slot_offers` da chamada do
//    cabeçalho. Posição que não foi oferecida e oferta vencida são recusadas
//    com a mesma fala, que pede nova consulta: o roteiro chama
//    `tool-availability` de novo. Horário ditado pelo modelo não existe como
//    entrada, e é isso que impede a Sarah de marcar o que ninguém ofereceu.
// 2. **Checagem ao vivo, pontual** (T-10). Antes de inserir, o horário escolhido
//    é conferido no calendário externo do especialista por
//    `PortaDeCalendario.conferirHorario` — uma consulta de um horário, não a
//    ocupação inteira, que é da rotina de cinco minutos. Conflito ali é horário
//    tomado, com a mesma fala do 23P01. Especialista sem calendário conectado
//    não tem o que conferir. **Calendário que não responde não impede a
//    marcação**: a oferta já saiu da ocupação sincronizada e a restrição de
//    exclusão segura as reuniões nossas, e perder a reunião porque o Google
//    demorou é pior do que um conflito raro que a pessoa resolve remarcando.
// 3. **A inserção é do RPC** `agendar_reuniao` (US-161), com teto e
//    antecedência sob lock. Cada código vira fala própria; `horario_ocupado` é
//    o 23P01 da restrição de exclusão e é resultado esperado: `ok: false` com a
//    frase do PRD, nunca 500 e nunca exceção vazando para o provedor.
//    `fora_da_disponibilidade`, oitavo código do RPC, é a faixa ou o bloqueio
//    que mudou entre a oferta e a escolha: para quem está na linha é o mesmo
//    horário tomado.
//
// **A resposta do caminho feliz sai de `ler`**, e a de verdade, de `efeitos`:
// só o insert sabe se o horário foi tomado no meio, e por isso `efeitos`
// devolve o `ResultadoDoEfeito` que troca a resposta. `ler` já decide a
// confirmação, que é o que o ensaio (T-16) responde: toda a leitura, inclusive
// a checagem ao vivo, e nenhum efeito — sem reunião, sem calendário, sem
// e-mail, sem oferta consumida. O ensaio devolve `meeting_id` nulo, porque
// reunião nenhuma nasceu.
//
// **Oferta consumida.** Marcada a reunião, as ofertas da chamada deixam de
// existir: "a segunda opção" dita de novo não pode resolver horário nenhum.
// Recusa não consome, porque a consulta seguinte substitui as ofertas.
//
// **`booked_call_id`** é a chamada do cabeçalho (T-23): é o que liga reunião e
// ligação no custo por reunião.
//
// **O evento no calendário do especialista** (RF-508) nasce em `efeitos`,
// depois do insert e na mesma requisição, por `_shared/agenda/evento-da-reuniao.ts`.
// Ele não desfaz a reunião: falha do calendário fica na linha com a próxima
// tentativa, que é de `cron-calendar-sync`, e até exceção do banco nessa etapa
// é engolida e registrada no log. A resposta à Sarah não muda: o lead já ouviu
// a confirmação, e reunião sem evento ainda é reunião.
//
// **E-mail.** O que o lead ditou preenche `leads.email` quando ele está vazio
// (preenche, não sobrescreve): é para ali que o convite vai. E-mail fora da
// forma é ignorado, e a reunião sai do mesmo jeito.
//
// **O convite por e-mail** (RF-509) sai em `efeitos`, depois do e-mail do lead
// preenchido e junto com o evento, por `_shared/agenda/convite-de-reuniao.ts`.
// Junto, e não depois: o orçamento da ferramenta corre a execução inteira, e
// estourá-lo faria a Sarah dizer a frase de contorno sobre uma reunião que foi
// marcada. Como o evento, o convite não desfaz a reunião nem muda a resposta:
// o que falhar fica na linha com a próxima tentativa, que é de
// `cron-meeting-invite`, e exceção vai para o log.
//
// Módulo portável: sem `Deno`, sem rede. O `index.ts` monta as portas sobre o
// Supabase com a chave de serviço e o calendário sobre o adaptador do Google.

import type { FalhaDoCalendario, PortaDeCalendario } from '../_shared/agenda/calendario.ts'
import {
  enviarConvitesDaReuniao,
  type PortaDoConviteDaReuniao,
  type ReuniaoParaConvite,
} from '../_shared/agenda/convite-de-reuniao.ts'
import {
  criarEventoDaReuniao,
  type PortaDoEventoDaReuniao,
  type ReuniaoParaEvento,
} from '../_shared/agenda/evento-da-reuniao.ts'
import { MODALIDADES_DA_REUNIAO } from '../_shared/agenda/modalidades.ts'
import type { FalhaDoEmail, PortaDeEmail } from '../_shared/email/email.ts'
import { FALAS_DA_AGENDA, falarConfirmacao, type HorarioFalado } from '../_shared/speech/agenda.ts'
import {
  criarFerramenta,
  type ExecutorDaFerramenta,
  type ContextoDoExecutor,
  type ResultadoDoEfeito,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** Uma linha de `call_slot_offers`, com o fuso do especialista dela. */
export interface OfertaDaChamada {
  readonly position: number
  readonly specialist_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly expires_at: string
  /** `specialists.timezone`, para a confirmação dizer o relógio dele quando difere. */
  readonly fusoDoEspecialista: string
}

/** O que `ler` consulta. Nunca escreve. */
export interface PortaDeAgendamento {
  /** A oferta desta chamada nesta posição. Nula quando não foi oferecida. */
  ofertaDaChamada(contaId: string, chamadaId: string, posicao: number): Promise<OfertaDaChamada | null>
  /** `leads.timezone`, senão `accounts.timezone`. */
  fusoDoLead(contaId: string, leadId: string): Promise<string>
  /**
   * O calendário externo conectado do especialista, aberto. Nulo quando ele
   * não tem calendário: aí não há o que conferir ao vivo.
   */
  calendarioDoEspecialista(contaId: string, especialistaId: string): Promise<PortaDeCalendario | null>
}

/** Os parâmetros de `agendar_reuniao`, com as chaves da função SQL. */
export interface PedidoDeReuniao {
  readonly p_account_id: string
  readonly p_lead_id: string
  readonly p_specialist_id: string
  readonly p_starts_at: string
  readonly p_ends_at: string
  readonly p_modality: Modalidade
  readonly p_notes: string | null
  /** A chamada que marcou. Nula quando a marcação veio de uma conversa por WhatsApp. */
  readonly p_booked_call_id: string | null
}

/** O que `agendar_reuniao` devolve: o código e, quando agendou, o id. */
export interface ResultadoDoRpc {
  readonly resultado: string
  readonly reuniao_id: string | null
}

/**
 * O que `efeitos` escreve. O esqueleto a entrega só fora do ensaio. As
 * leituras do evento e do convite moram aqui, e não em `PortaDeAgendamento`,
 * porque só existem depois do insert: a reunião relida, o calendário aberto
 * para escrever e o e-mail para enviar.
 */
export interface EscritaDoAgendamento extends PortaDoEventoDaReuniao, PortaDoConviteDaReuniao {
  agendarReuniao(pedido: PedidoDeReuniao): Promise<ResultadoDoRpc>
  /** Apaga as ofertas da chamada: a reunião marcada as consome. */
  consumirOfertas(contaId: string, chamadaId: string): Promise<void>
  /** Preenche `leads.email` só quando ele está vazio. */
  preencherEmailDoLead(contaId: string, leadId: string, email: string): Promise<void>
  /** A reunião recém-marcada como o evento a lê, com o nome do lead e a sala. */
  reuniaoParaEvento(contaId: string, reuniaoId: string): Promise<ReuniaoParaEvento | null>
  /** O calendário conectado do especialista, aberto; a falha dele; ou nulo sem calendário. */
  calendarioParaEvento(contaId: string, especialistaId: string): Promise<PortaDeCalendario | FalhaDoCalendario | null>
  /** A reunião recém-marcada como o convite a lê, com lead, especialista e conta. */
  reuniaoParaConvite(contaId: string, reuniaoId: string): Promise<ReuniaoParaConvite | null>
  /** O e-mail transacional da conta, ou a falha quando não há chave. */
  emailParaConvite(contaId: string): Promise<PortaDeEmail | FalhaDoEmail>
  /** Para onde vai a exceção engolida nas etapas do evento e do convite. */
  registrarNoLog?(evento: Readonly<Record<string, unknown>>): void
}

/** `meetings_modalidade_conhecida`. */
export const MODALIDADES = MODALIDADES_DA_REUNIAO
export type Modalidade = (typeof MODALIDADES)[number]

/** O que `ler` decide para `efeitos`. */
export interface PlanoDoAgendamento {
  readonly pedido: PedidoDeReuniao
  readonly email: string | null
}

/**
 * Os códigos de `agendar_reuniao` que recusam, cada um com a fala dele. Código
 * que não está aqui (nem é `agendada`) é defeito, e vira a frase de contorno.
 */
export const FALAS_DOS_CODIGOS: ReadonlyMap<string, string> = new Map([
  ['horario_ocupado', FALAS_DA_AGENDA.horarioTomado],
  ['fora_da_disponibilidade', FALAS_DA_AGENDA.horarioTomado],
  ['teto_diario', FALAS_DA_AGENDA.diaLotado],
  ['antecedencia_minima', FALAS_DA_AGENDA.emCimaDaHora],
  ['antecedencia_maxima', FALAS_DA_AGENDA.longeDemais],
  ['lead_com_reuniao_ativa', FALAS_DA_AGENDA.jaTemReuniao],
  ['especialista_inativo', FALAS_DA_AGENDA.especialistaSaiu],
])

/** Por que a ferramenta recusou antes de chegar ao RPC, em código. */
export type MotivoDaRecusa =
  | 'posicao_nao_oferecida'
  | 'oferta_expirada'
  | 'modalidade_desconhecida'
  | 'chamada_sem_lead'
  | 'horario_ocupado_no_calendario'

const POSICAO = /^[1-4]$/

/** 1 a 4, como número inteiro ou texto de um dígito. Fora disso, nulo. */
export function lerPosicao(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor >= 1 && valor <= 4 ? valor : null
  if (typeof valor === 'string' && POSICAO.test(valor.trim())) return Number(valor.trim())
  return null
}

/** A modalidade como o banco a aceita. Maiúscula e acento de "vídeo" passam. */
export function lerModalidade(valor: unknown): Modalidade | null {
  if (typeof valor !== 'string') return null
  const limpa = valor.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return MODALIDADES.find((modalidade) => modalidade === limpa) ?? null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function lerEmail(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim().toLowerCase()
  return EMAIL.test(limpo) ? limpo : null
}

function lerNotas(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpas = valor.trim()
  return limpas === '' ? null : limpas
}

function recusa(motivo: MotivoDaRecusa | string, speech: string): ResultadoDoExecutor<PlanoDoAgendamento> {
  return { ok: false, data: { reason: motivo }, speech, erro: motivo }
}

/** Monta o tratador de `tool-book-meeting` sobre a leitura dada. */
export function criarToolBookMeeting(leitura: PortaDeAgendamento): TratadorDeFerramenta<EscritaDoAgendamento> {
  return criarFerramenta<EscritaDoAgendamento, PlanoDoAgendamento>({
    nome: 'tool-book-meeting',
    propositos: ['discovery', 'followup'],
    obrigatorios: [
      { chave: 'slot_position', nome: 'posição do horário' },
      { chave: 'modality', nome: 'modalidade' },
    ],
    executar: executorDoAgendamento(leitura),
  })
}

/**
 * O executor da ferramenta, sem o tratador HTTP. É o mesmo que o esqueleto
 * roda na ligação, e o canal de WhatsApp o roda por `execucao-direta.ts`.
 */
export function executorDoAgendamento(
  leitura: PortaDeAgendamento,
): ExecutorDaFerramenta<EscritaDoAgendamento, PlanoDoAgendamento> {
  return {
    async ler(contexto): Promise<ResultadoDoExecutor<PlanoDoAgendamento>> {
      const agoraMs = contexto.agora()
      const agora = new Date(agoraMs).toISOString()

      const modalidade = lerModalidade(contexto.entrada.modality)
      if (modalidade === null) return recusa('modalidade_desconhecida', FALAS_DA_AGENDA.qualModalidade)

      const leadId = contexto.chamada.lead_id
      if (leadId === null) return recusa('chamada_sem_lead', FALAS_DA_AGENDA.falha)

      // Posição fora de 1 a 4 não foi oferecida, pela mesma razão que a 3
      // de uma oferta de duas.
      const posicao = lerPosicao(contexto.entrada.slot_position)
      const oferta =
        posicao === null ? null : await leitura.ofertaDaChamada(contexto.contaId, contexto.chamada.id, posicao)
      if (oferta === null) return recusa('posicao_nao_oferecida', FALAS_DA_AGENDA.ofertaSemValidade)
      if (Date.parse(oferta.expires_at) <= agoraMs) {
        return recusa('oferta_expirada', FALAS_DA_AGENDA.ofertaSemValidade)
      }

      const calendario = await leitura.calendarioDoEspecialista(contexto.contaId, oferta.specialist_id)
      if (calendario !== null) {
        const conferencia = await calendario.conferirHorario(oferta.starts_at, oferta.ends_at)
        if (conferencia.ok && !conferencia.valor.livre) {
          return recusa('horario_ocupado_no_calendario', FALAS_DA_AGENDA.horarioTomado)
        }
      }

      const horario: HorarioFalado = {
        inicio: oferta.starts_at,
        fusoDoLead: await leitura.fusoDoLead(contexto.contaId, leadId),
        fusoDoEspecialista: oferta.fusoDoEspecialista,
      }
      return {
        data: { meeting_id: null, starts_at: oferta.starts_at },
        speech: falarConfirmacao(horario, agora),
        plano: {
          pedido: {
            p_account_id: contexto.contaId,
            p_lead_id: leadId,
            p_specialist_id: oferta.specialist_id,
            p_starts_at: oferta.starts_at,
            p_ends_at: oferta.ends_at,
            p_modality: modalidade,
            p_notes: lerNotas(contexto.entrada.notes),
            p_booked_call_id: contexto.chamada.id,
          },
          email: lerEmail(contexto.entrada.email),
        },
      }
    },

    async efeitos(
      contexto: ContextoDoExecutor<EscritaDoAgendamento>,
      leitura,
    ): Promise<ResultadoDoEfeito | void> {
      const plano = leitura.plano
      if (leitura.ok === false || plano === undefined) return

      const { resultado, reuniao_id } = await contexto.escrita.agendarReuniao(plano.pedido)
      if (resultado !== 'agendada') {
        const fala = FALAS_DOS_CODIGOS.get(resultado)
        // Código fora do mapa levanta: vira a frase de contorno com o código no registro.
        if (fala === undefined) throw new Error(`código desconhecido de agendar_reuniao: ${resultado}`)
        return { ok: false, data: { reason: resultado }, speech: fala, erro: resultado }
      }
      if (reuniao_id === null) throw new Error('agendar_reuniao agendou sem devolver o id')

      await contexto.escrita.consumirOfertas(contexto.contaId, contexto.chamada.id)
      if (plano.email !== null) {
        await contexto.escrita.preencherEmailDoLead(contexto.contaId, plano.pedido.p_lead_id, plano.email)
      }
      await Promise.all([criarEventoSemDesfazer(contexto, reuniao_id), enviarConvitesSemDesfazer(contexto, reuniao_id)])
      return {
        data: { meeting_id: reuniao_id, starts_at: plano.pedido.p_starts_at },
        speech: leitura.speech,
      }
    },
  }
}

/**
 * O evento da reunião recém-marcada. Nada daqui chega à resposta: falha do
 * calendário vira tentativa agendada na linha, e exceção (banco fora, porta
 * torta) vai para o log, com a reunião intacta. Reunião que ficou sem registro
 * de falha tem `event_retry_at` nulo e zero tentativas, e a rotina a pega na
 * primeira passagem do mesmo jeito.
 */
async function criarEventoSemDesfazer(
  contexto: ContextoDoExecutor<EscritaDoAgendamento>,
  reuniaoId: string,
): Promise<void> {
  const escrita = contexto.escrita
  try {
    const reuniao = await escrita.reuniaoParaEvento(contexto.contaId, reuniaoId)
    if (reuniao === null) return
    const calendario = await escrita.calendarioParaEvento(contexto.contaId, reuniao.specialist_id)
    await criarEventoDaReuniao({ reuniao, calendario, porta: escrita, agora: contexto.agora })
  } catch (erro) {
    escrita.registrarNoLog?.({
      funcao: 'tool-book-meeting',
      passo: 'evento_da_reuniao',
      reuniao: reuniaoId,
      erro: erro instanceof Error ? erro.message : String(erro),
    })
  }
}

/**
 * Os dois convites da reunião recém-marcada, pela mesma regra do evento: nada
 * daqui chega à resposta. Reunião que ficou sem registro de falha tem os dois
 * lados com zero tentativas e sem próxima, e a rotina a pega na primeira
 * passagem depois da folga de dois minutos.
 */
async function enviarConvitesSemDesfazer(
  contexto: ContextoDoExecutor<EscritaDoAgendamento>,
  reuniaoId: string,
): Promise<void> {
  const escrita = contexto.escrita
  try {
    const reuniao = await escrita.reuniaoParaConvite(contexto.contaId, reuniaoId)
    if (reuniao === null) return
    const email = await escrita.emailParaConvite(contexto.contaId)
    await enviarConvitesDaReuniao({ reuniao, email, porta: escrita, agora: contexto.agora })
  } catch (erro) {
    escrita.registrarNoLog?.({
      funcao: 'tool-book-meeting',
      passo: 'convite_da_reuniao',
      reuniao: reuniaoId,
      erro: erro instanceof Error ? erro.message : String(erro),
    })
  }
}
