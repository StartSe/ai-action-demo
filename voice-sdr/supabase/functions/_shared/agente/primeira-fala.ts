// A primeira fala e os marcadores dela (RF-304).
//
// Este módulo nasceu de uma segunda cópia. A interpolação vivia em
// `voice-catalog/catalogo.ts`, porque a amostra da voz era quem precisava dela;
// a tela `/sarah/identidade` precisa da mesma coisa para mostrar a prévia da
// abertura enquanto se escreve, e **precisa da mesma, não de uma parecida**:
// uma prévia que resolvesse os marcadores de um jeito e a voz de outro faria
// quem configura ouvir uma abertura diferente da que leu na tela.
//
// A interface só importa de `_shared/`, então é aqui que a regra mora. Quem
// sintetiza a amostra lê daqui; a tela lê daqui a lista de marcadores que
// mostra ao lado do campo e que a recusa cita.
//
// Módulo portável: sem Deno, sem rede, sem banco e sem relógio.

import {
  MARCADORES_DA_CHAMADA,
  MARCADORES_DA_PUBLICACAO,
  limparEspacos,
} from './compilador.ts'

/**
 * O cenário de demonstração do produto, e por isso o lead da prévia e da
 * amostra (docs/PRD-implementacao.md seção 10, docs/padrao-de-interface.md
 * seção 5). Um nome só, em toda tela de exemplo: é o que torna o produto
 * compreensível numa passada, e é o que faz a abertura lida aqui soar como a
 * de verdade.
 */
export const LEAD_DE_EXEMPLO: Readonly<Record<string, string>> = {
  nome_do_lead: 'Marcos Ferreira',
  empresa_do_lead: 'Fluxo Cargo',
  cidade_do_lead: 'Joinville',
  nome_do_especialista: 'Marina Alcântara',
}

/**
 * Todo marcador que a primeira fala pode carregar: o que a conta preenche
 * (`MARCADORES_DA_PUBLICACAO`), o que só a ligação preenche
 * (`MARCADORES_DA_CHAMADA`) e o que o lead da semente cobre na prévia.
 *
 * É esta lista que a tela mostra ao lado do campo e é esta lista que a recusa
 * cita. Uma segunda lista escrita à mão na interface envelheceria sozinha, e o
 * primeiro marcador novo do compilador viraria recusa de uma variável que
 * existe.
 */
export const MARCADORES_DA_PRIMEIRA_FALA: readonly string[] = [
  // Sem repetição: `nome_do_lead` está nas duas origens, porque é o marcador
  // que a ligação preenche e é também o que o lead da semente cobre na prévia.
  // Repetido, ele vira duas linhas na lista que a tela desenha ao lado do
  // campo, e duas vezes a mesma variável na frase da recusa.
  ...new Set([
    ...MARCADORES_DA_PUBLICACAO,
    ...MARCADORES_DA_CHAMADA,
    ...Object.keys(LEAD_DE_EXEMPLO),
  ]),
]

/** A forma de um marcador no texto: `{nome_do_lead}`. */
const MARCADOR = /\{([a-z_]+)\}/g

/** Os marcadores escritos no texto, na ordem, sem repetir. */
export function marcadoresDe(texto: string): string[] {
  const achados = new Set<string>()
  for (const casamento of texto.matchAll(MARCADOR)) {
    const chave = casamento[1]
    if (chave !== undefined) achados.add(chave)
  }
  return [...achados]
}

/**
 * Os marcadores que ninguém sabe preencher.
 *
 * Existe para a tela recusar a gravação antes de o texto virar fala: um
 * `{cargo}` que sobrevive à interpolação some da frase na síntese, e quem
 * escreveu descobriria isso ouvindo a Sarah pular metade da abertura.
 */
export function marcadoresDesconhecidos(texto: string): string[] {
  const conhecidos = new Set(MARCADORES_DA_PRIMEIRA_FALA)
  return marcadoresDe(texto).filter((marcador) => !conhecidos.has(marcador))
}

/** A identidade da conta, no recorte que a interpolação precisa. */
export type IdentidadeDaFala = {
  readonly nome: string
  readonly empresa: string
  readonly nuncaAfirmar: readonly string[]
}

/**
 * O que a conta preenche, com os nomes do compilador. A junção da lista de
 * restrições é a mesma de `compilarPublicacao`: a prévia tem que dizer o que a
 * publicação diria.
 */
export function valoresDaConta(
  identidade: IdentidadeDaFala,
): Readonly<Record<string, string>> {
  return {
    nome_do_agente: identidade.nome,
    empresa: identidade.empresa,
    nunca_afirmar:
      identidade.nuncaAfirmar.length > 0
        ? identidade.nuncaAfirmar.join('; ')
        : 'a conta não listou nada',
  }
}

/**
 * A primeira fala com todos os marcadores resolvidos (RF-304).
 *
 * Três regras, nesta ordem: o que a publicação sabe preencher vem da identidade
 * da conta; o que só a chamada saberia vem do lead da semente; e o que ninguém
 * conhece **some**. A terceira é a que importa ver para acreditar: um `{cargo}`
 * sobrevivente seria lido em voz alta pela voz sintetizada, e quem está
 * escolhendo a voz concluiria que a Sarah fala assim na ligação.
 */
export function interpolarPrimeiraFala(
  primeiraFala: string,
  identidade: IdentidadeDaFala,
): string {
  const valores: Record<string, string> = {
    ...valoresDaConta(identidade),
    ...LEAD_DE_EXEMPLO,
  }

  const preenchida = primeiraFala.replace(
    MARCADOR,
    (_original, chave: string) => valores[chave] ?? '',
  )
  return limparEspacos(preenchida)
}

/** A mesma limpeza da publicação, que é quem a define. */
export { limparEspacos }
