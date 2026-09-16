// Tipos de rotina deste app: cada um sabe gerar o resultado entregue por notificação (lib/rotinas.ts).
// Ao contrário de lib/rotinas.ts, este arquivo NÃO é copiado sem alterar entre apps — cada app registra
// aqui o que faz sentido rodar sozinho, chamando registrarExecutor (ver pdi-time/lib/rotinas-do-app.ts).
import { calcularResumo, formatarMoeda, normalizarRegistros } from "./analise";
import { parseCSV, sugerirMapeamento } from "./csv";
import { ErroFonte, fonteDadosConfigurada, lerFonteDados } from "./fonte-dados-mcp";
import { listar as listarHistorico, obter, salvar } from "./historico";
import { gerarInsights } from "./insights";
import { getOrcamento, orcamentoDaCategoria } from "./orcamento";
import { registrarExecutor } from "./rotinas";
import type { EntradaInsights, Resumo, SaidaInsights } from "./types";

export const TIPOS_ROTINA: { tipo: string; rotulo: string }[] = [{ tipo: "resumo-mensal", rotulo: "Resumo mensal da planilha" }];

/** Lê a fonte de dados conectada (US-077), monta o resumo agregado e salva como um resultado novo. Só o resumo (nunca o CSV bruto) vai para a IA e para o histórico. */
async function lerResumoDaFonteConectada(): Promise<{ resumo: Resumo; resultadoId?: string }> {
  const csv = await lerFonteDados();
  const { cabecalho, linhas } = parseCSV(csv);
  if (!cabecalho.length || !linhas.length) throw new ErroFonte("sem_planilha", "A fonte conectada não devolveu nenhuma linha. Confira em Configurações qual leitura usar.", 502);
  const mapeamento = sugerirMapeamento(cabecalho, linhas);
  if (mapeamento.data < 0 || mapeamento.valor < 0) throw new ErroFonte("sem_planilha", "Não identificamos as colunas de data e valor na fonte conectada. Confira em Configurações qual leitura usar.", 502);
  const registros = normalizarRegistros(linhas, mapeamento);
  if (!registros.length) throw new ErroFonte("sem_planilha", "A fonte conectada não trouxe nenhum lançamento com data e valor. Confira em Configurações qual leitura usar.", 502);

  const resumo = calcularResumo(registros);
  const { insights, meta: metaGerada } = await gerarInsights(resumo);
  const resultadoId = salvar({
    tipo: "financas",
    titulo: `Leitura automática da fonte conectada · ${formatarMoeda(resumo.total)}`,
    entrada: { nomeArquivo: "fonte-conectada.csv" } satisfies EntradaInsights,
    saida: { resumo, insights } satisfies SaidaInsights,
    meta: metaGerada,
    expiraEmDias: 30,
  });
  return { resumo, resultadoId };
}

registrarExecutor("resumo-mensal", async () => {
  const titulo = "Resumo mensal do Analista Financeiro";

  let resumo: Resumo;
  let resultadoId: string | undefined;

  if (fonteDadosConfigurada()) {
    try {
      ({ resumo, resultadoId } = await lerResumoDaFonteConectada());
    } catch (err) {
      // A frase de ErroFonte já é a frase certa para quem lê o aviso (lib/fonte-dados-mcp.ts); embrulhá-la
      // em outra repetiria "a fonte de dados" duas vezes na mesma linha. O que não é ErroFonte não chega à tela.
      if (err instanceof ErroFonte) return { titulo, texto: err.message };
      console.error("Falha ao ler a fonte de dados na rotina mensal:", err);
      return { titulo, texto: "Não foi possível ler a fonte de dados conectada neste mês. Confira o endereço em Configurações." };
    }
  } else {
    const ultima = listarHistorico(50).find((r) => r.tipo === "financas");
    if (!ultima) {
      return { titulo, texto: "Nenhuma planilha foi recebida ainda. Envie a planilha do mês pelo link para gerar o próximo resumo." };
    }
    const registro = obter<unknown, SaidaInsights, unknown>(ultima.id);
    if (!registro) {
      return { titulo, texto: "Não foi possível carregar o último resumo recebido." };
    }
    resumo = registro.saida.resumo;
    resultadoId = ultima.id;
  }

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
  return { titulo, texto, resultadoId };
});
