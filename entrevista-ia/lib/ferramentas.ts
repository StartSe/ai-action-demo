// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { obter } from "./historico";
import type { Ferramenta } from "./mcp";
import type { Scorecard, Troca, Vaga } from "./types";

export const NOME_SERVIDOR = "entrevista-ia";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "obter_scorecard",
    descricao: "Devolve o scorecard já gerado de uma entrevista de triagem (nota, critérios, pontos fortes e de atenção, recomendação), a partir do id devolvido quando o scorecard foi criado ou do link de leitura /r/<id>.",
    schema: {
      type: "object",
      properties: {
        id_entrevista: { type: "string", description: "Id do scorecard, devolvido na geração da avaliação ou visível no link /r/<id>" },
      },
      required: ["id_entrevista"],
    },
    async executar(args) {
      const id = String(args.id_entrevista || "").trim();
      if (!id) throw new Error("Informe o id da entrevista.");
      const resultado = obter<{ vaga: Vaga; historico: Troca[] }, Scorecard>(id);
      if (!resultado || resultado.tipo !== "entrevista") throw new Error("Entrevista não encontrada.");
      return { scorecard: resultado.saida, vaga: resultado.entrada.vaga, titulo: resultado.titulo, criadoEm: resultado.criadoEm };
    },
  },
];
