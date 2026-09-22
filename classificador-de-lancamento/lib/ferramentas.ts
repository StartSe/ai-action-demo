// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { classificarLancamentos, ErroEntrada } from "./classificador";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "classificador-de-lancamento";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "classificar_lancamentos",
    descricao:
      "Classifica lançamentos financeiros novos pelo padrão encontrado num histórico de lançamentos já classificados pela empresa. Nunca inventa categoria fora do histórico: um lançamento sem precedente claro volta marcado para revisar, nunca classificado por suposição.",
    schema: {
      type: "object",
      properties: {
        historicoCsv: { type: "string", description: 'CSV do histórico já classificado, com colunas de data, descrição, valor e categoria (ex.: "Data,Descrição,Valor,Categoria").' },
        novosCsv: { type: "string", description: 'CSV dos lançamentos novos, sem categoria, com colunas de data, descrição e valor (ex.: "Data,Descrição,Valor").' },
      },
      required: ["historicoCsv", "novosCsv"],
    },
    async executar(args) {
      const { historicoCsv, novosCsv } = args as { historicoCsv?: string; novosCsv?: string };
      if (!historicoCsv || !novosCsv) {
        throw new Error("Envie historicoCsv (histórico já classificado) e novosCsv (lançamentos novos, sem categoria).");
      }
      try {
        const { resultado } = await classificarLancamentos({ historicoTexto: historicoCsv, novosTexto: novosCsv, guardar: false });
        return resultado;
      } catch (err) {
        if (err instanceof ErroEntrada) throw new Error(err.message);
        throw err;
      }
    },
  },
];
