// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, NOTIFICACOES, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que gera o plano de desenvolvimento" });

export const INTEGRACOES: Integracao[] = [OPENROUTER, NOTIFICACOES];
