// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, MCP_TAREFAS, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que gera o plano de desenvolvimento" });

/** O quadro onde o time já trabalha vira fonte das entregas: "Buscar entregas no quadro" no painel. */
const QUADRO: Integracao = { ...MCP_TAREFAS, beneficio: "Puxa as entregas da pessoa direto do quadro do time" };

export const INTEGRACOES: Integracao[] = [OPENROUTER, QUADRO, NOTIFICACOES];
