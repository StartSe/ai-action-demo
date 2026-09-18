// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
import { analisarReuniao } from "./analise";
import { obterNegocio } from "./negocios";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "crm-que-se-preenche";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "analisar_reuniao",
    descricao:
      "Lê a transcrição de uma reunião de vendas e propõe uma atualização do negócio no CRM (etapa, valor, concorrente, próximo passo), cada campo com o trecho da transcrição que sustenta a proposta. Não aplica a atualização — só devolve a proposta para revisão humana.",
    schema: {
      type: "object",
      properties: {
        negocio_id: { type: "string", description: "Id do negócio já cadastrado no CRM" },
        transcricao: { type: "string", description: "Transcrição ou anotações da reunião" },
      },
      required: ["negocio_id", "transcricao"],
    },
    async executar(args) {
      const { negocio_id, transcricao } = args as { negocio_id?: string; transcricao?: string };
      if (!negocio_id || !transcricao) throw new Error("Preencha negocio_id e transcricao.");
      const registro = obterNegocio(negocio_id);
      if (!registro) throw new Error("Negócio não encontrado.");
      const { proposta } = await analisarReuniao(transcricao, registro.saida);
      return proposta;
    },
  },
];
