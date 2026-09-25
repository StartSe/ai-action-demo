// tool-availability: os horários que a Sarah oferece (RF-505, seção 9 do PRD).
// Referência: docs/PRD-implementacao.md seção 5, docs/revisao-tecnica.md T-08,
// T-09, T-10, T-16 e T-21.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`) e só
// compõe: o roteamento decide quem pode receber a reunião
// (`_shared/agenda/roteamento.ts`), a geração decide quais horários existem
// (`_shared/agenda/horarios.ts`) e a fala diz as opções no fuso do lead
// (`_shared/speech/agenda.ts`). Nenhuma das três regras é reescrita aqui.
//
// - **Só o banco.** Faixa semanal, bloqueios, `specialist_busy_blocks` e
//   reuniões marcadas chegam por `PortaDeDisponibilidade`, que não tem método
//   de calendário externo (T-10): a leitura ao vivo estoura o prazo de 5 s e
//   deixa silêncio na linha. Quem traz a ocupação externa para o banco é
//   `cron-calendar-sync`.
// - **A oferta mora no servidor** (T-09). `memoria` troca as ofertas da
//   chamada pelas desta resposta, nas posições 1 a 4; a fala e o `data` dizem
//   só a posição e o horário, e `tool-book-meeting` resolve "a segunda opção"
//   contra a chamada do cabeçalho. Chamada de novo, a ferramenta substitui em
//   vez de empilhar — inclusive quando a nova resposta é vazia, senão "a
//   segunda opção" resolveria um horário que ninguém acabou de ouvir.
// - **Agenda cheia não é erro.** Sem horário, ou sem especialista para quem
//   rotear, a resposta é `ok: true`, lista vazia e a fala de agenda cheia; o
//   motivo viaja em `data.reason`, em código, para o registro da invocação.
// - **Ensaio (T-16)** faz toda a leitura e grava as ofertas do mesmo jeito: a
//   troca é `memoria`, que o esqueleto roda nos dois modos, porque a oferta é o
//   que a conversa lembra para `tool-book-meeting`, e não ato no mundo. Sem
//   ela, o ensaio da marcação nunca acharia a posição escolhida.
//
// **Qual especialista vira oferta.** O roteamento devolve os aptos na ordem do
// modo. Em `round_robin` e `fixed` a oferta é de um especialista só, o primeiro
// da ordem que tiver horário: juntar as agendas de todos desfaria o rodízio,
// porque o horário mais cedo decidiria quem recebe a reunião. Em `area` o modo
// não escolhe dentro da área (roteamento.ts), e a oferta junta as agendas dos
// aptos em ordem de tempo, com um horário só por instante — dizer "opção um,
// terça às 14h; opção dois, terça às 14h" é o defeito que a fila de
// especialistas não pode produzir.
//
// **`specialist_id` na entrada** troca o modo da conta pelo fixo naquele
// especialista, com as mesmas exclusões (desligado, sem faixa no horizonte).
// É o caminho de quem já tem especialista, como a remarcação; id que não é da
// conta cai na recusa do fixo, porque a lista de candidatos é só da conta.
//
// Módulo portável: sem `Deno`, sem rede. O `index.ts` monta as portas sobre o
// Supabase com a chave de serviço.

