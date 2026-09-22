// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// Só a IA: o vocabulário de categorias vem 100% do CSV de histórico que a pessoa envia, nunca de uma
// integração externa (não há plano de contas, ERP nem CRM conectado — e nada é escrito de volta neles).
import { openrouter, type Integracao } from "./setup-comum";

const OPENROUTER = openrouter({ beneficio: "Liga a IA que classifica os lançamentos pelo padrão do histórico" });

export const INTEGRACOES: Integracao[] = [OPENROUTER];
