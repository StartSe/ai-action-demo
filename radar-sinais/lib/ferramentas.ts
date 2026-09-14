// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { montarRadar, PERIODOS_VALIDOS } from "./radar";
import type { Ferramenta } from "./mcp";
import type { DadosRadar } from "./types";

export const NOME_SERVIDOR = "radar-sinais";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "montar_radar",
    descricao:
      "Monta um radar de sinais de mercado (agrupados por força e tendência, com conexões entre eles) a partir dos temas que o usuário acompanha, do período e, opcionalmente, do setor da empresa.",
    schema: {
      type: "object",
      properties: {
        temas: { type: "array", items: { type: "string" }, description: "Temas de mercado a acompanhar, um por item" },
        dias: { type: "number", enum: PERIODOS_VALIDOS, description: "Período em dias (7, 30 ou 90; opcional, padrão 30)" },
        setor: { type: "string", description: "Setor da empresa do usuário (opcional)" },
      },
      required: ["temas"],
    },
    async executar(args) {
      const temas = Array.isArray(args.temas) ? args.temas.map((t) => String(t).trim()).filter(Boolean) : [];
      if (temas.length === 0) throw new Error("Informe ao menos um tema para acompanhar.");
      const periodoDias = PERIODOS_VALIDOS.includes(Number(args.dias)) ? Number(args.dias) : 30;
      const setor = args.setor ? String(args.setor).trim() : undefined;
      const dados: DadosRadar = { temas, periodoDias, setor };
      return montarRadar(dados);
    },
  },
];
