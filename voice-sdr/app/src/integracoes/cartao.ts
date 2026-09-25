/**
 * As decisões do cartão de integração, fora do componente: o estado que o selo
 * mostra e o que sai do formulário. Função pura se testa sozinha, e é o que
 * permite provar a regra "campo em branco não apaga chave" sem montar tela.
 */

import type {
  CotaDoProvedor,
  CreditoDoProvedor,
  EstadoDaIntegracao,
  Integracao,
} from '@/integracoes/tipos'

/**
 * Os estados do servidor mais o da tela. `testando` só existe enquanto o
 * pedido viaja: nenhum servidor observa "estou sendo perguntado".
 */
export type EstadoDoCartao = EstadoDaIntegracao | 'testando'

/**
 * O estado que o cartão mostra. Enquanto há pedido em voo o estado anterior
 * não vale mais — dizer "com erro" em cima de um teste em andamento manda
 * quem administra a conta agir sobre um resultado que já está sendo refeito.
 */
export function estadoDoCartao(
  integracao: Integracao,
  emTeste: boolean,
): EstadoDoCartao {
  return emTeste ? 'testando' : integracao.estado
}

/**
 * O que de fato vai para o cofre: valores aparados, sem os campos em branco.
 * Campo vazio é "não mexi nesta chave", nunca "apague a que está lá" — apagar
 * é outra operação, e ela não existe nesta tela.
 */
export function valoresParaSalvar(
  rascunho: Readonly<Record<string, string>>,
): Record<string, string> {
  const valores: Record<string, string> = {}

  for (const [chave, valor] of Object.entries(rascunho)) {
    const aparado = valor.trim()
    if (aparado) valores[chave] = aparado
  }

  return valores
}

/** Só há o que salvar quando ao menos um campo foi preenchido. */
export function podeSalvar(rascunho: Readonly<Record<string, string>>): boolean {
  return Object.keys(valoresParaSalvar(rascunho)).length > 0
}

/**
 * Há ao menos uma chave no cofre. Decide entre "cadastrada, digite outra para
 * substituir" e "nenhuma chave cadastrada" — a linha que diz ao operador por
 * que o campo está vazio mesmo com a integração ligada.
 */
export function algumaChaveCadastrada(integracao: Integracao): boolean {
  return integracao.chaves.some((chave) => chave.preenchida)
}

const QUANTIDADE = new Intl.NumberFormat('pt-BR')

/**
 * O saldo como o provedor o reporta. Sem total contratado sai só o restante:
 * inventar um denominador seria mentir sobre o plano da conta.
 */
export function descreverCredito(credito: CreditoDoProvedor): string {
  const restante = QUANTIDADE.format(credito.restante)
  const total =
    credito.total === null ? '' : ` de ${QUANTIDADE.format(credito.total)}`
  return `${restante}${total} ${credito.unidade}`
}

/** Capacidade em uso, no formato "3 de 10". */
export function descreverCota(cota: CotaDoProvedor): string {
  return `${QUANTIDADE.format(cota.emUso)} de ${QUANTIDADE.format(cota.limite)}`
}
