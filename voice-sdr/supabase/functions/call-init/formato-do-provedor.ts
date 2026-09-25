// A tradução dos dois sentidos do webhook de início: o corpo que o provedor de
// voz manda vira pedido nosso, e o contexto nosso vira o corpo que ele aceita.
//
// **Por que a tradução mora aqui e não em `contexto.ts`.** É a mesma razão de
// `agent-publish/formato-do-provedor.ts`: os nomes do provedor num arquivo só,
// e trocar de provedor é reescrever este arquivo em vez de caçar chaves
// espalhadas pela decisão. `contexto.ts` fala português do começo ao fim e não
// sabe como o provedor chama nada.
//
// **Por que não em `index.ts`.** Porque isto decide coisas — qual campo é o
// identificador da conversa, o que fazer quando ele vem vazio, como o sentido
// da ligação se descobre — e `index.ts` é adaptador Deno, sem regra dentro e
// fora do `npm run check`.
//
// **Suposição declarada sobre o formato do provedor**, do mesmo estado de T-01
// (`assumida-nao-verificada`, docs/decisao-do-agente.md), que a sonda de
// publicação verifica no degrau 3: o webhook de início manda `conversation_id`,
// `agent_id`, `called_number`, `caller_id`, `call_sid` e as variáveis dinâmicas
// do disparo, e aceita de volta um objeto de início de conversa com variáveis
// dinâmicas e sobreposição da primeira fala. Se a sonda mostrar outra forma, a
// mudança é aqui, e `contexto.ts` não muda.
//
// **O que a documentação do provedor diz, e onde ela diverge da suposição.** O
// webhook de início é configuração do workspace (`agent-publish` o cadastra),
// não é assinado por HMAC — a credencial é o cabeçalho que nós escrevemos — e,
// numa ligação pela Twilio, o corpo documentado é `caller_id`,
// `called_number`, `agent_id` e `call_sid`, **sem** `conversation_id`. A
// saída não depende dele (resolve pelo `call_id` das variáveis dinâmicas); a
// entrada depende, porque é por ele que a chamada recebida nasce e que as
// ferramentas a acham. Se o provedor de fato não o mandar, toda ligação
// recebida sai como `conversa_ausente` — é a primeira coisa que o degrau 3
// precisa conferir numa ligação recebida de verdade.
//
// Módulo portável: sem Deno, sem rede, sem banco.

import type { ContextoDaChamada } from './contexto.ts'

/** O tipo que o provedor espera no corpo de início de conversa. */
export const TIPO_DO_INICIO = 'conversation_initiation_client_data'

/**
 * A variável dinâmica que `call-place` manda no disparo, e a única (T-25). É
 * por ela que a chamada de saída se resolve.
 */
export const VARIAVEL_DA_CHAMADA = 'call_id'

/** O pedido do provedor, já em português e sem nada do vocabulário dele. */
export interface PedidoDeContexto {
  /** `dynamic_variables.call_id`. Presente só na saída, que passou por `call-place`. */
  readonly chamadaId: string | null
  /** `conversation_id`: a conversa no provedor de voz. */
  readonly conversaId: string | null
  /** `agent_id`: qual das quatro publicações atendeu. */
  readonly agenteDoProvedorId: string | null
  /** `called_number`: o número desta instalação que tocou. Só na entrada. */
  readonly numeroChamado: string | null
  /** `caller_id`: quem ligou. Só na entrada. */
  readonly numeroDeQuemLigou: string | null
  /** `call_sid`: a chamada na telefonia. */
  readonly chamadaDaTelefoniaId: string | null
}

/** A sobreposição da primeira fala, como o provedor a aceita. */
export interface CorpoDeInicioDoProvedor {
  readonly type: typeof TIPO_DO_INICIO
  readonly dynamic_variables: Readonly<Record<string, string>>
  readonly conversation_config_override: {
    readonly agent: {
      readonly first_message: string
    }
  }
}

/**
 * O corpo do provedor em pedido nosso, ou nulo quando ele não é sequer um
 * objeto.
 *
 * Campo ausente vira nulo em vez de recusa: quem decide o que é obrigatório em
 * cada sentido é `contexto.ts`, e a lista de obrigatórios da saída não é a da
 * entrada. Recusar aqui poria essa regra em dois lugares.
 */
export function lerPedidoDoProvedor(corpo: unknown): PedidoDeContexto | null {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) return null

  const campos = corpo as Record<string, unknown>
  const variaveis = campos.dynamic_variables
  const dinamicas =
    typeof variaveis === 'object' && variaveis !== null && !Array.isArray(variaveis)
      ? (variaveis as Record<string, unknown>)
      : {}

  return {
    chamadaId: texto(dinamicas[VARIAVEL_DA_CHAMADA]),
    conversaId: texto(campos.conversation_id),
    agenteDoProvedorId: texto(campos.agent_id),
    numeroChamado: texto(campos.called_number),
    numeroDeQuemLigou: texto(campos.caller_id),
    chamadaDaTelefoniaId: texto(campos.call_sid),
  }
}

/**
 * O contexto nosso no corpo que o provedor aceita.
 *
 * `call_id` volta nas variáveis dinâmicas mesmo na saída, onde ele já tinha ido:
 * na **entrada** ele nasce aqui, porque a linha de `calls` acabou de ser criada,
 * e as sete ferramentas precisam dele para saber de qual chamada estão falando.
 * Mandar em um sentido só daria duas formas de resposta para a mesma coisa.
 */
export function corpoParaOProvedor(contexto: ContextoDaChamada): CorpoDeInicioDoProvedor {
  return {
    type: TIPO_DO_INICIO,
    dynamic_variables: { ...contexto.variaveis, [VARIAVEL_DA_CHAMADA]: contexto.chamadaId },
    conversation_config_override: {
      agent: { first_message: contexto.primeiraFala },
    },
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}
