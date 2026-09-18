// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que conduz a conversa e monta o briefing" });

export const INTEGRACOES: Integracao[] = [OPENROUTER];
