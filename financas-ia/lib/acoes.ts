// "O que fazer agora" de cada erro/aviso deste app, em um módulo puro (sem node:*) para o mesmo par
// {rótulo, endereço} servir ao Client Component (app/page.tsx) e aos módulos do servidor. Além de
// evitar que o rótulo da tela divirja do devolvido pela rota, tira o literal de configuração de dentro
// de app/page.tsx, onde scripts/verificar-jargao.mjs o acusa quando escrito como valor de objeto.
export const ACAO_FONTE_DADOS = { rotulo: "Conectar a fonte de dados", url: "/setup#mcp-dados" };
export const ACAO_NOTIFICACOES = { rotulo: "Configurar as notificações", url: "/setup#notificacoes" };
export const ACAO_ORCAMENTO = { rotulo: "Cadastrar o orçamento", url: "/setup#orcamento-por-categoria" };
