// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarPDI } from "./pdi";
import type { Ferramenta } from "./mcp";
import type { DadosPDI } from "./types";

export const NOME_SERVIDOR = "pdi-time";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gerar_pdi",
    descricao: "Gera um Plano de Desenvolvimento Individual (PDI) para um profissional, com pontos fortes, lacunas, objetivos e ações em 30/60/90 dias, a partir das entregas recentes e dos objetivos da empresa.",
    schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome do profissional" },
        cargo: { type: "string", description: "Cargo atual do profissional" },
        tempo: { type: "string", description: "Tempo na função (opcional)" },
        entregas: { type: "string", description: "Entregas e atividades recentes do profissional" },
        objetivos: { type: "string", description: "Objetivos da empresa para o período" },
        aspiracoes: { type: "string", description: "Aspirações declaradas pelo profissional (opcional)" },
      },
      required: ["nome", "cargo", "entregas", "objetivos"],
    },
    async executar(args) {
      const { nome, cargo, tempo, entregas, objetivos, aspiracoes } = args as Partial<DadosPDI>;
      if (!nome || !cargo || !entregas || !objetivos) {
        throw new Error("Preencha nome, cargo, entregas recentes e objetivos da empresa.");
      }
      const dados: DadosPDI = { nome, cargo, tempo: tempo || "", entregas, objetivos, aspiracoes };
      return gerarPDI(dados);
    },
  },
];
