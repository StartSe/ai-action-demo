// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { DIAS_PERMITIDOS, importarNotas } from "./importacao";
import { gerarLeitura } from "./leitura";
import type { Ferramenta } from "./mcp";
import { definirItem, listar as listarOrcamento } from "./orcamento";
import type { Periodo } from "./types";

export const NOME_SERVIDOR = "custos-ia";

const PERIODOS_VALIDOS: Periodo[] = ["mes", "3meses", "ano"];

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: "gastos_ia",
    descricao: "Devolve o gasto da empresa com ferramentas de IA no período pedido, comparado ao orçamento planejado: total gasto, variação contra o mês anterior, gasto por ferramenta (com aviso de quem estourou o orçamento), gasto por mês e os alertas do período (ferramenta acima do planejado, assinatura nova).",
    schema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: PERIODOS_VALIDOS, description: "\"mes\" (mês atual), \"3meses\" (últimos 3 meses) ou \"ano\" (últimos 12 meses). Padrão: \"mes\"." },
      },
      required: [],
    },
    async executar(args) {
      const { periodo } = args as { periodo?: string };
      const periodoValido: Periodo = PERIODOS_VALIDOS.includes(periodo as Periodo) ? (periodo as Periodo) : "mes";
      const { leitura } = await gerarLeitura(periodoValido);
      return leitura;
    },
  },
  {
    nome: "importar_notas",
    descricao: "Lê as notas e recibos de ferramentas de IA na caixa de e-mail conectada (Gmail) dos últimos N dias e lança as faturas reconhecidas. Exige o Gmail conectado e a inteligência artificial ligada em /setup. Devolve quantas mensagens foram lidas, quantas viraram fatura e os motivos das ignoradas.",
    schema: {
      type: "object",
      properties: {
        dias: { type: "integer", enum: [...DIAS_PERMITIDOS], description: "Quantos dias para trás procurar: 30, 90 ou 365. Padrão: 30." },
      },
      required: [],
    },
    async executar(args) {
      const { dias } = args as { dias?: number };
      // ErroImportacao/ErroGmail sobem como erro da chamada (lib/mcp.ts devolve a mensagem ao assistente).
      return importarNotas(dias ?? 30);
    },
  },
  {
    nome: "definir_orcamento",
    descricao: "Define o orçamento mensal planejado (em reais) de um item — o nome de uma ferramenta, como aparece nas faturas. Substitui o valor se o item já existir; valor 0 remove o item. Devolve a lista completa do orçamento planejado.",
    schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Nome do item, ex.: \"ChatGPT Enterprise\"." },
        valorMensal: { type: "number", minimum: 0, description: "Valor planejado por mês, em reais (BRL)." },
      },
      required: ["item", "valorMensal"],
    },
    async executar(args) {
      const { item, valorMensal } = args as { item?: unknown; valorMensal?: unknown };
      const nome = typeof item === "string" ? item.trim() : "";
      const valor = Number(valorMensal);
      if (!nome) throw new Error("Informe o nome do item do orçamento.");
      if (!Number.isFinite(valor) || valor < 0) throw new Error("Informe o valor mensal planejado em reais (número maior ou igual a zero).");
      return { itens: definirItem(nome, valor), totalMensalBRL: listarOrcamento().reduce((s, i) => s + i.valorMensalBRL, 0) };
    },
  },
];
