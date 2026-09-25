// Como a interface chama a assistente.
//
// A assistente não tem nome de fábrica: quem configura escolhe, na primeira
// pergunta do tutorial, e é esse nome que a tela usa onde a cita. Antes de ele
// existir, o texto é genérico. As duas formas cabem depois do mesmo artigo
// ("a Ana", "a assistente"), e é isso que deixa a frase ser escrita uma vez só.

/** A palavra que ocupa o lugar do nome enquanto ele não foi escolhido. */
export const NOME_GENERICO = 'assistente'

/** O nome gravado, ou "assistente" quando ainda não há. Vai depois do artigo. */
export function nomeOuAssistente(nome: string | null | undefined): string {
  const aparado = nome?.trim() ?? ''
  return aparado === '' ? NOME_GENERICO : aparado
}

/** O mesmo, para começo de rótulo: "Ana" ou "Assistente". */
export function nomeOuAssistenteNoInicio(nome: string | null | undefined): string {
  const escolhido = nomeOuAssistente(nome)
  return escolhido === NOME_GENERICO ? 'Assistente' : escolhido
}
