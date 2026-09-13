// Recebimento da planilha do mês por link público (US-066): reaproveita a infraestrutura genérica
// de lib/formularios.ts. Próprio deste app (não copiado para os outros 9): nenhum outro app lê CSV.
// O CSV nunca é persistido: só o resumo agregado (e a leitura da IA sobre ele) vai para o histórico.
import { calcularResumo, formatarMoeda, normalizarRegistros } from "@/lib/analise";
import { parseCSV, sugerirMapeamento } from "@/lib/csv";
import { gerarInsights } from "@/lib/insights";
import { salvar } from "@/lib/historico";
import type { EntradaInsights, Mapeamento, SaidaInsights } from "@/lib/types";
import { criar, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";

export const TIPO_PLANILHA_MENSAL = "planilha-mensal-csv";

export const CAMPOS_PLANILHA_MENSAL: CampoFormulario[] = [
  { chave: "planilha", rotulo: "Planilha do mês (CSV)", tipo: "arquivo", obrigatorio: true, aceitar: ".csv,text/csv" },
];

/** Cria (uma única vez por instância do app) o link público de envio da planilha mensal. */
export function criarLinkPlanilhaMensal(): string {
  const parametros: ParametrosPublicos = {
    marca: "F",
    nome: "Analista Financeiro",
    titulo: "Enviar a planilha do mês",
    descricao: "Envie o CSV de despesas do mês. O arquivo é processado na hora e descartado: só os totais ficam guardados.",
  };
  return criar({ tipo: TIPO_PLANILHA_MENSAL, campos: CAMPOS_PLANILHA_MENSAL, parametros });
}

registrarCallback(TIPO_PLANILHA_MENSAL, async ({ dados }) => {
  const csv = (dados.planilha || "").trim();
  if (!csv) throw new Error("O CSV enviado veio vazio.");

  const { cabecalho, linhas } = parseCSV(csv);
  if (!cabecalho.length || !linhas.length) throw new Error("Não foi possível ler linhas nesse CSV.");

  const mapeamento: Mapeamento = sugerirMapeamento(cabecalho, linhas);
  if (mapeamento.data < 0 || mapeamento.valor < 0) throw new Error("Não foi possível identificar as colunas de data e valor nesse CSV.");

  const registros = normalizarRegistros(linhas, mapeamento);
  if (!registros.length) throw new Error("Não encontramos lançamentos válidos (com data e valor) nesse CSV.");

  const resumo = calcularResumo(registros);
  const { insights, meta: metaGerada } = await gerarInsights(resumo);

  const resultadoId = salvar({
    tipo: "financas",
    titulo: `Planilha recebida por link · ${formatarMoeda(resumo.total)}`,
    entrada: { nomeArquivo: "planilha-recebida-por-link.csv" } satisfies EntradaInsights,
    saida: { resumo, insights } satisfies SaidaInsights,
    meta: metaGerada,
    expiraEmDias: 30,
  });
  return { resultadoId };
});
