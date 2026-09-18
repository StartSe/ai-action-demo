import type { ItemNavegacao } from "@/lib/navegacao";

/**
 * Os cinco destinos do workspace de prospecção — única divergência da suíte em relação a `NAVEGACAO`
 * (`lib/navegacao.ts`, que continua idêntico ao `pdi-time`), porque este app é um fluxo com estado, não
 * uma geração única (ver PADRAO.md e CLAUDE.md, US-002/US-041). `/setup` continua com o `Topbar` padrão
 * de três destinos, vindo de `components/setup.tsx` (compartilhado, não alterado).
 */
export const NAVEGACAO_PROSPECCAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Produtos", href: "/produtos" },
  { rotulo: "Prospecções", href: "/prospeccoes" },
  { rotulo: "Leads", href: "/leads" },
  { rotulo: "Configurações", href: "/setup" },
];
