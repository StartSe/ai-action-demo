// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que lê a ata e propõe as ações" });

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES];
