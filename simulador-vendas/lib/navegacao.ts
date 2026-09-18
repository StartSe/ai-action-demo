// Destinos do cabeçalho DESTE app. Ao contrário dos outros da suíte, este arquivo não é mais uma cópia
// literal do pdi-time: o Simulador de Vendas é um app independente (`"independente": true` em
// catalogo.json, US-001), dono da própria camada visual e de navegação. Ver CLAUDE.md.
//
// Seis destinos, na ordem do fluxo de quem usa: cadastro o produto, crio a simulação, vejo quem treinou
// e o que saiu disso. "Histórico" saiu daqui e passou a ser linkado só de Resultados — é uma lista de
// arquivos gerados, não um lugar de trabalho.
export type ItemNavegacao = { rotulo: string; href: string };

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Produtos", href: "/produtos" },
  { rotulo: "Simulações", href: "/simulacoes" },
  { rotulo: "Equipe", href: "/equipe" },
  { rotulo: "Resultados", href: "/resultados" },
  { rotulo: "Configurações", href: "/setup" },
];
