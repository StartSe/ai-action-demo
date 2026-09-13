// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { formatarMoeda } from "./analise";
import { listar as listarHistorico, obter } from "./historico";
import { getOrcamento, orcamentoDaCategoria } from "./orcamento";
import { registrarExecutor } from "./rotinas";
import type { SaidaInsights } from "./types";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-mensal", rotulo: "Resumo mensal da planilha" }];

registrarExecutor("resumo-mensal", async () => {
  const titulo = "Resumo mensal do Analista Financeiro";
  const ultima = listarHistorico(50).find((r) => r.tipo === "financas");
  if (!ultima) {
    return { titulo, texto: "Nenhuma planilha foi recebida ainda. Envie a planilha do mês pelo link para gerar o próximo resumo." };
  }

  const registro = obter<unknown, SaidaInsights, unknown>(ultima.id);
  if (!registro) {
    return { titulo, texto: "Não foi possível carregar o último resumo recebido." };
  }

  const { resumo } = registro.saida;
  const maiorCategoria = resumo.categoriasQueCresceram[0];
  const maiorLancamento = resumo.maioresLancamentos[0];

  const linhaTotal = `Total do período: ${formatarMoeda(resumo.total)}.`;
  const linhaVariacao =
    resumo.variacaoUltimoMes === 0
      ? "Sem variação relevante no último mês."
      : `Variação do último mês: ${resumo.variacaoUltimoMes > 0 ? "alta" : "queda"} de ${Math.abs(resumo.variacaoUltimoMes).toFixed(1)}%.`;
  const linhaCategoria = maiorCategoria
    ? `Categoria com maior variação: ${maiorCategoria.categoria} (${maiorCategoria.variacao > 0 ? "+" : ""}${maiorCategoria.variacao.toFixed(0)}%).`
    : "Nenhuma categoria com variação relevante entre os dois últimos meses.";
  const linhaLancamento = maiorLancamento
    ? `Maior lançamento: ${formatarMoeda(maiorLancamento.valor)} em ${maiorLancamento.categoria}${maiorLancamento.descricao ? ` (${maiorLancamento.descricao})` : ""}.`
    : "Nenhum lançamento identificado no período.";
  const linhaAlerta =
    Math.abs(resumo.variacaoUltimoMes) > 20
      ? "Alerta: o total do mês variou mais de 20% em relação ao mês anterior."
      : maiorCategoria && Math.abs(maiorCategoria.variacao) > 50
        ? `Alerta: a categoria "${maiorCategoria.categoria}" variou mais de 50% entre os dois últimos meses.`
        : "Nenhum alerta neste período.";

  const orcamento = getOrcamento();
  const mesesNoPeriodo = Math.max(resumo.meses.length, 1);
  const estouros = resumo.categorias
    .map((c) => {
      const orcadoMensal = orcamentoDaCategoria(orcamento, c.categoria);
      const orcadoPeriodo = orcadoMensal !== undefined ? orcadoMensal * mesesNoPeriodo : undefined;
      return { categoria: c.categoria, total: c.total, orcadoPeriodo };
    })
    .filter((c) => c.orcadoPeriodo !== undefined && c.total > c.orcadoPeriodo!);
  const linhaOrcamento = orcamento.length
    ? estouros.length
      ? `Estouraram o orçamento: ${estouros.map((c) => `${c.categoria} (${formatarMoeda(c.total)} de ${formatarMoeda(c.orcadoPeriodo!)})`).join(", ")}.`
      : "Nenhuma categoria estourou o orçamento neste período."
    : null;

  const texto = [linhaTotal, linhaVariacao, linhaCategoria, linhaLancamento, linhaAlerta, linhaOrcamento]
    .filter((l): l is string => Boolean(l))
    .join("\n");
  return { titulo, texto, resultadoId: ultima.id };
});
