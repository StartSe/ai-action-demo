// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// Só a IA: este app raciocina sobre o texto que a pessoa escreveu, sem busca externa nem
// integração com quadros, CRM ou notificações.
import { openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que organiza o canvas e aponta as inconsistências" });

export const INTEGRACOES: Integracao[] = [OPENROUTER];
