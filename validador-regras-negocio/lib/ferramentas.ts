// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { validarIdeia } from "./validador";
import type { Ferramenta } from "./mcp";
import type { DadosValidador } from "./types";

export const NOME_SERVIDOR = "validador-regras-negocio";

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "validar_ideia_negocio",
    descricao:
      "Organiza a descrição em texto livre de uma ideia de negócio nos nove blocos do Quadro de Modelo de Negócios (Business Model Canvas) e aponta as inconsistências entre blocos, citando quais dois blocos entram em conflito e por quê. Um bloco sem informação suficiente na descrição fica vazio, nunca preenchido por suposição.",
    schema: {
      type: "object",
      properties: {
        descricao: { type: "string", description: "Descrição em texto livre da ideia de negócio" },
      },
      required: ["descricao"],
    },
    async executar(args) {
      const { descricao } = args as Partial<DadosValidador>;
      if (!descricao || !descricao.trim()) {
        throw new Error("Descreva a ideia de negócio antes de validar.");
      }
      const resposta = await validarIdeia({ descricao });
      return resposta;
    },
  },
];
