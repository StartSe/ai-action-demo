// Integrações que este app precisa. O setup (/setup) é gerado a partir desta lista.
// Só a IA: a página é gerada e editada pelo modelo de visão configurado no cartão da IA.
import { openrouter, type Integracao } from "./setup-comum";

// Este app depende do modelo de visão para ler a captura: sai de "Opções avançadas" e ganha ajuda própria.
const OPENROUTER_BASE = openrouter({ visao: true });
const OPENROUTER: Integracao = {
  ...OPENROUTER_BASE,
  campos: OPENROUTER_BASE.campos.map((c) =>
    c.chave === "OPENROUTER_MODEL_VISAO" ? { ...c, avancado: false, ajuda: "Este app depende dele para ler a captura." } : c
  ),
};

export const INTEGRACOES: Integracao[] = [OPENROUTER];
