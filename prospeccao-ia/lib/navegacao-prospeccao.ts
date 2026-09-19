import type { ItemNavegacao } from "@/lib/navegacao";

/**
 * Os cinco destinos do workspace de prospecção — única divergência da suíte em relação a `NAVEGACAO`
 * (`lib/navegacao.ts`, que continua idêntico ao `pdi-time`), porque este app é um fluxo com estado, não
 * uma geração única (ver PADRAO.md e CLAUDE.md, US-002/US-041). `/setup` também recebe estes
 * destinos por meio da propriedade `navegacao` de `SetupPage`.
 */
export const NAVEGACAO_PROSPECCAO: ItemNavegacao[] = [
  { rotulo: "Início", href: "/" },
  { rotulo: "Produtos", href: "/produtos" },
  { rotulo: "Prospecção", href: "/prospeccoes" },
  { rotulo: "Leads", href: "/leads" },
  { rotulo: "Configurações", href: "/setup" },
];
