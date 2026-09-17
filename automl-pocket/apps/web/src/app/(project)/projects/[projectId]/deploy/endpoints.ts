import { AppWindow, Bot, Braces, type LucideIcon } from "lucide-react";

import type { DeploymentType } from "@/db/schema";

export type EndpointDef = {
  type: DeploymentType;
  /** Segmento da rota de configuração em /deploy/<slug> */
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

// Os 3 endpoints suportados, na ordem do grid (sem integrações não suportadas)
export const ENDPOINTS: EndpointDef[] = [
  {
    type: "api",
    slug: "api",
    label: "API",
    description:
      "Endpoint HTTP com chave secreta para integrar predições em qualquer sistema.",
    icon: Braces,
  },
  {
    type: "web_app",
    slug: "web-app",
    label: "Web App",
    description:
      "Formulário público com link secreto: qualquer pessoa prevê sem precisar de conta.",
    icon: AppWindow,
  },
  {
    type: "mcp",
    slug: "mcp",
    label: "MCP",
    description:
      "Tool de predição para clientes MCP, como o Claude, usarem seu modelo.",
    icon: Bot,
  },
];
