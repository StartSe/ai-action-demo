// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
import { analisarCSV } from "./perdas";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "analise-de-perda";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_perdas",
    descricao: "Lê um CSV com notas de perda de oportunidades (motivo de perda em texto livre) e agrupa por motivo real, com contagem e trechos de evidência por grupo. Só leitura: nunca reclassifica nem escreve de volta no CRM de origem.",
    schema: {
      type: "object",
      properties: {
        csv: { type: "string", description: "Conteúdo do arquivo CSV, incluindo o cabeçalho (separador ; , ou tab)." },
        colunaNota: { type: "string", description: "Nome exato da coluna com a nota de perda em texto livre (opcional; sem isso o app detecta sozinho)." },
      },
      required: ["csv"],
    },
    async executar(args) {
      const { csv, colunaNota } = args as { csv?: string; colunaNota?: string };
      if (!csv || !csv.trim()) {
        throw new Error("Envie o conteúdo do CSV com as notas de perda.");
      }
      const resultado = await analisarCSV(csv, { colunaNota });
      return resultado;
    },
  },
];
