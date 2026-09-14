// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { gerarLeitura } from "./leitura";
import type { Ferramenta } from "./mcp";
import type { Periodo } from "./types";

export const NOME_SERVIDOR = "custos-ia";

const PERIODOS_VALIDOS: Periodo[] = ["mes", "3meses", "ano"];

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gastos_ia",
    descricao: "Devolve o gasto da empresa com ferramentas de IA no período pedido, comparado ao orçamento planejado: total gasto, variação contra o mês anterior, gasto por ferramenta (com aviso de quem estourou o orçamento) e gasto por mês.",
    schema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: PERIODOS_VALIDOS, description: "\"mes\" (mês atual), \"3meses\" (últimos 3 meses) ou \"ano\" (últimos 12 meses). Padrão: \"mes\"." },
      },
      required: [],
    },
    async executar(args) {
      const { periodo } = args as { periodo?: string };
      const periodoValido: Periodo = PERIODOS_VALIDOS.includes(periodo as Periodo) ? (periodo as Periodo) : "mes";
      const { leitura } = await gerarLeitura(periodoValido);
      return leitura;
    },
  },
];
