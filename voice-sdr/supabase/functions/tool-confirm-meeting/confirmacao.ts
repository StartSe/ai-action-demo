// tool-confirm-meeting: a presença confirmada na ligação de lembrete (RF-602,
// segundo critério de aceite da F6). Referência: docs/PRD-implementacao.md
// seção 5, docs/revisao-tecnica.md T-01, T-16 e T-23.
//
// A ferramenta é o executor do esqueleto (`_shared/tools/esqueleto.ts`), que
// confere segredo, conversa, propósito e grava `call_tool_invocations`. O que
// ela decide:
//
// 1. **Entrada nenhuma.** A reunião é a da chamada (`reuniao_em_jogo`), e o
//    modelo nunca diz qual é: identificador não transita pela conversa (T-09).
// 2. **Só no lembrete.** A publicação é a garantia (a ferramenta não existe nos
//    outros agentes, T-01); o esqueleto recusa com 409 o propósito errado.
// 3. **A leitura decide a resposta**, e é o que o ensaio devolve (T-16): a
//    reunião marcada vira a frase de presença confirmada. A escrita é
//    `confirmar_reuniao`, com `update ... where status = 'scheduled'`: a
//    segunda confirmação na mesma chamada devolve a mesma frase e não grava
//    nada de novo.
// 4. **O que não se confirma não é erro técnico.** Chamada sem reunião é a
//    frase de contorno; reunião que já não está de pé (cancelada, remarcada)
//    é a frase que oferece horário novo. As duas com `ok: false`, status 200,
//    que é a regra do esqueleto para o que acontece na conversa.
//
// Módulo portável: sem Deno, sem rede. O `index.ts` monta as portas.

import type { ReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { FALAS_DO_LEMBRETE, falarPresencaConfirmada } from '../_shared/speech/lembrete.ts'
import {
  criarFerramenta,
  type ExecutorDaFerramenta,
  type ResultadoDoEfeito,
  type ResultadoDoExecutor,
  type TratadorDeFerramenta,
} from '../_shared/tools/esqueleto.ts'

/** O que `ler` consulta. */
export interface PortaDaConfirmacao {
  /** `reuniao_em_jogo` da chamada, lida. Nula quando a chamada não tem reunião. */
  reuniaoDaChamada(contaId: string, chamadaId: string): Promise<ReuniaoEmJogo | null>
}

/** Os códigos de `confirmar_reuniao`. */
export type ResultadoDaConfirmacao = 'confirmada' | 'ja_confirmada' | 'status_nao_elegivel' | 'sem_reuniao'

/** O que `efeitos` escreve. */
export interface EscritaDaConfirmacao {
  confirmarReuniao(contaId: string, chamadaId: string, agora: string): Promise<ResultadoDaConfirmacao>
}

/** O que `ler` decide para `efeitos`. */
interface PlanoDaConfirmacao {
  readonly confirmar: true
}

function recusa(motivo: string, speech: string, data: Readonly<Record<string, unknown>> = {}): ResultadoDoExecutor<PlanoDaConfirmacao> {
  return { ok: false, data: { reason: motivo, ...data }, speech, erro: motivo }
}

export function executorDaConfirmacao(
  leitura: PortaDaConfirmacao,
): ExecutorDaFerramenta<EscritaDaConfirmacao, PlanoDaConfirmacao> {
  return {
    async ler(contexto) {
      const agora = new Date(contexto.agora()).toISOString()
      const reuniao = await leitura.reuniaoDaChamada(contexto.contaId, contexto.chamada.id)
      if (reuniao === null) return recusa('sem_reuniao', FALAS_DO_LEMBRETE.semReuniao)

      const data = { meeting_id: reuniao.id, status: 'confirmed', starts_at: reuniao.inicio }
      if (reuniao.status === 'confirmed') {
        // Já confirmada: a mesma frase, sem efeito.
        return { data, speech: falarPresencaConfirmada(reuniao, agora) }
      }
      if (reuniao.status !== 'scheduled') {
        return recusa('status_nao_elegivel', FALAS_DO_LEMBRETE.naoEstaMaisMarcada, {
          meeting_id: reuniao.id,
          status: reuniao.status,
        })
      }
      return { data, speech: falarPresencaConfirmada(reuniao, agora), plano: { confirmar: true } }
    },

    async efeitos(contexto, leitura): Promise<ResultadoDoEfeito | void> {
      if (leitura.ok === false || leitura.plano === undefined) return
      const resultado = await contexto.escrita.confirmarReuniao(
        contexto.contaId,
        contexto.chamada.id,
        new Date(contexto.agora()).toISOString(),
      )
      if (resultado === 'confirmada' || resultado === 'ja_confirmada') return
      if (resultado === 'status_nao_elegivel') {
        // A reunião saiu do ar entre a leitura e a escrita.
        return {
          ok: false,
          data: { reason: resultado, meeting_id: leitura.data?.meeting_id ?? null },
          speech: FALAS_DO_LEMBRETE.naoEstaMaisMarcada,
          erro: resultado,
        }
      }
      throw new Error(`confirmar_reuniao devolveu ${resultado}`)
    },
  }
}

/** Monta o tratador de `tool-confirm-meeting` sobre a leitura dada. */
export function criarToolConfirmMeeting(leitura: PortaDaConfirmacao): TratadorDeFerramenta<EscritaDaConfirmacao> {
  return criarFerramenta<EscritaDaConfirmacao, PlanoDaConfirmacao>({
    nome: 'tool-confirm-meeting',
    propositos: ['reminder'],
    executar: executorDaConfirmacao(leitura),
  })
}
