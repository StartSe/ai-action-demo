// A abertura de uma conversa: as variáveis que o prompt publicado cita e a
// primeira fala com o lead dentro (RF-408, T-25).
//
// **UMA REGRA, TRÊS PORTAS.** A conversa começa por três caminhos: a ligação de
// saída (`call-place`, que passa o contexto no pedido de discagem), o webhook
// de início (`call-init`, que o provedor chama na ligação recebida) e o ensaio
// no navegador (`rehearsal-session`, cuja sessão o SDK abre com as variáveis
// que recebe). T-25 pedia uma fonte só de contexto para as duas primeiras não
// divergirem; o que as mantém iguais agora é esta função, que as três chamam.
// A fonte continua sendo uma — o banco, lido na hora —, e a regra também.
//
// **O PROMPT CITA; A CONVERSA PREENCHE.** O compilador deixa no prompt as
// variáveis de `VARIAVEIS_DA_CHAMADA`, e toda conversa precisa trazê-las
// todas: a que faltar cai no valor inicial da publicação, que é vazio, e o
// modelo fala sem o dado. Aqui cada uma vai sempre, com o valor do lead quando
// há e o valor inicial quando não há — nunca o nome da variável.
//
// Módulo portável: sem Deno, sem rede, sem banco e sem relógio.

import { FALAS_DE_TODO_PROPOSITO } from '../speech/todos-os-propositos.ts'
import {
  VALOR_INICIAL_DA_VARIAVEL,
  VARIAVEIS_DA_CHAMADA,
  interpolarFala,
  type VariavelDaChamada,
} from './compilador.ts'

/** O lead, no que a abertura precisa dele. */
export interface LeadDaAbertura {
  readonly nome: string | null
  readonly empresa: string | null
  readonly cidade: string | null
}

/** A identidade da Sarah daquela conta (`agents`). */
export interface IdentidadeDaAbertura {
  readonly nome: string
  readonly empresa: string
  /** `agents.first_message`. Nula é o padrão da camada 1. */
  readonly primeiraFala: string | null
}

/** A política de gravação da conta (`account_settings`, RF-806). */
export interface PoliticaDaAbertura {
  readonly gravacaoLigada: boolean
  /** `recording_notice_text`. Nulo é a frase da camada 1. */
  readonly avisoDeGravacao: string | null
}

export interface PedidoDeAbertura {
  readonly identidade: IdentidadeDaAbertura
  readonly politica: PoliticaDaAbertura
  readonly lead: LeadDaAbertura | null
  /** O que a Sarah sabe do lead antes de falar. Hoje só o ensaio o preenche. */
  readonly contextoDoLead?: string
}

export interface Abertura {
  /** A primeira fala, já com o lead desta conversa dentro. */
  readonly primeiraFala: string
  /** O aviso de gravação, ou nulo quando a conta desligou a gravação. */
  readonly avisoDeGravacao: string | null
  /**
   * As variáveis da conversa: todas as de `VARIAVEIS_DA_CHAMADA`, mais o nome
   * do agente e a empresa, que a primeira fala da conta pode citar.
   */
  readonly variaveis: Readonly<Record<string, string>>
}

function limpo(valor: string | null | undefined): string {
  return valor?.trim() ?? ''
}

/**
 * Todas as variáveis que o prompt publicado cita, cada uma com o valor desta
 * conversa ou com o valor inicial seguro da publicação.
 *
 * `nome_do_especialista` é da reunião, que chega na F5: até lá vai o valor
 * inicial, e a conta que citá-lo no roteiro lê um campo em branco.
 */
export function variaveisDaChamada(
  lead: LeadDaAbertura | null,
  contextoDoLead = '',
): Readonly<Record<VariavelDaChamada, string>> {
  const doLead: Record<VariavelDaChamada, string> = {
    nome_do_lead: limpo(lead?.nome),
    empresa_do_lead: limpo(lead?.empresa),
    cidade_do_lead: limpo(lead?.cidade),
    nome_do_especialista: '',
    contexto_do_lead: limpo(contextoDoLead),
  }
  const variaveis = {} as Record<VariavelDaChamada, string>
  for (const chave of VARIAVEIS_DA_CHAMADA) {
    variaveis[chave] = doLead[chave] !== '' ? doLead[chave] : VALOR_INICIAL_DA_VARIAVEL[chave]
  }
  return variaveis
}

/**
 * A abertura padrão, nas quatro combinações de gravação e nome conhecido.
 *
 * São quatro frases inteiras em `_shared/speech/` e não uma frase remendada
 * porque marcador que some deixa buraco, e buraco no meio de uma frase não se
 * remenda com expressão regular — é a mesma doutrina de
 * `speech/atendimento-recebido.ts`.
 */
export function falaDeAbertura(gravacaoLigada: boolean, temNome: boolean): string {
  if (gravacaoLigada) {
    return temNome
      ? FALAS_DE_TODO_PROPOSITO.avisoDeGravacao
      : FALAS_DE_TODO_PROPOSITO.avisoDeGravacaoSemNome
  }
  return temNome
    ? FALAS_DE_TODO_PROPOSITO.aberturaSemGravacao
    : FALAS_DE_TODO_PROPOSITO.aberturaSemGravacaoESemNome
}

/**
 * A primeira fala e as variáveis de uma conversa. O aviso de gravação sai só
 * quando a conta tem a gravação ligada: prometer o que não acontece é a única
 * mentira que o produto não pode dizer em voz alta.
 */
export function montarAbertura(pedido: PedidoDeAbertura): Abertura {
  const { identidade, politica } = pedido
  const daChamada = variaveisDaChamada(pedido.lead, pedido.contextoDoLead)
  const temNome = limpo(pedido.lead?.nome) !== ''

  const variaveis: Record<string, string> = {
    ...daChamada,
    nome_do_agente: identidade.nome,
    empresa: identidade.empresa,
  }

  const avisoDeGravacao = politica.gravacaoLigada
    ? interpolarFala(politica.avisoDeGravacao ?? falaDeAbertura(true, temNome), variaveis)
    : null

  return {
    primeiraFala: interpolarFala(
      identidade.primeiraFala ?? falaDeAbertura(politica.gravacaoLigada, temNome),
      variaveis,
    ),
    avisoDeGravacao,
    variaveis,
  }
}
