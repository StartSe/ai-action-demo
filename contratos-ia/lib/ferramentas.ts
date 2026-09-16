// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { analisarContrato, VALORES_PAPEL } from "./contratos";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "contratos-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_contrato",
    descricao:
      "Analisa o texto de um contrato empresarial do ponto de vista do papel informado (contratante, contratado, locador etc.): resumo executivo, nota de risco, cláusulas de risco, prazos com data de calendário, obrigações, pontos ausentes e perguntas para o jurídico.",
    schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Texto integral do contrato (pelo menos algumas cláusulas)" },
        papel: { type: "string", enum: VALORES_PAPEL, description: "Papel do usuário neste contrato" },
        preocupacao: { type: "string", description: "O que mais preocupa o usuário neste contrato (opcional)" },
      },
      required: ["texto", "papel"],
    },
    async executar(args) {
      const texto = String(args.texto || "").trim();
      if (texto.length < 200) throw new Error("Envie o texto do contrato (pelo menos algumas cláusulas).");
      const papelInformado = String(args.papel || "").trim().toLowerCase();
      const papel = VALORES_PAPEL.includes(papelInformado) ? papelInformado : "outro";
      const preocupacao = String(args.preocupacao || "").trim();
      const { analise } = await analisarContrato({ paginas: [texto], papel, preocupacao });
      return analise;
    },
  },
];
