// Leitura do gasto com IA de um período (mês atual, últimos 3 meses ou último ano): combina as
// faturas reais (lib/faturas.ts) com o orçamento planejado (lib/orcamento.ts). Cada lado tem um
// fallback independente para lib/demo.ts (faturas quando !existeAlguma(), orçamento quando a lista
// cadastrada está vazia) — quando cai no demo, os dados de exemplo são tratados como se fossem os
// dados reais do período pedido. Reaproveitada pela rota HTTP (app/api/leitura) e pela ferramenta
// MCP (lib/ferramentas.ts), para não duplicar o cálculo. Todo agregado é calculado aqui, no
// servidor — nunca delegado a IA (não há IA nesta história).
import { meta, type Meta } from "./ai";
import { esperar, faturasDemo, orcamentoDemo } from "./demo";
import { existeAlguma, inicioPeriodo, listarUltimosMeses, mesesDoPeriodo } from "./faturas";
import { salvar } from "./historico";
import { listar as listarOrcamento, orcamentoDoItem, totalMensal } from "./orcamento";
import type { DadosLeitura, Fatura, GastoPorFerramenta, GastoPorMes, Leitura, Orcamento, Periodo } from "./types";

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function rotuloMes(aaaaMm: string): string {
  const [ano, mes] = aaaaMm.split("-").map(Number);
  return `${MESES_PT[mes - 1]} de ${ano}`;
}

/** Chave AAAA-MM do mês `offset` meses antes de `referencia` (0 = o próprio mês de referência). */
function chaveMes(referencia: Date, offset: number): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth() - offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type SaidaLeitura = { leitura: Leitura; faturas: Fatura[] };

/** Monta a Leitura de um período, salva no histórico (tipo "leitura") e devolve tudo o que a tela
 * precisa: o agregado, as faturas do período (para a tabela) e a proveniência (Origem). */
export async function gerarLeitura(periodo: Periodo, referencia = new Date()): Promise<{ demo: boolean; leitura: Leitura; faturas: Fatura[]; meta: Meta; id: string }> {
  const meses = mesesDoPeriodo(periodo);
  const janela = meses + 1; // 1 mês extra só para calcular a variação do mês mais recente

  const usouDemoFaturas = !existeAlguma();
  const desdeJanela = inicioPeriodo(janela, referencia);
  const faturasJanela = usouDemoFaturas
    ? faturasDemo(referencia).filter((f) => f.data >= desdeJanela)
    : listarUltimosMeses(janela, referencia);

  const orcamentoReal = listarOrcamento();
  const usouDemoOrcamento = orcamentoReal.length === 0;
  const itensOrcamento: Orcamento[] = usouDemoOrcamento ? orcamentoDemo() : orcamentoReal;

  const desdePeriodo = inicioPeriodo(meses, referencia);
  const faturasPeriodo = faturasJanela.filter((f) => f.data >= desdePeriodo).sort((a, b) => (a.data < b.data ? 1 : -1));

  const totalBRL = arredondar(faturasPeriodo.reduce((s, f) => s + f.valorBRL, 0));
  const planejadoMensal = totalMensal(itensOrcamento);
  const planejadoBRL = arredondar(planejadoMensal * meses);

  // Agrupa por mês (AAAA-MM) dentro da janela inteira (inclui o mês extra, só para a variação).
  const porMesMapa = new Map<string, number>();
  for (const f of faturasJanela) {
    const chave = f.data.slice(0, 7);
    porMesMapa.set(chave, arredondar((porMesMapa.get(chave) || 0) + f.valorBRL));
  }

  const porMes: GastoPorMes[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const chave = chaveMes(referencia, i);
    porMes.push({ mes: chave, rotulo: rotuloMes(chave), gastoBRL: porMesMapa.get(chave) || 0, planejadoBRL: arredondar(planejadoMensal) });
  }

  const chaveAtual = chaveMes(referencia, 0);
  const chaveAnterior = chaveMes(referencia, 1);
  const valorAtual = porMesMapa.get(chaveAtual) || 0;
  const valorAnterior = porMesMapa.get(chaveAnterior) || 0;
  const variacaoMesAnterior = valorAnterior > 0 ? arredondar(((valorAtual - valorAnterior) / valorAnterior) * 100) : valorAtual > 0 ? 100 : 0;

  const porFerramentaMapa = new Map<string, number>();
  for (const f of faturasPeriodo) {
    porFerramentaMapa.set(f.ferramenta, arredondar((porFerramentaMapa.get(f.ferramenta) || 0) + f.valorBRL));
  }
  const porFerramenta: GastoPorFerramenta[] = [...porFerramentaMapa.entries()]
    .map(([ferramenta, totalFerramenta]) => {
      const orcadoMensal = orcamentoDoItem(itensOrcamento, ferramenta);
      const orcadoPeriodo = orcadoMensal !== undefined ? orcadoMensal * meses : undefined;
      return { ferramenta, totalBRL: totalFerramenta, acimaDoPlanejado: orcadoPeriodo !== undefined && totalFerramenta > orcadoPeriodo };
    })
    .sort((a, b) => b.totalBRL - a.totalBRL);

  const leitura: Leitura = {
    mesAtual: rotuloMes(chaveAtual),
    totalBRL,
    planejadoBRL,
    variacaoMesAnterior,
    porFerramenta,
    porMes,
    alertas: [],
  };

  const demoGeral = usouDemoFaturas || usouDemoOrcamento;
  if (demoGeral) await esperar(700);

  const metaGerada = meta({ demo: demoGeral, insumo: "faturas e orçamento planejado do período" });
  const id = salvar({
    tipo: "leitura",
    titulo: `Gasto com IA de ${leitura.mesAtual}`,
    entrada: { periodo } satisfies DadosLeitura,
    saida: { leitura, faturas: faturasPeriodo } satisfies SaidaLeitura,
    meta: metaGerada,
  });

  return { demo: demoGeral, leitura, faturas: faturasPeriodo, meta: metaGerada, id };
}
