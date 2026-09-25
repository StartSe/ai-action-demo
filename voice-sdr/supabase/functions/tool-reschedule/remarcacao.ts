// tool-reschedule: remarcar ou cancelar a reunião na mesma ligação (RF-603,
// segundo critério de aceite da F6). Referência: docs/PRD-implementacao.md
// seção 5, docs/revisao-tecnica.md T-01, T-08, T-09, T-16 e T-23.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`). Entrada
// `action` (`reschedule` ou `cancel`), `slot_position` (1 a 4, para remarcar) e
// `reason`. O que ela decide:
//
// 1. **A reunião vem da chamada** (`reuniao_em_jogo`), nunca da conversa.
// 2. **Remarcar exige horário de `tool-availability` desta chamada** (T-09): a
//    posição se resolve contra `call_slot_offers` da chamada do cabeçalho, não
//    vencida. Posição sem oferta e oferta vencida pedem nova consulta, com a
//    fala que faz o roteiro chamar `tool-availability` de novo.
// 3. **A escrita é uma transação só** (`remarcar_reuniao`): fecha a antiga e
//    abre a nova por `agendar_reuniao`, e recusa dele desfaz tudo. Cada código
//    vira a fala da marcação (`FALAS_DOS_CODIGOS` de tool-book-meeting): 23P01
//    é "esse horário acabou de ser preenchido, deixa eu ver outro".
// 4. **Idempotente**: a segunda remarcação na mesma ligação devolve a mesma
//    reunião, e a segunda desistência não cancela duas vezes.
// 5. **Nos propósitos de lembrete e de resgate**, e só neles (T-01): o esqueleto
//    recusa os outros com 409.
// 6. **Ensaio (T-16)**: a leitura inteira e nenhum efeito — sem reunião nova,
//    sem cancelamento, sem calendário e sem e-mail. O evento no calendário e os
//    convites da reunião nova saem pelas rotinas da F5 (`cron-calendar-sync`,
//    `cron-meeting-invite`), que pegam a reunião sem evento e com convite por
//    sair na primeira passagem.
//
// Módulo portável: sem Deno, sem rede. O `index.ts` monta as portas.

