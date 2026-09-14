// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { analisarAvaliacao } from "./bussola";
import { obter } from "./historico";
import { QUESTIONARIO_MODELO } from "./modelo";
import type { Ferramenta } from "./mcp";
import type { Avaliacao, DadosAvaliacao, Resposta } from "./types";

export const NOME_SERVIDOR = "bussola-ia";

type RespostaBruta = { area?: string; cargo?: string; valores: Record<string, string> };

function paraRespostas(bruto: RespostaBruta[]): Resposta[] {
  const agora = new Date().toISOString();
  return bruto.map((r, i) => ({
    id: `mcp-${i + 1}`,
    respondente: r.area || r.cargo ? { area: r.area, cargo: r.cargo } : undefined,
    valores: r.valores || {},
    criadoEm: agora,
  }));
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "avaliar_respostas",
    descricao: "Calcula o diagnóstico de maturidade em IA (nível geral, força e lacunas por dimensão, próximos passos) a partir de respostas já coletadas para o questionário modelo de 6 dimensões (Estratégia e liderança, Dados e infraestrutura, Pessoas e cultura, Processos e casos de uso, Governança e riscos, Resultados).",
    schema: {
      type: "object",
      properties: {
        respostas: {
          type: "array",
          description: "Uma entrada por respondente",
          items: {
            type: "object",
            properties: {
              area: { type: "string", description: "Área do respondente, opcional" },
              cargo: { type: "string", description: "Cargo do respondente, opcional" },
              valores: {
                type: "object",
                description: "Chave = id da pergunta do questionário modelo (ex.: 'estrategia-1'), valor = nota de 1 a 5 (perguntas de escala) ou texto livre (perguntas de texto)",
              },
            },
            required: ["valores"],
          },
        },
        empresa: { type: "string", description: "Nome da empresa avaliada" },
        titulo: { type: "string", description: "Título da avaliação" },
      },
      required: ["respostas"],
    },
    async executar(args) {
      const bruto = args.respostas as RespostaBruta[] | undefined;
      if (!Array.isArray(bruto) || bruto.length === 0) throw new Error("Informe ao menos uma resposta.");
      const { empresa, titulo } = args as Partial<DadosAvaliacao>;
      return analisarAvaliacao({ empresa: empresa || "", titulo: titulo || "", questionario: QUESTIONARIO_MODELO, respostas: paraRespostas(bruto) });
    },
  },
  {
    nome: "resultado_avaliacao",
    descricao: "Devolve o diagnóstico de maturidade em IA já calculado, a partir do id devolvido pela análise ou visível no link /r/<id>.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id do diagnóstico" },
      },
      required: ["id"],
    },
    async executar(args) {
      const id = String(args.id || "").trim();
      if (!id) throw new Error("Informe o id do diagnóstico.");
      const resultado = obter<DadosAvaliacao, Avaliacao>(id);
      if (!resultado || resultado.tipo !== "avaliacao") throw new Error("Diagnóstico não encontrado.");
      return { avaliacao: resultado.saida, titulo: resultado.titulo, criadoEm: resultado.criadoEm };
    },
  },
];
