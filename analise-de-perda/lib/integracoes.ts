// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
import { openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Lê as notas de perda e agrupa pelo motivo real" });

export const INTEGRACOES: Integracao[] = [OPENROUTER];
