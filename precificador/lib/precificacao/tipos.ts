// Modelo de domínio do Precificador, puro: nenhum import de node:* e nenhuma função com efeito.
// Existe para ser importado dos dois lados — por Client Components (a Bancada recalcula ao digitar,
// sem round-trip) e por módulos server-only (lib/banco.ts e as rotas), no mesmo princípio de
// lib/formato.ts.

/** Como o negócio paga imposto. MEI não paga percentual sobre faturamento: o DAS entra como linha de
 * custo fixo mensal e as alíquotas ficam em zero (ver impostoPct). */
export type Regime = "mei" | "simples" | "presumido";

/** O que o negócio consegue produzir por mês. Define qual capacidade rateia os custos fixos. */
export type ModoCapacidade = "unidades" | "horas" | "ambos";

/** Onde uma linha de custo fixo é absorvida. "ambos" é dividido pela proporção declarada no negócio. */
export type Balde = "produto" | "servico" | "ambos";

export type TipoItem = "produto" | "servico";

export type Negocio = {
  id: string;
  nome: string;
  regime: Regime;
  /** Alíquota efetiva sobre a venda de produto, em fração (0,06 = 6%). Zero no MEI. */
  impostoProdutoPct: number;
  /** Alíquota efetiva sobre a venda de serviço, em fração. Zero no MEI. */
  impostoServicoPct: number;
  modoCapacidade: ModoCapacidade;
  volumeMensalUnidades: number;
  horasProdutivasMes: number;
  /** Quanto a pessoa quer tirar por mês. Entra como custo fixo, não como sobra. */
  proLaboreMensal: number;
  /** Margem que o negócio persegue, em fração (0,2 = 20%). Cada item pode ter a sua. */
  margemAlvoPadraoPct: number;
  /** Com modoCapacidade "ambos", quanto de uma linha marcada "ambos" vai para o balde de produto,
   * em fração. O resto vai para serviço. Ignorado nos outros modos. */
  proporcaoProdutoPct: number;
  criadoEm: string;
};

export type LinhaCustoFixo = {
  id: string;
  negocioId: string;
  nome: string;
  valorMensal: number;
  balde: Balde;
};

export type CanalVenda = {
  id: string;
  negocioId: string;
  nome: string;
  /** Taxa do canal sobre a venda, em fração (0,16 = 16%). */
  taxaPct: number;
  /** Valor fixo por transação, em reais (a maquininha que cobra R$ 0,39 por venda). */
  taxaFixa: number;
  padrao: boolean;
};

/** Unidades aceitas numa linha de insumo. Ver lib/precificacao/unidades.ts. */
export type Unidade = "kg" | "g" | "mg" | "L" | "ml" | "m" | "cm" | "un";

export type LinhaInsumo = {
  id: string;
  itemId: string;
  nome: string;
  qtdUsada: number;
  unidadeUso: Unidade;
  qtdCompra: number;
  custoCompra: number;
  unidadeCompra: Unidade;
};

export type Item = {
  id: string;
  negocioId: string;
  nome: string;
  tipo: TipoItem;
  /** Margem-alvo deste item, em fração; ausente usa a do negócio. */
  margemAlvoPct?: number;
  /** Minutos de trabalho por unidade. */
  tempoMinutos: number;
  /** Perda/refugo, em fração (0,05 = 5%). */
  perdaPct: number;
  /** Custo direto digitado à mão, em reais, para quem não quer montar a ficha de insumos.
   * Quando há linhas de insumo, elas mandam e este campo é ignorado. */
  custoDiretoManual?: number;
  /** Teto de valor declarado (não calculado): o quanto o cliente aceitaria pagar. */
  precoValorTeto?: number;
  precosConcorrentes: number[];
  criadoEm: string;
};

export type PrecoCanal = {
  itemId: string;
  canalId: string;
  precoEscolhido: number;
};

/** Tudo o que o motor precisa para responder sobre um item num canal. Montado uma vez e passado
 * inteiro: nenhuma função do motor busca nada. */
export type Cenario = {
  negocio: Negocio;
  custosFixos: LinhaCustoFixo[];
  item: Item;
  insumos: LinhaInsumo[];
  canal: CanalVenda;
};

/** Os quatro degraus da escala de estado, com o mesmo significado na régua, nas abas de canal e na
 * lista de itens — e em nenhum outro lugar. */
export type Estado = "prejuizo" | "abaixo-do-alvo" | "saudavel" | "acima-do-teto";
