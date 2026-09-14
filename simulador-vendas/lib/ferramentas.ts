// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarAnalise } from "./analise";
import type { Ferramenta } from "./mcp";
import type { DadosAnalise } from "./types";

export const NOME_SERVIDOR = "simulador-vendas";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_conversa",
    descricao: "Analisa uma conversa de vendas colada (uma fala por linha, no formato 'Vendedor: ...' / 'Cliente: ...') e devolve uma nota geral, a nota e a evidência de cada critério de venda consultiva, pontos fortes, pontos a melhorar e os momentos-chave da conversa.",
    schema: {
      type: "object",
      properties: {
        transcricao: { type: "string", description: "Conversa colada, uma fala por linha, com o prefixo 'Vendedor:' ou 'Cliente:' antes de cada fala" },
        vendedor: { type: "string", description: "Identificador de um vendedor já cadastrado no time (opcional)" },
        cenario: { type: "string", description: "Identificador de um cenário de cliente simulado já cadastrado (opcional)" },
      },
      required: ["transcricao"],
    },
    async executar(args) {
      const transcricao = String(args.transcricao || "").trim();
      if (!transcricao) throw new Error("Cole a transcrição da conversa (uma fala por linha, com 'Vendedor:' ou 'Cliente:').");
      const dados: DadosAnalise = {
        conversaColada: transcricao,
        vendedorId: args.vendedor ? String(args.vendedor) : undefined,
        cenarioId: args.cenario ? String(args.cenario) : undefined,
      };
      return gerarAnalise(dados);
    },
  },
];
