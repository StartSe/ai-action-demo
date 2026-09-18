// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
import { gerarBriefing } from "./campanha";
import type { Ferramenta } from "./mcp";
import type { Campanha } from "./types";

export const NOME_SERVIDOR = "briefing-de-campanha";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gerar_briefing",
    descricao: "Gera o briefing de uma campanha de marketing (público-alvo, proposta de valor, mensagens-chave, canais, cronograma, KPIs e restrições) a partir dos dados da campanha e das informações já levantadas sobre ela.",
    schema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome da campanha" },
        objetivo: { type: "string", description: "O que a campanha precisa alcançar" },
        produto: { type: "string", description: "Produto ou serviço divulgado" },
        informacoes: { type: "string", description: "Tudo o que já se sabe sobre público-alvo, verba, canais preferidos, prazo, diferenciais, tom de voz e restrições, em texto livre" },
      },
      required: ["nome", "objetivo", "produto", "informacoes"],
    },
    async executar(args) {
      const { nome, objetivo, produto, informacoes } = args as Partial<Campanha> & { informacoes?: string };
      if (!nome || !objetivo || !produto || !informacoes) {
        throw new Error("Preencha nome, objetivo, produto e as informações já levantadas sobre a campanha.");
      }
      const campanha: Campanha = { nome, objetivo, produto, numero_perguntas: 6 };
      const { briefing } = await gerarBriefing(campanha, [{ papel: "pessoa", texto: informacoes }]);
      return briefing;
    },
  },
];
