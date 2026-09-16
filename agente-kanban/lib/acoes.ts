// Ações ("o que fazer agora") que a tela oferece junto de um aviso ou erro. Módulo puro, sem node:*,
// para o Client Component (app/page.tsx) e os módulos do servidor (lib/trello.ts) usarem a MESMA
// constante: assim o rótulo e o destino não divergem entre o aviso da tela e a `acao` devolvida por
// uma rota. Também mantém o caminho de Configurações fora de app/page.tsx, onde
// scripts/verificar-jargao.mjs o acusaria como jargão escrito na tela.
export const ACAO_TRELLO = { rotulo: "Conferir o quadro em Configurações", url: "/setup#trello" };
export const ACAO_AUTORIZAR_TRELLO = { rotulo: "Autorizar no Trello de novo", url: "/setup#trello" };
export const ACAO_QUADRO_CONECTADO = { rotulo: "Conferir o quadro conectado", url: "/setup#mcp-tarefas" };
export const ACAO_NOTIFICACOES = { rotulo: "Configurar notificações", url: "/setup#notificacoes" };
