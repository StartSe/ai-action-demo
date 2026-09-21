// As conexões disponíveis no Bússola; ChatGPT usa autenticação por dispositivo.
import { openrouter, type Integracao } from "./setup-comum";
const OPENROUTER = openrouter({
  beneficio: "Cria questionários e aprofunda a leitura dos assessments",
});
export const INTEGRACOES: Integracao[] = [
  {
    ...OPENROUTER,
    titulo: "OpenRouter",
    oauth: { ...OPENROUTER.oauth!, rotulo: "Conectar com OpenRouter" },
  },
];
