// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { NOTIFICACOES, openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter();

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES];
