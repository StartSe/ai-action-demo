// As ferramentas da assistente no WhatsApp, sem HTTP entre funções.
//
// Três são os executores das ferramentas da ligação, rodados por
// `_shared/tools/execucao-direta.ts` com as portas do canal:
//
// - `tool-qualify`: o mesmo cálculo de pontuação e etapa, e as mesmas escritas
//   no lead e no funil. A classificação da chamada não existe aqui (não há
//   chamada), e a escrita dela é vazia de propósito.
// - `tool-availability`: o mesmo roteamento e o mesmo gerador de horários; a
//   memória da oferta é `whatsapp_conversations.slot_offers`, e não
//   `call_slot_offers`, que exige uma chamada.
// - `tool-book-meeting`: a mesma marcação por `agendar_reuniao`, resolvendo
//   "a opção dois" contra as ofertas da conversa; `booked_call_id` vai nulo.
//
// Duas são do canal, porque o efeito delas na ligação é da voz:
//
// - `tool-dnc`: bloqueio pelo mesmo RPC (`bloquear_numero_pela_ferramenta`) e
//   conversa encerrada. Na ligação quem encerra é `end_call`.
// - `tool-transfer`: não há número para onde transferir uma mensagem. Pedir
//   humano é a conversa ir para `humano` (a assistente cala) e o item
//   `pedido_humano` na fila.
//
// Módulo portável: as portas são do `index.ts`.

import { executarFerramentaDireto } from '../_shared/tools/execucao-direta.ts'
import type { ChamadaDaFerramenta } from '../_shared/tools/esqueleto.ts'
import type { ExecutorDoCanal } from '../_shared/whatsapp/conversa.ts'
import { VALIDADE_DA_OFERTA_MS, type ConversaGravada, type OfertaGravada } from '../_shared/whatsapp/resposta.ts'
import { origemDoMotivo, notasDoPedido, type OrigemDoBloqueio } from '../tool-dnc/bloqueio.ts'
import {
  executorDoAgendamento,
  type EscritaDoAgendamento,
  type PortaDeAgendamento,
} from '../tool-book-meeting/agendamento.ts'
import {
  executorDaDisponibilidade,
  type EscritaDaDisponibilidade,
  type OfertaParaGravar,
  type PortaDeDisponibilidade,
} from '../tool-availability/disponibilidade.ts'
import {
  executorDaQualificacao,
  OBRIGATORIOS_DA_QUALIFICACAO,
  type EscritaDaQualificacao,
  type LeituraDaQualificacao,
} from '../tool-qualify/qualificacao.ts'

/** A direção que o executor lê: não é ensaio, então os efeitos rodam. */
export const DIRECAO_DO_WHATSAPP = 'whatsapp'

/** O que o canal faz pelas duas ferramentas que são dele. */
export interface AcoesDoCanal {
  bloquear(
    contaId: string,
    telefone: string,
    origem: OrigemDoBloqueio,
    notas: string | null,
  ): Promise<{ readonly criado: boolean }>
  encerrar(contaId: string, conversaId: string, motivo: 'descadastro' | 'pessoa_errada'): Promise<void>
  /** Conversa para `humano` e item `pedido_humano` na fila. */
  pedirHumano(conversa: ConversaGravada, motivo: string | null): Promise<void>
}

export interface PortasDasFerramentas {
  readonly qualificacao: { readonly leitura: LeituraDaQualificacao; readonly escrita: Omit<EscritaDaQualificacao, 'gravarClassificacao'> }
  readonly disponibilidade: { readonly leitura: PortaDeDisponibilidade; readonly escrita: EscritaDaDisponibilidade }
  readonly agendamento: { readonly leitura: PortaDeAgendamento; readonly escrita: EscritaDoAgendamento }
  readonly canal: AcoesDoCanal
  readonly agora?: () => number
}

/** As falas das duas ferramentas do canal. O modelo escreve a mensagem; isto é o que ele lê. */
const FALAS = {
  bloqueado: 'Número tirado da lista: nenhuma mensagem nova vai para esta pessoa. Confirme isso a ela e se despeça.',
  humano: 'Pedido registrado: alguém do time vai responder por aqui. Diga isso à pessoa sem prometer prazo.',
} as const

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

export function ferramentasDaConversa(
  conversa: ConversaGravada,
  portas: PortasDasFerramentas,
): ReadonlyMap<string, ExecutorDoCanal> {
  const contaId = conversa.account_id
  const chamada: ChamadaDaFerramenta = {
    id: conversa.id,
    account_id: contaId,
    purpose: conversa.purpose,
    direction: DIRECAO_DO_WHATSAPP,
    lead_id: conversa.lead_id,
  }
  const base = { contaId, chamada, agora: portas.agora }

  return new Map<string, ExecutorDoCanal>([
    [
      'tool-qualify',
      (entrada) =>
        executarFerramentaDireto({
          ...base,
          entrada,
          executor: executorDaQualificacao(portas.qualificacao.leitura),
          escrita: { ...portas.qualificacao.escrita, gravarClassificacao: async () => {} },
          obrigatorios: OBRIGATORIOS_DA_QUALIFICACAO,
        }),
    ],
    [
      'tool-availability',
      (entrada) =>
        executarFerramentaDireto({
          ...base,
          entrada,
          executor: executorDaDisponibilidade(portas.disponibilidade.leitura),
          escrita: portas.disponibilidade.escrita,
        }),
    ],
    [
      'tool-book-meeting',
      (entrada) =>
        executarFerramentaDireto({
          ...base,
          entrada,
          executor: executorDoAgendamento(portas.agendamento.leitura),
          // A reunião nasce de uma conversa, e não de uma chamada: o id que o
          // executor põe em `booked_call_id` é o da conversa, e vai nulo.
          escrita: {
            ...portas.agendamento.escrita,
            agendarReuniao: (pedido) => portas.agendamento.escrita.agendarReuniao({ ...pedido, p_booked_call_id: null }),
          },
          obrigatorios: [
            { chave: 'slot_position', nome: 'posição do horário' },
            { chave: 'modality', nome: 'modalidade' },
          ],
        }),
    ],
    [
      'tool-dnc',
      async (entrada) => {
        const origem = origemDoMotivo(entrada.reason)
        await portas.canal.bloquear(contaId, conversa.phone_e164, origem, notasDoPedido(entrada))
        await portas.canal.encerrar(contaId, conversa.id, origem === 'wrong_number' ? 'pessoa_errada' : 'descadastro')
        return { ok: true, data: { blocked: true }, speech: FALAS.bloqueado, erro: null }
      },
    ],
    [
      'tool-transfer',
      async (entrada) => {
        await portas.canal.pedirHumano(conversa, texto(entrada.reason))
        return { ok: true, data: { queued: true }, speech: FALAS.humano, erro: null }
      },
    ],
  ])
}

// A memória da oferta na conversa ------------------------------------------------

/** As ofertas desta consulta como `slot_offers` as guarda, com a validade do canal. */
export function ofertasParaAConversa(ofertas: readonly OfertaParaGravar[], agoraMs: number): OfertaGravada[] {
  const expira = new Date(agoraMs + VALIDADE_DA_OFERTA_MS).toISOString()
  return ofertas.map((oferta) => ({ ...oferta, expires_at: expira }))
}

/** A oferta daquela posição, ou nula quando ela não foi feita nesta conversa. */
export function ofertaNaPosicao(ofertas: readonly OfertaGravada[], posicao: number): OfertaGravada | null {
  return ofertas.find((oferta) => oferta.position === posicao) ?? null
}
