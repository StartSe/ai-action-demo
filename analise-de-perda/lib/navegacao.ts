// Destinos reais do cabeçalho da suíte. Copie este arquivo para cada app sem alterar.
export type ItemNavegacao = { rotulo: string; href: string };

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Histórico", href: "/historico" },
  { rotulo: "Configurações", href: "/setup" },
];
