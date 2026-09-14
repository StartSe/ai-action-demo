// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarAvaliacaoExemplo } from "./bussola";
import type { Ferramenta } from "./mcp";
import type { DadosAvaliacao } from "./types";

export const NOME_SERVIDOR = "bussola-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "avaliar_respostas",
    descricao: "Avalia a maturidade em IA de uma empresa. Nesta versão devolve sempre a avaliação de exemplo; a análise de respostas reais chega numa próxima versão, quando o link de coleta existir.",
    schema: {
      type: "object",
      properties: {
        empresa: { type: "string", description: "Nome da empresa avaliada" },
        titulo: { type: "string", description: "Título da avaliação" },
      },
      required: [],
    },
    async executar(args) {
      const { empresa, titulo } = args as Partial<DadosAvaliacao>;
      return gerarAvaliacaoExemplo({ empresa: empresa || "", titulo: titulo || "" });
    },
  },
];
