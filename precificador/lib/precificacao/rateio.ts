// Custo fixo do negócio distribuído por unidade vendida ou por hora trabalhada, e a alíquota do
// regime. Puro, sem node:*.
//
// Uma decisão de modelagem que o PRD deixou ambígua e aqui fica explícita: o "custo-hora" que a tela
// mostra é (fixos de serviço + pró-labore) ÷ horas produtivas, mas ele entra na conta em DUAS
// parcelas diferentes, nunca duas vezes:
//
//   - a parte do pró-labore é mão de obra e entra no CUSTO DIRETO (varia com o tempo gasto na peça);
//   - a parte dos custos fixos entra no RATEIO FIXO (é absorção, não consumo).
//
// Somadas, as duas dão exatamente o custo-hora mostrado — que é o número conferido contra a planilha.
import type { Balde, LinhaCustoFixo, Negocio, TipoItem } from "./tipos";

/** Quanto de uma linha marcada "ambos" cai no balde de produto, em fração. */
function fatiaProduto(negocio: Negocio, balde: Balde): number {
  if (balde === "produto") return 1;
  if (balde === "servico") return 0;
  if (negocio.modoCapacidade === "unidades") return 1;
  if (negocio.modoCapacidade === "horas") return 0;
  return Math.min(1, Math.max(0, negocio.proporcaoProdutoPct));
}

export type FixosPorBalde = { produto: number; servico: number; total: number };

/** Soma mensal dos custos fixos em cada balde, já com as linhas "ambos" repartidas. */
export function fixosPorBalde(negocio: Negocio, linhas: LinhaCustoFixo[]): FixosPorBalde {
  let produto = 0;
  let servico = 0;
  for (const linha of linhas) {
    const valor = Number(linha.valorMensal) || 0;
    const fatia = fatiaProduto(negocio, linha.balde);
    produto += valor * fatia;
    servico += valor * (1 - fatia);
  }
  return { produto, servico, total: produto + servico };
}

export type CustoHora = {
  /** Pró-labore por hora produtiva: mão de obra, entra no custo direto. */
  maoDeObra: number;
  /** Custos fixos do balde de serviço por hora produtiva: absorção, entra no rateio. */
  fixo: number;
  /** A soma — o número que a tela chama de "custo da sua hora" e que a planilha confere. */
  total: number;
};

/** Custo de uma hora produtiva. Sem horas declaradas, tudo é zero em vez de dividir por zero. */
export function custoHora(negocio: Negocio, linhas: LinhaCustoFixo[]): CustoHora {
  const horas = Number(negocio.horasProdutivasMes) || 0;
  if (horas <= 0) return { maoDeObra: 0, fixo: 0, total: 0 };
  const maoDeObra = (Number(negocio.proLaboreMensal) || 0) / horas;
  const fixo = fixosPorBalde(negocio, linhas).servico / horas;
  return { maoDeObra, fixo, total: maoDeObra + fixo };
}

/**
 * Custo fixo absorvido por uma unidade do item.
 *   - produto: fixos do balde de produto ÷ volume mensal;
 *   - serviço: horas gastas × (fixos do balde de serviço ÷ horas produtivas).
 * Capacidade não declarada devolve zero: o app avisa na tela em vez de inventar um rateio.
 */
export function rateioFixoPorUnidade(negocio: Negocio, linhas: LinhaCustoFixo[], tipo: TipoItem, tempoMinutos: number): number {
  const fixos = fixosPorBalde(negocio, linhas);
  if (tipo === "produto") {
    const volume = Number(negocio.volumeMensalUnidades) || 0;
    return volume > 0 ? fixos.produto / volume : 0;
  }
  return ((Number(tempoMinutos) || 0) / 60) * custoHora(negocio, linhas).fixo;
}

/** Os fixos que o ponto de equilíbrio do item precisa cobrir: o balde dele. */
export function fixosDoBalde(negocio: Negocio, linhas: LinhaCustoFixo[], tipo: TipoItem): number {
  const fixos = fixosPorBalde(negocio, linhas);
  return tipo === "produto" ? fixos.produto : fixos.servico;
}

/** Alíquota efetiva sobre a venda deste tipo de item, em fração. MEI é sempre zero: o DAS é uma
 * linha de custo fixo, não um percentual sobre o faturamento. */
export function impostoPct(negocio: Negocio, tipo: TipoItem): number {
  if (negocio.regime === "mei") return 0;
  const bruto = tipo === "produto" ? negocio.impostoProdutoPct : negocio.impostoServicoPct;
  return Math.min(1, Math.max(0, Number(bruto) || 0));
}

/** Tudo o que sai como percentual do preço de venda: imposto do regime mais taxa do canal. */
export function taxaTotalPct(negocio: Negocio, tipo: TipoItem, taxaCanalPct: number): number {
  return impostoPct(negocio, tipo) + Math.max(0, Number(taxaCanalPct) || 0);
}
