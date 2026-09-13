// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import type { Ferramenta } from "./mcp";
import { gerarPosts } from "./posts";
import type { DadosPosts, Rede } from "./types";

export const NOME_SERVIDOR = "posts-sociais";

const REDES_VALIDAS: Rede[] = ["linkedin", "instagram", "x"];

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "escrever_posts",
    descricao:
      "Escreve posts prontos para publicar em redes sociais (LinkedIn, Instagram e X) a partir de um briefing curto, cada um no formato e limite de caracteres da rede, com hashtags, melhor horário e sugestão de imagem.",
    schema: {
      type: "object",
      properties: {
        briefing: { type: "string", description: "O que divulgar: empresa ou marca, a novidade ou tema, objetivo e público-alvo, em texto livre" },
        redes: {
          type: "array",
          items: { type: "string", enum: REDES_VALIDAS },
          description: "Redes para gerar (padrão: linkedin e instagram)",
        },
      },
      required: ["briefing"],
    },
    async executar(args) {
      const briefing = String(args.briefing || "").trim();
      if (!briefing) throw new Error("Descreva o que divulgar.");
      const redesPedidas = Array.isArray(args.redes) ? (args.redes as unknown[]).map((r) => String(r).toLowerCase()) : [];
      const redes = redesPedidas.filter((r): r is Rede => REDES_VALIDAS.includes(r as Rede));
      const dados: DadosPosts = {
        empresa: "",
        tema: briefing,
        objetivo: "fortalecer marca",
        tom: "executivo",
        redes: redes.length ? redes : ["linkedin", "instagram"],
        publico: "",
      };
      const { resultado } = await gerarPosts(dados);
      return resultado;
    },
  },
];
