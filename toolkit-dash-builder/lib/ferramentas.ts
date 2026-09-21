// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Nenhuma duplica prompt ou lógica: todas chamam as mesmas funções das rotas HTTP (lib/painel.ts, lib/historico.ts).
import { listar, obter } from "./historico";
import type { Ferramenta } from "./mcp";
import { gerarPainel, refinarPainel } from "./painel";
import { enderecoPublico } from "./setup-comum";
import type { EspecPainel, PedidoPainel } from "./types";
import type { Meta } from "./ai";

export const NOME_SERVIDOR = "toolkit-dash-builder";

const link = (id: string) => `${enderecoPublico() ?? ""}/r/${id}`;

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "criar_painel",
    descricao: "Gera um painel de indicadores completo (indicadores, gráficos e tabela, com números de exemplo) a partir de uma descrição em português do que a pessoa quer acompanhar.",
    schema: {
      type: "object",
      properties: {
        descricao: { type: "string", description: "O que o painel deve acompanhar (10 a 1.000 caracteres)" },
        esclarecimentos: { type: "object", description: "Opcional: pergunta -> resposta, para detalhar o pedido", additionalProperties: { type: "string" } },
        guardar: { type: "boolean", description: "Salvar no histórico (padrão: sim)" },
      },
      required: ["descricao"],
    },
    async executar(args) {
      const { descricao, esclarecimentos, guardar = true } = args as { descricao?: string; esclarecimentos?: Record<string, string>; guardar?: boolean };
      if (!descricao || descricao.trim().length < 10) throw new Error("Descreva o painel com pelo menos 10 letras.");
      if (descricao.length > 1000) throw new Error("Descreva o painel em até 1.000 caracteres.");
      const r = await gerarPainel({ descricao, esclarecimentos }, { guardar });
      return { painel: r.painel, id: r.id, link: r.id ? link(r.id) : undefined, demo: r.demo, reaproveitado: r.reaproveitado };
    },
  },
  {
    nome: "refinar_painel",
    descricao: "Ajusta um painel salvo a partir de um pedido em português (trocar um gráfico, acrescentar um indicador, tirar a tabela) e grava o resultado.",
    schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id do painel salvo (devolvido por criar_painel ou listar_paineis)" },
        pedido: { type: "string", description: "O que mudar, em uma frase" },
      },
      required: ["id", "pedido"],
    },
    async executar(args) {
      const { id, pedido } = args as { id?: string; pedido?: string };
      if (!id) throw new Error("Informe o id do painel.");
      if (!pedido || pedido.trim().length < 3) throw new Error("Diga o que você quer mudar no painel.");
      const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
      if (!registro || registro.tipo !== "painel") throw new Error("Este painel não existe mais.");
      const r = await refinarPainel(registro.saida, pedido.trim(), id);
      if ("esclarecimento" in r) return { esclarecimento: r.esclarecimento, demo: r.demo };
      return { painel: r.painel, mensagem: r.mensagem, componentesAlterados: r.componentesAlterados, link: link(id), demo: r.demo };
    },
  },
  {
    nome: "listar_paineis",
    descricao: "Lista os painéis salvos, do mais recente para o mais antigo, com id, título, resumo e data.",
    schema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Quantos painéis devolver (padrão 10, máximo 50)" },
      },
    },
    async executar(args) {
      const { limite = 10 } = args as { limite?: number };
      const n = Math.max(1, Math.min(50, Math.floor(Number(limite) || 10)));
      // listar() devolve todos os tipos; filtra "painel" e pede uma margem para o limite valer depois do filtro.
      const itens = listar(n * 3).filter((r) => r.tipo === "painel").slice(0, n);
      return { paineis: itens.map((r) => ({ id: r.id, titulo: r.titulo, resumo: r.resumo, criadoEm: r.criadoEm, link: link(r.id) })) };
    },
  },
  {
    nome: "obter_painel",
    descricao: "Devolve a especificação completa de um painel salvo, o pedido original e o link para abri-lo no app.",
    schema: {
      type: "object",
      properties: { id: { type: "string", description: "Id do painel salvo" } },
      required: ["id"],
    },
    async executar(args) {
      const { id } = args as { id?: string };
      if (!id) throw new Error("Informe o id do painel.");
      const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
      if (!registro || registro.tipo !== "painel") throw new Error("Este painel não existe mais.");
      return { painel: registro.saida, pedido: registro.entrada, meta: registro.meta, criadoEm: registro.criadoEm, link: link(id) };
    },
  },
];
