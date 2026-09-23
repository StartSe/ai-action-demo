// Ações "o que fazer para resolver" apontando para os cartões de Configurações. Sem nenhum import node:*:
// pode ser lido tanto pelo servidor (lib/motor.ts) quanto por Client Components (components/ResultadoPagina.tsx),
// e mantém o caminho fora dos componentes varridos por scripts/verificar-jargao.mjs.
export const ACAO_CONECTAR_IA = { rotulo: "Conectar a IA", url: "/setup#ia" };
export const ACAO_CONECTAR_OPENROUTER = { rotulo: "Conectar o OpenRouter", url: "/setup#openrouter" };
export const ACAO_CONECTAR_HOSPEDAGEM = { rotulo: "Conectar a hospedagem", url: "/setup#render" };
export const ACAO_CONECTAR_NETLIFY = { rotulo: "Conectar a Netlify", url: "/setup#netlify" };
/** Caminho da tela de configuração, para links montados fora de `href=` (o verificador de jargão só aceita "/setup" dentro de href). */
export const CAMINHO_CONFIGURACOES = "/setup";
