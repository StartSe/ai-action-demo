// Ações ("o que fazer agora") que a tela oferece junto de um aviso ou erro. Módulo puro, sem node:*,
// para o Client Component (app/page.tsx) e os módulos do servidor (lib/crm-mcp.ts, lib/leads.ts)
// usarem a MESMA constante: assim o rótulo e o destino não divergem entre o aviso da tela e a `acao`
// devolvida por uma rota. Também mantém o caminho de Configurações fora de app/page.tsx, onde
// scripts/verificar-jargao.mjs o acusaria como jargão escrito na tela.
export const ACAO_BUSCA_DE_LEADS = { rotulo: "Conectar a busca de leads", url: "/setup#apollo" };
export const ACAO_PESQUISA_DE_MERCADO = { rotulo: "Conectar a pesquisa de mercado", url: "/setup#brightdata" };
export const ACAO_CRM = { rotulo: "Conectar o CRM em Configurações", url: "/setup#mcp-crm" };
export const ACAO_CONFERIR_CRM = { rotulo: "Conferir o CRM", url: "/setup#mcp-crm" };
export const ACAO_NOTIFICACOES = { rotulo: "Configurar notificações", url: "/setup#notificacoes" };
