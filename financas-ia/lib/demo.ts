// Respostas de exemplo usadas quando não há chave de IA configurada.
// Usam os números reais do resumo recebido para parecer uma leitura genuína.
import type { Destaque, Insights, Resumo } from "./types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

function maiorCategoria(resumo: Partial<Resumo>) {
  return (resumo.categorias || [])[0] || { categoria: "Fornecedores", total: 0 };
}

export function insightsDemo(resumo: Partial<Resumo> = {}): Insights {
  const total = resumo.total || 0;
  const maior = maiorCategoria(resumo);
  const variacao = typeof resumo.variacaoUltimoMes === "number" ? resumo.variacaoUltimoMes : 0;
  const maiorLancamento = (resumo.maioresLancamentos || [])[0];
  const cresceuMais = (resumo.categoriasQueCresceram || [])[0];
  const participacao = total > 0 ? (maior.total / total) * 100 : 0;

  const destaques: Destaque[] = [
    {
      titulo: `${maior.categoria} concentra o orçamento`,
      detalhe: `${maior.categoria} responde por ${moeda.format(maior.total)} (${participacao.toFixed(0)}% do total do período).`,
      tipo: participacao >= 40 ? "alerta" : "neutro",
    },
    {
      titulo: variacao >= 0 ? "Despesas em alta no último mês" : "Despesas em queda no último mês",
      detalhe: `O último mês fechou ${pct(variacao)} em relação ao mês anterior.`,
      tipo: variacao > 10 ? "alerta" : variacao < 0 ? "oportunidade" : "neutro",
    },
  ];
  if (cresceuMais) {
    destaques.push({
      titulo: `${cresceuMais.categoria} é a categoria que mais cresceu`,
      detalhe: `${cresceuMais.categoria} variou ${pct(cresceuMais.variacao)} entre os dois últimos meses com dados.`,
      tipo: cresceuMais.variacao > 0 ? "alerta" : "oportunidade",
    });
  }
  if (maiorLancamento) {
    destaques.push({
      titulo: "Maior lançamento do período",
      detalhe: `${maiorLancamento.descricao || maiorLancamento.categoria}: ${moeda.format(maiorLancamento.valor)}.`,
      tipo: "neutro",
    });
  }

  return {
    leitura_geral: `No período analisado, o total de despesas foi ${moeda.format(total)}, com ${maior.categoria} como a categoria de maior peso. O último mês fechou com variação de ${pct(variacao)} frente ao anterior${cresceuMais ? `, puxado principalmente por ${cresceuMais.categoria}` : ""}. Vale olhar de perto os itens de maior valor antes de fechar o mês.`,
    destaques: destaques.slice(0, 4),
    perguntas_sugeridas: [
      `Por que ${maior.categoria.toLowerCase()} é a maior categoria de despesa?`,
      "Quais lançamentos puxaram o aumento do último mês?",
      "Existe algum fornecedor ou categoria para renegociar?",
    ],
  };
}

export function perguntarDemo({ resumo = {}, pergunta = "" }: { resumo?: Partial<Resumo>; pergunta?: string } = {}): string {
  const total = resumo.total || 0;
  const maior = maiorCategoria(resumo);
  const variacao = typeof resumo.variacaoUltimoMes === "number" ? resumo.variacaoUltimoMes : 0;
  const mediaMensal = resumo.mediaMensal || 0;

  return `Modo demonstração: sem uma chave de IA configurada, esta é uma resposta de exemplo construída com os números já calculados no seu navegador.

No período carregado, o total de despesas foi ${moeda.format(total)}, com média mensal de ${moeda.format(mediaMensal)}. A categoria de maior peso é ${maior.categoria}, com ${moeda.format(maior.total)}, e o último mês variou ${pct(variacao)} em relação ao anterior.

Sobre "${pergunta}": para uma resposta calculada especificamente a partir da sua pergunta, configure a variável OPENROUTER_API_KEY. Com a IA conectada, a resposta usa também a amostra de lançamentos enviada, não só os totais.`;
}
