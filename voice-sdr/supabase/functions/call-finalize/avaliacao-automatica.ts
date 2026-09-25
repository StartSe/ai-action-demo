// A avaliação automática aplicada ao fim de cada chamada (US-142, RF-313,
// RF-314, RF-909, L-23).
//
// **A LISTA É A MESMA QUE VAI AO PROVEDOR.** Os critérios saem de
// `criteriosDoPropositoGravado` (`_shared/agente/compilador.ts`): os da camada
// 1, que espelham regra travada, mais os da conta (`evaluation_criteria`), pela
// mesma função que `agent-publish` usa para montar a avaliação da publicação.
// Duas listas fariam o provedor avaliar por um critério e a ficha mostrar
// outro.
//
// **QUEM DECIDE O QUÊ.** Critério por trecho se decide aqui, em processo, pela
// fala da Sarah; por registro, pelas invocações da chamada
// (`qualificacao_registrada`, `avaliarQualificacao`); por modelo, pelo juízo que
// `call-classify` gravou em `calls.evaluation.criterios` na mesma passagem
// (`portaDoJuizoGravado`). A finalização não pergunta ao modelo de novo.
//
// **NADA DECIDIDO, NADA ESCRITO.** Sem critério da conta e sem juízo do modelo,
// todo item fica sem decisão, e gravar sete nulos diria o que a ausência já
// diz.
//
// **SEM JUÍZO, SEM NOTA.** Na via da ferramenta a retaguarda não roda na
// finalização, e o juízo do modelo ainda não existe. Os itens são gravados do
// mesmo jeito — é deles que a fila lê o critério reprovado —, mas a nota fica
// nula, e quem a completa é `call-classify` pela varredura de recuperação, que
// só pega a chamada da ferramenta com `evaluation_score` nulo. Nota calculada
// sem os critérios por modelo seria nota de outra régua.
//
// **O AVISO DE GRAVAÇÃO É DECIDIDO PELO TURNO.** `aviso_gravacao` é sempre por
// trecho, com o maior trecho literal do aviso da conta somado aos trechos do
// critério: é o turno que prova o aviso (L-23, RF-420), e é o instante dele que
// preenche `consent_notice_at`. Com a gravação desligada, o critério não se
// aplica — a abertura não promete gravação nenhuma.
//
// **AVALIAÇÃO NÃO É CLASSIFICAÇÃO.** Reprovar critério não move etapa nem muda
// score: a porta daqui não tem método que toque em lead. O critério reprovado
// vira item de fila pelo caminho da US-141 (`sentimento-e-fila.ts`), que lê os
// itens gravados.
//
// **O ENSAIO NÃO É AVALIADO** (T-16): não entra em métrica nem em fila, e a
// porta nem é tocada.
//
// Passo acessório: falha aqui não derruba a finalização.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import {
  criteriosDoPropositoGravado,
  paraAvaliacaoAutomatica,
} from '../_shared/agente/compilador.ts'
import {
  CHAVE_DO_AVISO_DE_GRAVACAO,
  avaliarChamada,
  juizoGravado,
  portaDoJuizoGravado,
  type CriterioObjetivo,
  type ItemDaAvaliacao,
  type LinhaDeCriterio,
  type PortaDeAvaliacao,
  type TurnoDaConversa as TurnoDaAvaliacao,
} from '../_shared/qualificacao/avaliacao.ts'
import {
  avaliarQualificacao,
  type ChamadaParaQualificacao,
  type InvocacaoRegistrada,
} from '../_shared/qualificacao/obrigatoriedade.ts'

import { trechosDoAviso } from './consentimento.ts'
import type { TurnoDaConversa } from './formato-do-provedor.ts'
import type { ResultadoGravado } from './sentimento-e-fila.ts'

export interface PortaDaAvaliacaoAutomatica {
  /** `evaluation_criteria` da conta, em `position`. */
  criteriosDaConta(contaId: string): Promise<readonly LinhaDeCriterio[]>
  /** `registrar_avaliacao_automatica`: mescla `itens` e grava a nota quando ela vem. */
  registrarAvaliacaoAutomatica(
    contaId: string,
    chamadaId: string,
    itens: readonly ItemDaAvaliacao[],
    nota: number | null,
  ): Promise<void>
  lerResultadoDaChamada(chamadaId: string): Promise<ResultadoGravado>
}

export type DesfechoDaAvaliacao =
  | { readonly situacao: 'nao_se_aplica' }
  | { readonly situacao: 'falhou' }
  /** Nenhum critério teve decisão: nada é escrito, como a medição conforme. */
  | { readonly situacao: 'sem_decisao' }
  | {
      readonly situacao: 'avaliada'
      /** Nula quando o juízo do modelo ainda não existe. */
      readonly nota: number | null
      readonly reprovados: readonly string[]
    }