import {
  gerarHorarios,
  MAXIMO_DE_OFERTAS,
  type FaixaDeDisponibilidade,
  type IntervaloOcupado,
  type OfertaDeHorario,
} from '../_shared/agenda/horarios.ts'
import {
  escolherEspecialista,
  type EspecialistaCandidato,
  type ModoDeRoteamento,
  type MotivoDeRecusaDeRoteamento,
} from '../_shared/agenda/roteamento.ts'
import { PROPOSITOS } from '../_shared/playbook/camada-um.ts'
import { FALAS_DA_AGENDA, falarHorario, falarOferta, type HorarioFalado } from '../_shared/speech/agenda.ts'
import {
  criarFerramenta,
  type ExecutorDaFerramenta,
  type ContextoDoExecutor,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** O que da linha de `account_settings` e de `accounts` a ferramenta lê. */
export interface ConfiguracaoDaAgenda {
  /** `account_settings.routing_mode`, como gravado. */
  readonly modo: string
  /** `account_settings.fixed_specialist_id`. */
  readonly especialistaFixo: string | null
  /** `accounts.timezone`: o fuso do lead quando o lead não tem o seu. */
  readonly fusoDaConta: string
}

/** Uma linha de `specialists`, com as faixas de `specialist_availability` dela. */
export interface EspecialistaDaConta {
  readonly id: string
  readonly area: string | null
  readonly ativo: boolean
  readonly fuso: string
  readonly duracaoPadraoMin: number
  readonly tetoDiario: number
  readonly antecedenciaMinimaMin: number
  readonly antecedenciaMaximaDias: number
  readonly ultimaAtribuicaoEm: string | null
  readonly disponibilidade: readonly FaixaDeDisponibilidade[]
}

/** Uma reunião de `meetings`, com o status que decide se ela ocupa a agenda. */
export interface ReuniaoDoPeriodo extends IntervaloOcupado {
  readonly status: string
}

/** O que ocupa a agenda de um especialista no período pedido. */
export interface AgendaDoEspecialista {
  readonly especialistaId: string
  readonly bloqueios: readonly IntervaloOcupado[]
  readonly ocupacaoExterna: readonly IntervaloOcupado[]
  readonly reunioes: readonly ReuniaoDoPeriodo[]
}

/** Intervalo `[de, ate)` em ISO-8601: a porta devolve o que o intersecta. */
export interface Periodo {
  readonly de: string
  readonly ate: string
}

/**
 * O que `ler` consulta. Nunca escreve, e não tem método de calendário
 * externo: a ocupação que vem de fora já está em `specialist_busy_blocks`.
 */
export interface PortaDeDisponibilidade {
  configuracaoDaConta(contaId: string): Promise<ConfiguracaoDaAgenda>
  /** `leads.timezone`. Nulo quando o lead não tem, ou quando não há lead. */
  fusoDoLead(contaId: string, leadId: string): Promise<string | null>
  especialistasDaConta(contaId: string): Promise<readonly EspecialistaDaConta[]>
  agendaNoPeriodo(
    contaId: string,
    especialistaIds: readonly string[],
    periodo: Periodo,
  ): Promise<readonly AgendaDoEspecialista[]>
}

/** Uma linha de `call_slot_offers`, com as chaves da tabela. `expires_at` é do gatilho. */
export interface OfertaParaGravar {
  readonly position: number
  readonly specialist_id: string
  readonly starts_at: string
  readonly ends_at: string
}

/** O que `memoria` escreve, nos dois modos. */
export interface EscritaDaDisponibilidade {
  /** Troca as ofertas da chamada por estas: as antigas deixam de existir. */
  substituirOfertas(contaId: string, chamadaId: string, ofertas: readonly OfertaParaGravar[]): Promise<void>
}

export interface PlanoDaDisponibilidade {
  readonly ofertas: readonly OfertaParaGravar[]
}

/**
 * Por que a resposta saiu vazia, em código. `sem_horario` é o roteamento que
 * achou gente e a geração que não achou hora; os outros três são do roteamento.
 */
export type MotivoDaAgendaVazia = 'sem_horario' | MotivoDeRecusaDeRoteamento

/**
 * O status que ocupa horário e conta no teto: o mesmo predicado da restrição
 * de exclusão `meetings_sem_sobreposicao`. Cancelada, remarcada e já
 * acontecida não tiram horário de ninguém.
 */
export const STATUS_QUE_OCUPAM: ReadonlySet<string> = new Set(['scheduled', 'confirmed'])

/** `specialists_duracao_util`: a mesma faixa que o banco aceita como duração. */
const DURACAO_MINIMA = 15
const DURACAO_MAXIMA = 240

const MODOS: readonly ModoDeRoteamento[] = ['area', 'round_robin', 'fixed']

const DIA_MS = 86_400_000

const INTEIRO_POSITIVO = /^[1-9][0-9]*$/

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo === '' ? null : limpo
}

/** Inteiro positivo vindo do modelo, como número ou como texto de dígitos. */
function inteiroPositivo(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor > 0 ? valor : null
  if (typeof valor === 'string' && INTEIRO_POSITIVO.test(valor.trim())) return Number(valor.trim())
  return null
}

/** O que a entrada pede, já conferido. Valor fora da forma fica com o padrão do especialista. */
export interface PedidoDeHorarios {
  readonly area: string | null
  readonly especialistaId: string | null
  /** Nula: a duração padrão de cada especialista. */
  readonly duracaoMin: number | null
  /** Nulo: a antecedência máxima de cada especialista. */
  readonly diasAFrente: number | null
}

