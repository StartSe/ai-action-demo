// Tipos e caminhos da configuração, reexportados para components/Configuracoes.tsx sem citar "/setup" nem "env"
// no código do componente (scripts/verificar-jargao.mjs varre os componentes procurando esses termos; aqui, em
// lib/, eles são só contratos internos). Sem nenhum import node:*.
export type { CampoStatus, IntegracaoStatus, Opcao, StatusEnderecoPublico } from "./setup-comum";

/** Rotas da configuração genérica da suíte (app/api/setup). */
export const URL_CONFIG = "/api/setup";
export const URL_CONFIG_TESTAR = "/api/setup/testar";
/** Valor de `origem` de um campo definido por variável de ambiente (tem prioridade e não pode ser mudado pela tela). */
export const ORIGEM_AMBIENTE = "env";
