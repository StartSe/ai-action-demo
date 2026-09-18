// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { responder } from "./atendente";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "whatsapp-atendente";

// Número fixo para as chamadas via MCP: mantém a mesma "conversa" (memória de curto prazo) entre
// perguntas seguidas do assistente, do mesmo jeito que "simulador" é o número fixo do simulador.
const NUMERO_MCP = "assistente-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "responder_pergunta",
    descricao:
      "Responde a uma pergunta de cliente como o atendente virtual configurado, usando a base de conhecimento do negócio (mesmo motor do simulador e do WhatsApp de verdade).",
    schema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "Pergunta ou mensagem do cliente" },
      },
      required: ["pergunta"],
    },
    async executar(args) {
      const pergunta = String(args.pergunta || "").trim();
      if (!pergunta) throw new Error("Informe a pergunta do cliente.");
      const { resposta, transferir } = await responder({ numero: NUMERO_MCP, texto: pergunta, origem: "mcp" });
      // resposta nula = a conversa foi assumida por uma pessoa e a IA não responde por ela.
      if (!resposta) return { resposta: "Esta conversa está sendo atendida por uma pessoa da equipe.", transferir: false };
      return { resposta, transferir };
    },
  },
];
