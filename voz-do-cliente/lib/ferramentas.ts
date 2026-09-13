// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { analisarComentarios } from "./analise";
import type { Ferramenta } from "./mcp";
import { comentariosDoTexto } from "./parse";

export const NOME_SERVIDOR = "voz-do-cliente";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_comentarios",
    descricao:
      "Analisa comentários de clientes (um por linha): agrupa em temas, calcula sentimento e NPS quando houver notas, e lista elogios, reclamações e ações prioritárias.",
    schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Comentários de clientes, um por linha" },
        contexto: { type: "string", description: "Sobre o que são os comentários, ex.: 'atendimento do suporte' (opcional)" },
      },
      required: ["texto"],
    },
    async executar(args) {
      const texto = String(args.texto || "").trim();
      if (!texto) throw new Error("Envie ao menos um comentário.");
      const comentarios = comentariosDoTexto(texto);
      if (!comentarios.length) throw new Error("Não encontramos comentários nesse texto.");
      const contexto = args.contexto ? String(args.contexto).trim() : "";
      const { analise } = await analisarComentarios({ comentarios, contexto });
      return analise;
    },
  },
];