export function lerPedido(entrada: Readonly<Record<string, unknown>>): PedidoDeHorarios {
  const duracao = inteiroPositivo(entrada.duration_min)
  return {
    area: texto(entrada.area),
    especialistaId: texto(entrada.specialist_id),
    duracaoMin: duracao !== null && duracao >= DURACAO_MINIMA && duracao <= DURACAO_MAXIMA ? duracao : null,
    diasAFrente: inteiroPositivo(entrada.days_ahead),
  }
}

/** O especialista como o gerador e o roteamento o leem, com o pedido aplicado. */
function comPedido(especialista: EspecialistaDaConta, pedido: PedidoDeHorarios): EspecialistaDaConta {
  return {
    ...especialista,
    duracaoPadraoMin: pedido.duracaoMin ?? especialista.duracaoPadraoMin,
    // O pedido encurta o horizonte, nunca o estica além do que a pessoa aceita.
    antecedenciaMaximaDias:
      pedido.diasAFrente === null
        ? especialista.antecedenciaMaximaDias
        : Math.min(pedido.diasAFrente, especialista.antecedenciaMaximaDias),
  }
}

function comoCandidato(especialista: EspecialistaDaConta): EspecialistaCandidato {
  return {
    id: especialista.id,
    area: especialista.area,
    ativo: especialista.ativo,
    fuso: especialista.fuso,
    antecedenciaMaximaDias: especialista.antecedenciaMaximaDias,
    disponibilidade: [...especialista.disponibilidade],
    ultimaAtribuicaoEm: especialista.ultimaAtribuicaoEm,
  }
}

function modoDe(gravado: string): ModoDeRoteamento {
  const modo = MODOS.find((conhecido) => conhecido === gravado)
  if (modo === undefined) throw new Error(`routing_mode desconhecido: ${gravado}`)
  return modo
}

/**
 * O período que a porta precisa ler: do dia anterior a agora até um dia depois
 * do maior horizonte. As folgas cobrem a virada de dia em qualquer fuso — o
 * teto diário conta as reuniões do dia inteiro do especialista, inclusive as
 * que já passaram hoje.
 */
function periodoDaLeitura(agora: number, especialistas: readonly EspecialistaDaConta[]): Periodo {
  const horizonte = Math.max(...especialistas.map((e) => e.antecedenciaMaximaDias))
  return {
    de: new Date(agora - DIA_MS).toISOString(),
    ate: new Date(agora + (horizonte + 1) * DIA_MS).toISOString(),
  }
}

interface OfertaDoEspecialista {
  readonly especialistaId: string
  readonly oferta: OfertaDeHorario
}

function ofertasDe(
  especialista: EspecialistaDaConta,
  agenda: AgendaDoEspecialista | undefined,
  fusoDoLead: string,
  agora: string,
): OfertaDoEspecialista[] {
  const saida = gerarHorarios({
    especialista: {
      fuso: especialista.fuso,
      duracaoPadraoMin: especialista.duracaoPadraoMin,
      tetoDiario: especialista.tetoDiario,
      antecedenciaMinimaMin: especialista.antecedenciaMinimaMin,
      antecedenciaMaximaDias: especialista.antecedenciaMaximaDias,
    },
    disponibilidade: [...especialista.disponibilidade],
    bloqueios: [...(agenda?.bloqueios ?? [])],
    ocupacaoExterna: [...(agenda?.ocupacaoExterna ?? [])],
    reunioesMarcadas: (agenda?.reunioes ?? [])
      .filter((reuniao) => STATUS_QUE_OCUPAM.has(reuniao.status))
      .map(({ inicio, fim }) => ({ inicio, fim })),
    fusoDoLead,
    agora,
  })
  return saida.ofertas.map((oferta) => ({ especialistaId: especialista.id, oferta }))
}

/** Junta as agendas da área: em ordem de tempo, um horário por instante. */
function juntarPorInstante(listas: readonly OfertaDoEspecialista[][]): OfertaDoEspecialista[] {
  const vistos = new Set<number>()
  const juntas: OfertaDoEspecialista[] = []
  // A ordem das listas é a do roteamento, e é ela que decide quem fica com o
  // instante repetido: o `sort` é estável.
  const todas = listas.flat().sort((a, b) => Date.parse(a.oferta.inicio) - Date.parse(b.oferta.inicio))
  for (const item of todas) {
    const instante = Date.parse(item.oferta.inicio)
    if (vistos.has(instante)) continue
    vistos.add(instante)
    juntas.push(item)
    if (juntas.length === MAXIMO_DE_OFERTAS) break
  }
  return juntas
}

