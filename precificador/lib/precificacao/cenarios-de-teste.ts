// Cenários montados à mão usados pelos testes do motor. Fora de *.test.ts para os arquivos de teste
// ficarem só com as asserções, e porque mais de um teste usa a mesma padaria.
import type { CanalVenda, Item, LinhaCustoFixo, LinhaInsumo, Negocio } from "./tipos";

export function negocio(ajustes: Partial<Negocio> = {}): Negocio {
  return {
    id: "n1",
    nome: "Padaria da esquina",
    regime: "simples",
    impostoProdutoPct: 0.06,
    impostoServicoPct: 0.06,
    modoCapacidade: "unidades",
    volumeMensalUnidades: 2000,
    horasProdutivasMes: 160,
    proLaboreMensal: 4000,
    margemAlvoPadraoPct: 0.2,
    proporcaoProdutoPct: 0.5,
    criadoEm: "2026-09-21T00:00:00.000Z",
    ...ajustes,
  };
}

export function fixo(nome: string, valorMensal: number, balde: LinhaCustoFixo["balde"] = "produto"): LinhaCustoFixo {
  return { id: `f-${nome}`, negocioId: "n1", nome, valorMensal, balde };
}

export function canal(ajustes: Partial<CanalVenda> = {}): CanalVenda {
  return { id: "c1", negocioId: "n1", nome: "Loja", taxaPct: 0, taxaFixa: 0, padrao: true, ...ajustes };
}

export function item(ajustes: Partial<Item> = {}): Item {
  return {
    id: "i1",
    negocioId: "n1",
    nome: "Pão de forma",
    tipo: "produto",
    tempoMinutos: 0,
    perdaPct: 0,
    precosConcorrentes: [],
    criadoEm: "2026-09-21T00:00:00.000Z",
    ...ajustes,
  };
}

export function insumo(ajustes: Partial<LinhaInsumo> = {}): LinhaInsumo {
  return {
    id: "l1",
    itemId: "i1",
    nome: "Farinha",
    qtdUsada: 120,
    unidadeUso: "g",
    qtdCompra: 1,
    custoCompra: 40,
    unidadeCompra: "kg",
    ...ajustes,
  };
}

/** Comparação de dinheiro: duas casas bastam e evitam falso negativo de ponto flutuante. */
export function reais(n: number): number {
  return Math.round(n * 100) / 100;
}
