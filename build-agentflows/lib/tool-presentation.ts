// Catálogo visível no editor. IDs antigos continuam executáveis para preservar fluxos salvos.
export const AGENT_TOOL_CATALOG = [
  { id: "interno:executar_fluxo", name: "Agent as a Tool", icon: "/tool-icons/executar_fluxo.svg" },
  { id: "interno:arxiv", name: "Arxiv", icon: "/tool-icons/arxiv.png" },
  { id: "interno:brave", name: "BraveSearch", icon: "/tool-icons/brave.svg" },
  { id: "interno:brave_mcp", name: "Brave Search MCP", icon: "/tool-icons/brave_mcp.svg" },
  { id: "interno:browserless", name: "Browserless MCP", icon: "/tool-icons/browserless.svg" },
  { id: "interno:calculadora", name: "Calculator", icon: "/tool-icons/calculadora.svg" },
  { id: "interno:e2b", name: "Code Interpreter by E2B", icon: "/tool-icons/e2b.png" },
  { id: "interno:composio", name: "Composio", icon: "/tool-icons/composio.svg" },
  { id: "interno:data_hora", name: "CurrentDateTime", icon: "/tool-icons/data_hora.svg" },
  { id: "interno:custom_mcp", name: "Custom MCP", icon: "/tool-icons/custom_mcp.png" },
  { id: "interno:exa", name: "Exa AI", icon: "/tool-icons/exa.svg" },
  { id: "interno:github_mcp", name: "Github MCP", icon: "/tool-icons/github_mcp.png" },
  { id: "interno:teams", name: "Microsoft Teams", icon: "/tool-icons/teams.svg" },
  { id: "interno:openapi", name: "OpenAPI Toolkit", icon: "/tool-icons/openapi.svg" },
  { id: "interno:postgres_mcp", name: "Postgres MCP", icon: "/tool-icons/postgres_mcp.svg" },
  { id: "interno:searchapi", name: "Search API", icon: "/tool-icons/searchapi.svg" },
  { id: "interno:tavily", name: "Tavily API", icon: "/tool-icons/tavily.svg" },
  { id: "interno:ler_pagina", name: "Web Scraper Tool", icon: "/tool-icons/ler_pagina.svg" },
  { id: "interno:wolfram", name: "WolframAlpha", icon: "/tool-icons/wolfram.png" },
].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
export function toolTitle(tool: { name: string; label?: string; id?: string }) {
  return AGENT_TOOL_CATALOG.find((item) => item.id === (tool.id || `interno:${tool.name}`))?.name || tool.label || tool.name;
}
export function toolIcon(id: string) { return AGENT_TOOL_CATALOG.find((item) => item.id === id)?.icon; }