function vazia(motivo: MotivoDaAgendaVazia): ResultadoDoExecutor<PlanoDaDisponibilidade> {
  return {
    data: { offers: [], reason: motivo },
    speech: FALAS_DA_AGENDA.agendaCheia,
    plano: { ofertas: [] },
  }
}

/** Monta o tratador de `tool-availability` sobre a leitura dada. */
export function criarToolAvailability(
  leitura: PortaDeDisponibilidade,
): TratadorDeFerramenta<EscritaDaDisponibilidade> {
  return criarFerramenta<EscritaDaDisponibilidade, PlanoDaDisponibilidade>({
    nome: 'tool-availability',
    propositos: [...PROPOSITOS],
    executar: executorDaDisponibilidade(leitura),
  })
}

/**
 * O executor da ferramenta, sem o tratador HTTP. É o mesmo que o esqueleto
 * roda na ligação, e o canal de WhatsApp o roda por `execucao-direta.ts`.
 */
export function executorDaDisponibilidade(
  leitura: PortaDeDisponibilidade,
): ExecutorDaFerramenta<EscritaDaDisponibilidade, PlanoDaDisponibilidade> {
  return {
    async ler(contexto): Promise<ResultadoDoExecutor<PlanoDaDisponibilidade>> {
      const agoraMs = contexto.agora()
      const agora = new Date(agoraMs).toISOString()
      const pedido = lerPedido(contexto.entrada)

      const configuracao = await leitura.configuracaoDaConta(contexto.contaId)
      const modoDaConta = modoDe(configuracao.modo)
      const fusoDoLead =
        (contexto.chamada.lead_id === null
          ? null
          : texto(await leitura.fusoDoLead(contexto.contaId, contexto.chamada.lead_id))) ??
        configuracao.fusoDaConta

      const especialistas = (await leitura.especialistasDaConta(contexto.contaId)).map((e) =>
        comPedido(e, pedido),
      )
      const porId = new Map(especialistas.map((e) => [e.id, e]))

      const roteamento = escolherEspecialista({
        modo: pedido.especialistaId === null ? modoDaConta : 'fixed',
        especialistaFixo:
          pedido.especialistaId ?? (modoDaConta === 'fixed' ? configuracao.especialistaFixo : null),
        areaPedida: pedido.area,
        candidatos: especialistas.map(comoCandidato),
        agora,
      })
      if (!roteamento.roteou) return vazia(roteamento.motivo)

      const escolhidos = roteamento.escolhidos.map((candidato) => porId.get(candidato.id)!)
      const agendas = await leitura.agendaNoPeriodo(
        contexto.contaId,
        escolhidos.map((e) => e.id),
        periodoDaLeitura(agoraMs, escolhidos),
      )
      const agendaDe = new Map(agendas.map((agenda) => [agenda.especialistaId, agenda]))
      const gerar = (e: EspecialistaDaConta) => ofertasDe(e, agendaDe.get(e.id), fusoDoLead, agora)

      let escolhidas: OfertaDoEspecialista[]
      if (pedido.especialistaId === null && modoDaConta === 'area') {
        escolhidas = juntarPorInstante(escolhidos.map(gerar))
      } else {
        escolhidas = []
        for (const especialista of escolhidos) {
          escolhidas = gerar(especialista)
          if (escolhidas.length > 0) break
        }
      }
      if (escolhidas.length === 0) return vazia('sem_horario')

      const falados: HorarioFalado[] = escolhidas.map(({ oferta }) => ({
        inicio: oferta.inicio,
        fusoDoLead,
        fusoDoEspecialista: oferta.fusoDoEspecialista,
      }))

      return {
        data: {
          offers: escolhidas.map(({ oferta }, indice) => ({
            position: indice + 1,
            starts_at: oferta.inicio,
            ends_at: oferta.fim,
            label: falarHorario(falados[indice]!, agora),
          })),
        },
        speech: falarOferta(falados, agora),
        plano: {
          ofertas: escolhidas.map(({ especialistaId, oferta }, indice) => ({
            position: indice + 1,
            specialist_id: especialistaId,
            starts_at: oferta.inicio,
            ends_at: oferta.fim,
          })),
        },
      }
    },

    async memoria(contexto: ContextoDoExecutor<EscritaDaDisponibilidade>, leitura) {
      await contexto.escrita.substituirOfertas(
        contexto.contaId,
        contexto.chamada.id,
        leitura.plano?.ofertas ?? [],
      )
    },
  }
}
