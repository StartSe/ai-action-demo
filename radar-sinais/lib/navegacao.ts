// Destinos do cabeçalho deste app (app independente: a lista é própria, o Topbar é o da suíte).
export type ItemNavegacao = { rotulo: string; href: string };

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Temas", href: "/termos" },
  { rotulo: "Radar", href: "/radar" },
  { rotulo: "Configurações", href: "/setup" },
];
