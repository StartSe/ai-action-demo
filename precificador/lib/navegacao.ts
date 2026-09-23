// Destinos do cabeçalho deste app. Próprio do Precificador desde 21/09/2026 (ver CLAUDE.md,
// "app independente"): não copie de/para o pdi-time.
//
// "Histórico" não está no cabeçalho — quatro destinos já é o teto para caber em 360px, e o
// histórico de preço de um item é lido de dentro da própria Bancada, que é onde a pergunta nasce.
export type ItemNavegacao = {
  rotulo: string;
  href: string;
  /** Número no acento ao lado do rótulo (itens no vermelho); ausente ou 0 não desenha nada. */
  contador?: number;
};

export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Itens", href: "/" },
  { rotulo: "Negócio", href: "/negocio" },
  { rotulo: "Configurações", href: "/setup" },
];

/**
 * A mesma navegação com o número de itens no vermelho em "Itens". Quem já tem esse número na tela
 * (a carteira, a Bancada) passa o resultado ao `Topbar`; quem não tem usa `NAVEGACAO` e o cabeçalho
 * fica sem contador, em vez de cada tela buscar isso sozinha.
 */
export function navegacaoComVermelho(noVermelho: number): ItemNavegacao[] {
  return NAVEGACAO.map((item) => (item.href === "/" ? { ...item, contador: noVermelho } : item));
}
