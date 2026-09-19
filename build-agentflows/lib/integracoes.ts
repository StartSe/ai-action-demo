import {
  openrouter,
  integracaoMCP,
  NOTIFICACOES,
  type Integracao,
} from "./setup-comum";
export const INTEGRACOES: Integracao[] = [
  openrouter({ beneficio: "Liga os agentes de IA dos seus fluxos" }),
  integracaoMCP({
    id: "ferramentas",
    titulo: "Ferramentas dos agentes",
    descricao: "Conecte os serviços que seus agentes podem usar.",
    ajudaUrl: "Endereço do servidor de ferramentas",
    rotuloFerramentas: "Ferramentas disponíveis",
  }),
  NOTIFICACOES,
];
