// Destinos reais do cabeçalho deste app. Desde 17/09/2026 este arquivo é próprio do
// whatsapp-atendente (ver CLAUDE.md, "app independente"): não copie de/para o pdi-time.
// "Histórico" saiu do cabeçalho — os relatórios antigos são linkados de dentro de Relatórios.
export type ItemNavegacao = { rotulo: string; href: string };

/** Um app pode acrescentar um destino próprio passando `navegacao={[...NAVEGACAO, {...}]}` ao Topbar, sem editar o componente. */
export const NAVEGACAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Conversas", href: "/conversas" },
  { rotulo: "Assistente", href: "/assistente" },
  { rotulo: "Relatórios", href: "/relatorios" },
  { rotulo: "Configurações", href: "/setup" },
];
