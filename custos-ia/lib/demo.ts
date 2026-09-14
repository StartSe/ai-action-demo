// Dados de exemplo usados quando não há nenhuma fatura gravada (lib/faturas.ts vazio). Doze meses de
// faturas fictícias de ferramentas de IA reais do mercado, terminando no mês atual, com um orçamento
// planejado, dois meses que estouram esse orçamento (ver FERRAMENTAS_DEMO, mês -1 e mês 0 abaixo) e uma
// assinatura que só aparece no mês atual (alerta "Assinatura nova").
import { CAMBIO_EUR_BRL_PADRAO, CAMBIO_USD_BRL_PADRAO } from "./integracoes";
import type { Fatura, Orcamento } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

type FerramentaDemo = {
  fornecedor: string;
  ferramenta: string;
  categoria: string;
  moeda: Fatura["moeda"];
  /** Valor de referência, na moeda da fatura; varia um pouco mês a mês por um fator determinístico. */
  base: number;
  /** Índice do mês (0 = mês atual, 1 = mês anterior, ...) em que esta ferramenta estoura o orçamento planejado, se houver. */
  mesEstouro?: number;
  /** Valor (na moeda da fatura) usado só no mês do estouro. */
  valorEstouro?: number;
  /** Índice do primeiro mês com fatura (0 = só o mês atual): simula uma assinatura contratada há pouco. */
  mesInicio?: number;
};

const FERRAMENTAS_DEMO: FerramentaDemo[] = [
  { fornecedor: "OpenAI", ferramenta: "ChatGPT Enterprise", categoria: "Assistente de texto", moeda: "USD", base: 640, mesEstouro: 1, valorEstouro: 980 },
  { fornecedor: "Anthropic", ferramenta: "Claude for Work", categoria: "Assistente de texto", moeda: "USD", base: 420 },
  { fornecedor: "GitHub", ferramenta: "GitHub Copilot Business", categoria: "Código", moeda: "USD", base: 228 },
  { fornecedor: "Midjourney", ferramenta: "Midjourney Pro", categoria: "Imagem", moeda: "USD", base: 96, mesEstouro: 0, valorEstouro: 165 },
  { fornecedor: "ElevenLabs", ferramenta: "ElevenLabs Voice", categoria: "Voz", moeda: "USD", base: 99 },
  { fornecedor: "Notion", ferramenta: "Notion AI", categoria: "Produtividade", moeda: "BRL", base: 850 },
  // Sem item no orçamento e só no mês atual: rende o alerta "Assinatura nova" do exemplo.
  { fornecedor: "Anysphere", ferramenta: "Cursor Business", categoria: "Código", moeda: "USD", base: 320, mesInicio: 0 },
];

/** Orçamento planejado de exemplo (mostrado só quando não há orçamento cadastrado de verdade). */
export function orcamentoDemo(): Orcamento[] {
  // Cada valor fica um pouco acima do gasto normal da ferramenta (base × câmbio, com a variação de ±4%),
  // para só os meses de estouro (mesEstouro em FERRAMENTAS_DEMO) dispararem "Acima do planejado".
  return [
    { item: "ChatGPT Enterprise", valorMensalBRL: 3700 },
    { item: "Claude for Work", valorMensalBRL: 2400 },
    { item: "GitHub Copilot Business", valorMensalBRL: 1300 },
    { item: "Midjourney Pro", valorMensalBRL: 560 },
    { item: "ElevenLabs Voice", valorMensalBRL: 600 },
    { item: "Notion AI", valorMensalBRL: 900 },
  ];
}

function cotacao(moeda: Fatura["moeda"]): number {
  return moeda === "USD" ? CAMBIO_USD_BRL_PADRAO : moeda === "EUR" ? CAMBIO_EUR_BRL_PADRAO : 1;
}

/** Doze meses de faturas fictícias (uma por ferramenta por mês, salvo as com `mesInicio`), terminando no mês atual (índice 0). */
export function faturasDemo(referencia = new Date()): Fatura[] {
  const faturas: Fatura[] = [];
  for (let indiceMes = 11; indiceMes >= 0; indiceMes--) {
    const dataMes = new Date(referencia.getFullYear(), referencia.getMonth() - indiceMes, 5);
    const aaaaMm = `${dataMes.getFullYear()}-${String(dataMes.getMonth() + 1).padStart(2, "0")}`;
    for (const f of FERRAMENTAS_DEMO) {
      if (f.mesInicio !== undefined && indiceMes > f.mesInicio) continue;
      // Variação leve e determinística (sem Math.random) para o gráfico não ficar com barras idênticas.
      const variacao = 1 + (((indiceMes * 7 + f.ferramenta.length) % 5) - 2) * 0.02;
      const valor = f.mesEstouro === indiceMes && f.valorEstouro ? f.valorEstouro : arredondar(f.base * variacao);
      faturas.push({
        id: `demo-${f.ferramenta}-${aaaaMm}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        fornecedor: f.fornecedor,
        ferramenta: f.ferramenta,
        categoria: f.categoria,
        valor,
        moeda: f.moeda,
        valorBRL: arredondar(valor * cotacao(f.moeda)),
        data: `${aaaaMm}-05`,
        periodicidade: "mensal",
        origem: "email",
        referencia: `Fatura ${aaaaMm}`,
        criadoEm: dataMes.toISOString(),
      });
    }
  }
  return faturas;
}
