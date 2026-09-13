// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { MCP_CRM, NOTIFICACOES, OPENROUTER, type Integracao } from "./setup-comum";

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES, MCP_CRM];
