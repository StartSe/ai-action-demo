// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { criarAcoesEmLote, extrairAcoesDaAta } from "./acoes";
import type { Ferramenta } from "./mcp";

export const NOME_SERVIDOR = "follow-up-de-decisao";

type AcaoDireta = { titulo?: unknown; dono?: unknown; prazo?: unknown };

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "registrar_acoes",
    descricao:
      "Cadastra ações de follow-up de decisão (o quê, quem é o dono, até quando é o prazo). Aceita o texto de uma ata de reunião (a IA extrai as ações, sem inventar dono ou prazo que a ata não deixe explícito) ou uma lista de ações já definidas. Devolve o que foi cadastrado.",
    schema: {
      type: "object",
      properties: {
        texto_ata: { type: "string", description: "Texto de uma ata ou trecho de reunião do qual extrair as ações (opcional se `acoes` for enviado)" },
        acoes: {
          type: "array",
          description: "Lista de ações já definidas para cadastrar diretamente, sem passar pela extração (opcional se `texto_ata` for enviado)",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "O que precisa ser feito" },
              dono: { type: "string", description: "Quem é o responsável (opcional)" },
              prazo: { type: "string", description: "Prazo no formato AAAA-MM-DD (opcional)" },
            },
            required: ["titulo"],
          },
        },
      },
    },
    async executar(args) {
      const { texto_ata: textoAta, acoes } = args as { texto_ata?: string; acoes?: AcaoDireta[] };
      if (textoAta && textoAta.trim()) {
        const extracao = await extrairAcoesDaAta(textoAta);
        const criadas = criarAcoesEmLote(extracao.acoes.map((a) => ({ ...a, origem: "ata" as const })));
        return { demo: extracao.demo, cadastradas: criadas };
      }
      if (Array.isArray(acoes) && acoes.length > 0) {
        const validas = acoes.filter((a): a is { titulo: string; dono?: string; prazo?: string } => typeof a.titulo === "string" && a.titulo.trim().length > 0);
        if (validas.length === 0) throw new Error("Nenhuma ação com título válido foi enviada.");
        const criadas = criarAcoesEmLote(validas.map((a) => ({ titulo: a.titulo, dono: typeof a.dono === "string" ? a.dono : undefined, prazo: typeof a.prazo === "string" ? a.prazo : undefined, origem: "manual" as const })));
        return { demo: false, cadastradas: criadas };
      }
      throw new Error("Envie o texto de uma ata em texto_ata ou uma lista de ações em acoes.");
    },
  },
];