/** A porta que nunca julga: para decidir só o que é por trecho. */
const SEM_MODELO: PortaDeAvaliacao = {
  julgar: () => Promise.resolve(''),
}

/**
 * Os critérios que a chamada aplica, no formato da avaliação automática. O
 * aviso de gravação é por trecho, com o aviso da conta entre os trechos, ou
 * `registro` sem item (não se aplica) quando a gravação está desligada.
 */
export function criteriosAplicados(
  proposito: string,
  daConta: readonly LinhaDeCriterio[],
  gravacao: { readonly ligada: boolean; readonly aviso: string | null },
): CriterioObjetivo[] {
  return criteriosDoPropositoGravado(proposito, daConta).map((criterio) => {
    const objetivo = paraAvaliacaoAutomatica(criterio)
    if (objetivo.key !== CHAVE_DO_AVISO_DE_GRAVACAO) return objetivo
    if (!gravacao.ligada) {
      return { key: objetivo.key, rotulo: objetivo.rotulo, obrigatorio: objetivo.obrigatorio, como: 'registro' }
    }
    return { ...objetivo, como: 'trecho', trechos: trechosDoAviso(gravacao.aviso, objetivo.trechos ?? []) }
  })
}

/** Os itens que não saem da fala nem do modelo: o registro das ferramentas e o aviso desligado. */
export function itensRegistrados(
  criterios: readonly CriterioObjetivo[],
  chamada: ChamadaParaQualificacao,
  invocacoes: readonly InvocacaoRegistrada[],
): ItemDaAvaliacao[] {
  const itens: ItemDaAvaliacao[] = []
  for (const criterio of criterios) {
    if (criterio.como !== 'registro') continue
    if (criterio.key === CHAVE_DO_AVISO_DE_GRAVACAO) {
      itens.push({ criterio: criterio.key, aprovado: null, evidencia: null, motivo: 'nao_se_aplica' })
      continue
    }
    const item = avaliarQualificacao(chamada, invocacoes)
    if (item && item.criterio === criterio.key) itens.push(item)
  }
  return itens
}

/** Os turnos da conversa no formato da avaliação, com o instante de cada um. */
export function turnosParaAvaliacao(
  turnos: readonly TurnoDaConversa[],
  instante: (segundo: number) => string,
): TurnoDaAvaliacao[] {
  return turnos.map((turno) => ({
    papel: turno.quem === 'agent' ? 'sarah' : 'interlocutor',
    texto: turno.texto,
    instante: instante(turno.segundo),
  }))
}

/**
 * O instante do turno em que o aviso de gravação aparece, pelo critério: é o
 * que vai em `consent_notice_at`. Só os critérios por trecho entram, sem
 * modelo, e por isso a resposta sai antes do desfecho ser gravado.
 */
export async function avisoDeGravacaoEm(
  turnos: readonly TurnoDaAvaliacao[],
  criterios: readonly CriterioObjetivo[],
): Promise<string | null> {
  const doAviso = criterios.filter((c) => c.key === CHAVE_DO_AVISO_DE_GRAVACAO && c.como === 'trecho')
  if (doAviso.length === 0) return null
  return (await avaliarChamada(turnos, doAviso, SEM_MODELO)).avisoDeGravacaoEm
}

/**
 * Aplica e grava. Só vale para a conversa que alguém atendeu: sem fala, não há
 * o que avaliar, e reprovar o aviso numa chamada que ninguém ouviu mandaria à
 * fila a caixa postal.
 */
export async function aplicarAvaliacao(
  chamada: { readonly id: string; readonly account_id: string },
  contexto: {
    readonly aplica: boolean
    readonly turnos: readonly TurnoDaAvaliacao[]
    readonly criterios: readonly CriterioObjetivo[]
    readonly registrados: readonly ItemDaAvaliacao[]
  },
  porta: PortaDaAvaliacaoAutomatica,
): Promise<DesfechoDaAvaliacao> {
  if (!contexto.aplica) return { situacao: 'nao_se_aplica' }
  try {
    const resultado = await porta.lerResultadoDaChamada(chamada.id)
    const avaliacao = await avaliarChamada(
      contexto.turnos,
      contexto.criterios,
      portaDoJuizoGravado(resultado.evaluation),
      contexto.registrados,
    )
    if (!avaliacao.itens.some((item) => item.aprovado !== null)) return { situacao: 'sem_decisao' }
    const semJuizo =
      juizoGravado(resultado.evaluation) === null && contexto.criterios.some((c) => c.como === 'modelo')
    const nota = semJuizo ? null : avaliacao.nota
    await porta.registrarAvaliacaoAutomatica(chamada.account_id, chamada.id, avaliacao.itens, nota)
    return { situacao: 'avaliada', nota, reprovados: avaliacao.reprovados() }
  } catch {
    return { situacao: 'falhou' }
  }
}
