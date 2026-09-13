// Ferramentas expostas via app/mcp/route.ts para assistentes de IA (Claude, ChatGPT etc.).
// Cada app da suíte declara as suas aqui, reaproveitando a mesma lógica das rotas normais.
import { calcularResumo, normalizarRegistros } from "./analise";
import { parseCSV, sugerirMapeamento } from "./csv";
import { guardarLeitura, obterLeitura } from "./estado";
import { gerarInsights } from "./insights";
import type { Ferramenta } from "./mcp";
import { responderPergunta } from "./perguntar";
import type { LancamentoResumo, Mapeamento } from "./types";

export const NOME_SERVIDOR = "financas-ia";

type NomeColuna = "data" | "categoria" | "valor" | "descricao";

const FERRAMENTA_LER_PLANILHA: Ferramenta = {
  nome: "ler_planilha",
  descricao:
    "Lê uma planilha de despesas em CSV (texto separado por vírgula, ponto e vírgula ou tabulação) e devolve uma leitura executiva: total do período, variação do último mês, destaques e um identificador de leitura para fazer perguntas sobre esses números com a ferramenta perguntar.",
  schema: {
    type: "object",
    properties: {
      csv: { type: "string", description: "Conteúdo do arquivo CSV, incluindo a linha de cabeçalho" },
      colunas: {
        type: "object",
        description: "Nomes exatos das colunas do cabeçalho (opcional; sem isso o app tenta adivinhar pelo conteúdo)",
        properties: {
          data: { type: "string" },
          categoria: { type: "string" },
          valor: { type: "string" },
          descricao: { type: "string" },
        },
      },
    },
    required: ["csv"],
  },
  async executar(args) {
    const csv = String(args.csv || "").trim();
    if (!csv) throw new Error("Envie o conteúdo do CSV.");
    const { cabecalho, linhas } = parseCSV(csv);
    if (!cabecalho.length || !linhas.length) throw new Error("Não foi possível ler linhas nesse CSV.");

    const colunasArg = (args.colunas as Partial<Record<NomeColuna, string>>) || {};
    const auto = sugerirMapeamento(cabecalho, linhas);
    const indiceDe = (nome?: string) => (nome ? cabecalho.findIndex((h) => h.toLowerCase() === nome.toLowerCase()) : -1);
    const mapeamento: Mapeamento = {
      data: colunasArg.data ? indiceDe(colunasArg.data) : auto.data,
      categoria: colunasArg.categoria ? indiceDe(colunasArg.categoria) : auto.categoria,
      valor: colunasArg.valor ? indiceDe(colunasArg.valor) : auto.valor,
      descricao: colunasArg.descricao ? indiceDe(colunasArg.descricao) : auto.descricao,
    };
    if (mapeamento.data < 0 || mapeamento.valor < 0) {
      throw new Error("Não foi possível identificar as colunas de data e valor. Informe 'colunas' com os nomes exatos do cabeçalho.");
    }

    const registros = normalizarRegistros(linhas, mapeamento);
    if (!registros.length) throw new Error("Não encontramos lançamentos válidos (com data e valor) nesse CSV.");

    const resumo = calcularResumo(registros);
    const { insights } = await gerarInsights(resumo);
    const amostra: LancamentoResumo[] = registros.slice(0, 60).map((r) => ({
      data: r.data.toISOString().slice(0, 10),
      categoria: r.categoria,
      descricao: r.descricao,
      valor: r.valor,
    }));
    const id_leitura = guardarLeitura({ resumo, amostra });
    return { id_leitura, resumo, insights };
  },
};

const FERRAMENTA_PERGUNTAR: Ferramenta = {
  nome: "perguntar",
  descricao: "Responde uma pergunta sobre os números de uma planilha já lida com a ferramenta ler_planilha, usando o identificador de leitura devolvido por ela.",
  schema: {
    type: "object",
    properties: {
      id_leitura: { type: "string", description: "Identificador de leitura devolvido por ler_planilha" },
      pergunta: { type: "string", description: "Pergunta sobre os números da planilha" },
    },
    required: ["id_leitura", "pergunta"],
  },
  async executar(args) {
    const idLeitura = String(args.id_leitura || "").trim();
    const pergunta = String(args.pergunta || "").trim();
    if (!idLeitura || !pergunta) throw new Error("Informe id_leitura e a pergunta.");
    const leitura = obterLeitura(idLeitura);
    if (!leitura) throw new Error("Essa leitura expirou ou não existe. Use ler_planilha de novo.");
    const { resposta } = await responderPergunta({ resumo: leitura.resumo, amostra: leitura.amostra, pergunta });
    return { resposta };
  },
};

export const FERRAMENTAS: Ferramenta[] = [FERRAMENTA_LER_PLANILHA, FERRAMENTA_PERGUNTAR];
