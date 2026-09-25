// As origens que valem como endereço de retorno de um OAuth iniciado pela
// interface (hoje, o do modelo em `model-connect`).
//
// **Cada cliente publica a própria cópia da interface**, num endereço que a
// instalação do banco não conhece (docs/instalacao.md). Exigir
// `SARAH_ORIGENS_PERMITIDAS` seria um passo manual por cópia, e sem ele nenhum
// retorno passaria.
//
// Sem a variável, vale **a origem do próprio pedido**: o cabeçalho `Origin` que
// o navegador põe na chamada autenticada. Continua fechado para o caso que o
// filtro existe para barrar — um retorno apontando para um site de fora —,
// porque quem faz a chamada precisa do JWT de quem está na tela, e o JWT mora
// no armazenamento da origem da cópia. Uma página de outra origem não o tem, e
// se tivesse, o retorno dela teria que ser ela mesma.
//
// A variável definida continua vencendo: quem quer travar as origens trava.
//
// Módulo portável: sem Deno, sem rede.

export function origensPermitidas(
  definidas: string | null | undefined,
  origemDoPedido: string | null | undefined,
): string[] {
  const lista = (definidas ?? '')
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem !== '')
  if (lista.length > 0) return lista

  const origem = origemDoPedido?.trim() ?? ''
  if (origem === '' || origem === 'null') return []
  try {
    return [new URL(origem).origin]
  } catch {
    return []
  }
}
