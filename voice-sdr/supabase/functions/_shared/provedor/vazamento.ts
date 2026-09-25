// "O valor nunca sai" vira conferência, não disciplina
// (docs/PRD-implementacao.md seção 8).
//
// Toda borda que resolve credencial e responde alguma coisa tem o mesmo risco:
// um rótulo ecoado pelo provedor, um campo de erro repassado inteiro, um
// objeto de configuração devolvido para depurar — qualquer um deles bastaria
// para a chave da conta chegar ao navegador sem que ninguém tivesse escrito
// `chave` em lugar nenhum. A rede de segurança é procurar cada valor resolvido
// dentro do corpo serializado, imediatamente antes de responder.
//
// Mora aqui, e não numa função, porque já são três as bordas que a usam
// (`integrations-status`, `agent-publish`, `voice-catalog`): três cópias de uma
// regra de segurança divergem no primeiro ajuste, e a que divergir para menos
// não avisa ninguém.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/**
 * Valor curto demais não é procurado: um segredo de três caracteres casaria com
 * qualquer palavra do corpo e transformaria a rede de segurança num falso
 * positivo constante — que é pior do que não existir, porque o time aprende a
 * desligá-la.
 */
export const TAMANHO_MINIMO_PARA_CONFERIR = 8

/**
 * Procura cada valor resolvido no corpo serializado e **levanta** se achar um.
 * Quem chama trata a exceção como falha interna: é melhor não responder do que
 * vazar.
 *
 * A mensagem vem de quem chama porque ela vai para o registro de erro, e ali o
 * que importa é saber qual borda estava respondendo.
 */
export function conferirQueNaoVazou(
  corpo: unknown,
  valores: readonly string[],
  mensagem: string,
): void {
  const dignos = valores.filter((valor) => valor.length >= TAMANHO_MINIMO_PARA_CONFERIR)
  if (dignos.length === 0) return

  const serializado = JSON.stringify(corpo)
  for (const valor of dignos) {
    if (serializado.includes(valor)) throw new Error(mensagem)
  }
}
