// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter();

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES];