import type { ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { FALAS_DA_AGENDA } from '../_shared/speech/agenda.ts'
import { FALAS_DO_LEMBRETE, falarRemarcacao } from '../_shared/speech/lembrete.ts'
import { FALAS_DO_RESGATE } from '../_shared/speech/resgate.ts'
import {
  criarFerramenta,
  type ExecutorDaFerramenta,
  type ResultadoDoEfeito,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { FALAS_DOS_CODIGOS, lerPosicao, type OfertaDaChamada } from '../tool-book-meeting/agendamento.ts'

export type AcaoDaRemarcacao = 'reschedule' | 'cancel'

/** O que `ler` consulta. */
export interface PortaDaRemarcacao {
  reuniaoDaChamada(contaId: string, chamadaId: string): Promise<ReuniaoEmJogo | null>
  ofertaDaChamada(contaId: string, chamadaId: string, posicao: number): Promise<OfertaDaChamada | null>
  /** A reunião que esta chamada já criou remarcando a dada, se houver. */
  remarcacaoDaChamada(
    contaId: string,
    chamadaId: string,
    reuniaoId: string,
  ): Promise<{ readonly id: string; readonly inicio: string } | null>
}

/** O que `remarcar_reuniao` e `cancelar_reuniao_na_ligacao` devolvem. */
export interface ResultadoDaEscrita {
  readonly resultado: string
  readonly meeting_id?: string | null
  readonly starts_at?: string | null
}

/** O que `efeitos` escreve. */
export interface EscritaDaRemarcacao {
  remarcarReuniao(contaId: string, chamadaId: string, posicao: number, motivo: string, agora: string): Promise<ResultadoDaEscrita>
  cancelarReuniao(contaId: string, chamadaId: string, motivo: string): Promise<ResultadoDaEscrita>
}

type PlanoDaRemarcacao =
  | { readonly tipo: 'remarcar'; readonly posicao: number; readonly motivo: string }
  | { readonly tipo: 'cancelar'; readonly motivo: string }

/** Os status de onde se remarca: ativa, ou a falta atestada do resgate. */
const REMARCAVEIS = new Set(['scheduled', 'confirmed', 'no_show'])
const CANCELAVEIS = new Set(['scheduled', 'confirmed'])

/** `reschedule` ou `cancel`, com as formas em português que o modelo às vezes manda. */
export function lerAcao(valor: unknown): AcaoDaRemarcacao | null {
  if (typeof valor !== 'string') return null
  const limpa = valor.trim().toLowerCase()
  if (limpa === 'reschedule' || limpa === 'remarcar') return 'reschedule'
  if (limpa === 'cancel' || limpa === 'cancelar') return 'cancel'
  return null
}

function recusa(motivo: string, speech: string, data: Readonly<Record<string, unknown>> = {}): ResultadoDoExecutor<PlanoDaRemarcacao> {
  return { ok: false, data: { reason: motivo, ...data }, speech, erro: motivo }
}

function motivoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function executorDaRemarcacao(
  leitura: PortaDaRemarcacao,
): ExecutorDaFerramenta<EscritaDaRemarcacao, PlanoDaRemarcacao> {
  return {
    async ler(contexto) {
      const agoraMs = contexto.agora()
      const agora = new Date(agoraMs).toISOString()
      const acao = lerAcao(contexto.entrada.action)
      if (acao === null) return recusa('acao_desconhecida', FALAS_DO_LEMBRETE.remarcarOuCancelar)

      const reuniao = await leitura.reuniaoDaChamada(contexto.contaId, contexto.chamada.id)
      if (reuniao === null) return recusa('sem_reuniao', FALAS_DO_LEMBRETE.semReuniao)
      const motivo = motivoDe(contexto.entrada.reason)

      if (acao === 'cancel') {
        const data = { meeting_id: reuniao.id, action: 'cancel', status: 'canceled' }
        if (reuniao.status === 'canceled') return { data, speech: FALAS_DO_LEMBRETE.cancelada }
        // No resgate, a reunião já passou: desistir de um horário novo não
        // cancela nada, e a assistente agradece sem insistir.
        if (reuniao.status === 'no_show') {
          return { data: { meeting_id: reuniao.id, action: 'cancel', status: 'no_show' }, speech: FALAS_DO_RESGATE.semInteresse }
        }
        if (!CANCELAVEIS.has(reuniao.status)) {
          return recusa('status_nao_elegivel', FALAS_DO_LEMBRETE.naoEstaMaisMarcada, { status: reuniao.status })
        }
        return { data, speech: FALAS_DO_LEMBRETE.cancelada, plano: { tipo: 'cancelar', motivo } }
      }

      // Remarcar: a mesma ligação já remarcou? A mesma reunião, sem escrever.
      const feita = await leitura.remarcacaoDaChamada(contexto.contaId, contexto.chamada.id, reuniao.id)
      if (feita !== null) {
        return {
          data: { meeting_id: feita.id, action: 'reschedule', starts_at: feita.inicio },
          speech: falarRemarcacao(
            { inicio: feita.inicio, fusoDoLead: reuniao.fusoDoLead, fusoDoEspecialista: reuniao.fusoDoEspecialista },
            agora,
          ),
        }
      }
      if (!REMARCAVEIS.has(reuniao.status)) {
        return recusa('status_nao_elegivel', FALAS_DO_LEMBRETE.naoEstaMaisMarcada, { status: reuniao.status })
      }

      const posicao = lerPosicao(contexto.entrada.slot_position)
      const oferta =
        posicao === null ? null : await leitura.ofertaDaChamada(contexto.contaId, contexto.chamada.id, posicao)
      if (posicao === null || oferta === null) return recusa('posicao_nao_oferecida', FALAS_DA_AGENDA.ofertaSemValidade)
      if (Date.parse(oferta.expires_at) <= agoraMs) return recusa('oferta_expirada', FALAS_DA_AGENDA.ofertaSemValidade)

      return {
        data: { meeting_id: null, action: 'reschedule', starts_at: oferta.starts_at },
        speech: falarRemarcacao(
          { inicio: oferta.starts_at, fusoDoLead: reuniao.fusoDoLead, fusoDoEspecialista: oferta.fusoDoEspecialista },
          agora,
        ),
        plano: { tipo: 'remarcar', posicao, motivo },
      }
    },

    async efeitos(contexto, leitura): Promise<ResultadoDoEfeito | void> {
      const plano = leitura.plano
      if (leitura.ok === false || plano === undefined) return

      if (plano.tipo === 'cancelar') {
        const { resultado } = await contexto.escrita.cancelarReuniao(contexto.contaId, contexto.chamada.id, plano.motivo)
        if (resultado === 'cancelada' || resultado === 'ja_cancelada') return
        if (resultado === 'status_nao_elegivel') {
          return { ok: false, data: { reason: resultado }, speech: FALAS_DO_LEMBRETE.naoEstaMaisMarcada, erro: resultado }
        }
        throw new Error(`cancelar_reuniao_na_ligacao devolveu ${resultado}`)
      }

      const escrita = await contexto.escrita.remarcarReuniao(
        contexto.contaId,
        contexto.chamada.id,
        plano.posicao,
        plano.motivo,
        new Date(contexto.agora()).toISOString(),
      )
      if (escrita.resultado === 'remarcada' || escrita.resultado === 'ja_remarcada') {
        if (!escrita.meeting_id) throw new Error('remarcar_reuniao remarcou sem devolver o id')
        return {
          data: { meeting_id: escrita.meeting_id, action: 'reschedule', starts_at: leitura.data?.starts_at ?? null },
          speech: leitura.speech,
        }
      }
      if (escrita.resultado === 'posicao_nao_oferecida' || escrita.resultado === 'oferta_expirada') {
        return { ok: false, data: { reason: escrita.resultado }, speech: FALAS_DA_AGENDA.ofertaSemValidade, erro: escrita.resultado }
      }
      if (escrita.resultado === 'status_nao_elegivel') {
        return { ok: false, data: { reason: escrita.resultado }, speech: FALAS_DO_LEMBRETE.naoEstaMaisMarcada, erro: escrita.resultado }
      }
      const fala = FALAS_DOS_CODIGOS.get(escrita.resultado)
      // Código fora do mapa levanta: vira a frase de contorno com o código no registro.
      if (fala === undefined) throw new Error(`código desconhecido de remarcar_reuniao: ${escrita.resultado}`)
      return { ok: false, data: { reason: escrita.resultado }, speech: fala, erro: escrita.resultado }
    },
  }
}

/** Monta o tratador de `tool-reschedule` sobre a leitura dada. */
export function criarToolReschedule(leitura: PortaDaRemarcacao): TratadorDeFerramenta<EscritaDaRemarcacao> {
  return criarFerramenta<EscritaDaRemarcacao, PlanoDaRemarcacao>({
    nome: 'tool-reschedule',
    propositos: ['reminder', 'rescue'],
    obrigatorios: [
      { chave: 'action', nome: 'ação' },
      { chave: 'reason', nome: 'motivo' },
    ],
    executar: executorDaRemarcacao(leitura),
  })
}
