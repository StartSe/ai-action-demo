// O que quem aponta o formulário para o endereço público lê, e com que status.
//
// Um arquivo só, no mesmo desenho de `invite-accept/respostas.ts` e de
// `leads-import/respostas.ts`: o resto da função produz código
// (`chave_invalida`, `celular_sem_nono_digito`) e nunca frase.
//
// Aqui a regra tem um efeito a mais, e é ele o terceiro e o quinto critério de
// aceite da história: **o código cru de `_shared/telefone.ts` não sai daqui**.
// O corpo da resposta carrega `motivo: 'telefone_invalido'` e a frase do defeito
// específico; `celular_sem_nono_digito` fica dentro da borda. Quem chama é o
// formulário do site de um cliente, e o que ele precisa é da frase para mostrar
// a quem preencheu — o código seria vocabulário interno vazando para fora.
//
// A varredura do teste é grosseira de propósito — ela procura o código como
// subcadeia em qualquer lugar do corpo serializado —, e isso proíbe a prosa
// daqui de usar a palavra `vazio`, que em português não é jargão nenhum. O
// preço é escrever "em branco", que é o termo que o resto da interface já usa;
// a alternativa, uma varredura com fronteira de palavra, deixaria passar o
// código emendado em qualquer outro texto.
//
// Registro de interface, não fala da Sarah: direto e declarativo, dizendo o que
// aconteceu e o que fazer em seguida (docs/padrao-de-interface.md seção 4).

import type { MotivoDeRecusa } from '../_shared/telefone.ts'

/** Desfecho quando o lead entrou. Os três são sucesso, e dizem o que mudou. */
export type MotivoAceito = 'lead_criado' | 'lead_atualizado' | 'lead_conhecido'

/** Recusas. Todas com frase, nenhuma com código de outro módulo dentro. */
export type MotivoRecusado =
  | 'metodo_invalido'
  | 'chave_invalida'
  | 'limite_excedido'
  | 'corpo_invalido'
  | 'telefone_invalido'
  | 'falha_interna'

export type MotivoDaEntrada = MotivoAceito | MotivoRecusado

export const MENSAGENS: Record<MotivoDaEntrada, string> = {
  lead_criado: 'Lead recebido.',
  lead_atualizado: 'Lead recebido. O contato já existia e os campos em branco foram preenchidos.',
  lead_conhecido: 'Lead recebido. Este telefone já estava cadastrado e nada mudou.',

  metodo_invalido: 'Este endereço aceita apenas POST.',
  // A mesma frase para chave ausente, malformada e desconhecida, de propósito:
  // dizer "esta chave não existe" e "esta chave não é desta conta" com frases
  // diferentes entrega, a quem estiver tentando chaves, a informação de que uma
  // delas chegou perto.
  chave_invalida:
    'A chave deste endereço não foi aceita. Confira o cabeçalho x-intake-key com quem administra a conta.',
  limite_excedido:
    'Este endereço recebeu pedidos demais em pouco tempo. Aguarde o tempo indicado em Retry-After e envie de novo.',
  corpo_invalido: 'O pedido precisa de um corpo JSON com os campos do lead.',
  telefone_invalido: 'O telefone não foi aceito.',
  falha_interna:
    'Não foi possível registrar o lead agora. Envie o pedido de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaEntrada, number> = {
  // 201 para o lead que nasceu, 200 para o que já existia: é a diferença que o
  // cliente pode querer contar do lado dele, e ela não precisa de campo novo.
  lead_criado: 201,
  lead_atualizado: 200,
  lead_conhecido: 200,

  metodo_invalido: 405,
  chave_invalida: 401,
  limite_excedido: 429,
  corpo_invalido: 400,
  // 422 e não 400: o corpo chegou íntegro e foi entendido: é o valor do campo
  // que não serve. Quem integra distingue os dois no log sem ler a frase.
  telefone_invalido: 422,
  falha_interna: 500,
}

/**
 * A frase de cada defeito de telefone. Ela substitui a genérica de
 * `telefone_invalido` no corpo da resposta, e é o único lugar em que o código
 * de `_shared/telefone.ts` aparece — como chave deste mapa, dentro da borda.
 *
 * Nenhuma frase pode conter o código que a gerou. Não é estética: o teste varre
 * o corpo serializado da resposta atrás dos seis códigos, e uma frase que
 * citasse `celular_sem_nono_digito` faria a varredura acusar vazamento.
 */
export const MENSAGENS_DO_TELEFONE: Record<MotivoDeRecusa, string> = {
  vazio: 'Informe o telefone do lead. Sem ele não há para onde ligar.',
  sem_digitos: 'O telefone enviado não tem nenhum dígito.',
  comprimento_invalido:
    'O telefone não tem a quantidade de dígitos de um número brasileiro. Envie o código de área e o número.',
  ddd_invalido: 'O código de área informado não existe no Brasil.',
  celular_sem_nono_digito:
    'Falta um dígito neste celular. Confira o número com quem preencheu o formulário.',
  pais_nao_suportado:
    'Este número é de outro país. O endereço aceita apenas números do Brasil.',
}
