// A qualificação é obrigatória antes de encerrar em descoberta (US-138, F4).
//
// **A obrigatoriedade é mecanismo em três camadas**, e nenhuma delas é
// instrução solta:
//
// 1. a ferramenta existe no agente de descoberta (`tool-qualify`, US-137): sem
//    ela na publicação, nenhuma instrução se cumpre;
// 2. a camada 1 do playbook, constante versionada no repositório, manda chamar
//    a ferramenta antes de se despedir (`REGRA_DA_QUALIFICACAO`, em
//    `../playbook/camada-um.ts`), e só quando a ferramenta está no conjunto do
//    propósito — instruir a chamar ferramenta ausente ensinaria o modelo a
//    prometer o que ninguém executa;
// 3. o critério de avaliação obrigatório `qualificacao_registrada` reprova a
//    chamada de descoberta que terminou sem ela (`avaliarQualificacao`).
//
// **Faltar a qualificação não é erro.** A ligação cai, a pessoa desliga no meio
// da frase, o modelo esquece: nada disso é defeito a levantar, é o gatilho da
// classificação de retaguarda (US-139). `faltouQualificar` devolve a decisão e
// **quem age é a finalização** (`call-finalize`), que dispara a retaguarda. Este
// módulo não grava, não chama modelo e não conhece banco.
//
// **Decisão e critério diferem num caso, de propósito.** Quando a chamada
// acabou por uma regra travada que encerra direto (não perturbe e pessoa
// errada, as duas passam por `tool-dnc`), a Sarah fez o certo ao não
// qualificar: o critério fica sem decisão, em vez de reprovar e mandar a
// chamada para a fila por obedecer à camada 1. A retaguarda continua valendo
// nesse caso, porque o lead ainda precisa de etapa — `faltouQualificar` diz
// "não há qualificação registrada", e não "a Sarah errou".
//
// **Invocação que voltou com erro não conta.** `call_tool_invocations.error`
// preenchido é a ferramenta que não gravou nada; tratá-la como qualificação
// deixaria o lead sem etapa e sem retaguarda.
//
// Módulo portável: sem `Deno`, sem rede, sem banco.

import { DESCRITOR_DA_QUALIFICACAO } from '../ferramentas/tool-qualify.ts'
import type { Proposito } from '../playbook/camada-um.ts'
import type { CriterioObjetivo, ItemDaAvaliacao } from './avaliacao.ts'

export const FERRAMENTA_DE_QUALIFICACAO = DESCRITOR_DA_QUALIFICACAO.nome

/**
 * Os propósitos em que encerrar sem qualificar é falta. Retomada e resgate têm
 * a ferramenta, mas podem terminar sem mudar nada no funil (a pessoa pede para
 * falar outro dia); descoberta é o primeiro contato, e sem qualificação o lead
 * fica em `new` para sempre.
 */
export const PROPOSITOS_QUE_EXIGEM_QUALIFICACAO: readonly Proposito[] = ['discovery']

/** As ferramentas cuja invocação indica que a chamada acabou por regra travada. */
const ENCERRAMENTO_POR_REGRA_TRAVADA = ['tool-dnc'] as const

export const CHAVE_DA_QUALIFICACAO_REGISTRADA = 'qualificacao_registrada'

/** O critério da avaliação automática. Obrigatório: reprovado, a nota vai a zero. */
export const CRITERIO_QUALIFICACAO_REGISTRADA: CriterioObjetivo = Object.freeze({
  key: CHAVE_DA_QUALIFICACAO_REGISTRADA,
  rotulo: 'Registrou a qualificação antes de encerrar',
  obrigatorio: true,
  como: 'registro',
})

/** O recorte de `calls` que a decisão lê. */
export interface ChamadaParaQualificacao {
  readonly purpose: string
  readonly direction: string
  /** `calls.answered_at`. Nulo é chamada que ninguém atendeu. */
  readonly answered_at: string | null
}

/** O recorte de `call_tool_invocations` que a decisão lê. */
export interface InvocacaoRegistrada {
  readonly tool: string
  readonly error: string | null
}

/**
 * O propósito exige qualificação **e** a ferramenta está no conjunto dele. É o
 * que liga a regra da camada 1 e o critério na publicação.
 */
export function exigeQualificacao(proposito: Proposito, ferramentasDoProposito: readonly string[]): boolean {
  return (
    PROPOSITOS_QUE_EXIGEM_QUALIFICACAO.includes(proposito) &&
    ferramentasDoProposito.includes(FERRAMENTA_DE_QUALIFICACAO)
  )
}

function qualificou(invocacoes: readonly InvocacaoRegistrada[]): boolean {
  return invocacoes.some((i) => i.tool === FERRAMENTA_DE_QUALIFICACAO && i.error === null)
}

function seAplica(chamada: ChamadaParaQualificacao): boolean {
  return (
    (PROPOSITOS_QUE_EXIGEM_QUALIFICACAO as readonly string[]).includes(chamada.purpose) &&
    chamada.direction !== 'rehearsal' &&
    chamada.answered_at !== null
  )
}

/**
 * Verdadeiro quando a chamada devia ter qualificação e não tem: propósito que a
 * exige, fora de ensaio, atendida, e sem invocação bem-sucedida de
 * `tool-qualify`. É o gatilho da retaguarda, não um erro.
 */
export function faltouQualificar(
  chamada: ChamadaParaQualificacao,
  invocacoes: readonly InvocacaoRegistrada[],
): boolean {
  return seAplica(chamada) && !qualificou(invocacoes)
}

/**
 * O item de `qualificacao_registrada` para a avaliação automática, ou `null`
 * quando o critério não vale para a chamada (outro propósito, ensaio, não
 * atendida). Encerramento por regra travada sem qualificação fica sem decisão.
 */
export function avaliarQualificacao(
  chamada: ChamadaParaQualificacao,
  invocacoes: readonly InvocacaoRegistrada[],
): ItemDaAvaliacao | null {
  if (!seAplica(chamada)) return null
  if (qualificou(invocacoes)) {
    return { criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA, aprovado: true, evidencia: FERRAMENTA_DE_QUALIFICACAO }
  }
  const porRegra = invocacoes.some((i) =>
    (ENCERRAMENTO_POR_REGRA_TRAVADA as readonly string[]).includes(i.tool),
  )
  if (porRegra) {
    return { criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA, aprovado: null, evidencia: null, motivo: 'nao_se_aplica' }
  }
  return { criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA, aprovado: false, evidencia: null }
}
