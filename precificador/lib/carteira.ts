// Onde o domínio persistido encontra o motor de cálculo. Server-only.
//
// Tudo o que uma rota, uma ferramenta MCP ou uma rotina precisa saber sobre "como estão meus preços"
// sai daqui — e sai das mesmas funções puras de lib/precificacao que a Bancada roda no navegador,
// nunca de uma segunda implementação.
import { listarCanais, canalPadrao } from "./canais";
import { listarInsumos, listarItens, obterItem } from "./itens";
import { listarCustosFixos, obterNegocio } from "./negocio";
import { listarPrecos, obterPreco } from "./precos";
import {
  calcularCorredor,
  calcularDerivados,
  precificar,
  precoSugerido,
  type CanalVenda,
  type Cenario,
  type ComposicaoCusto,
  type Derivados,
  type Estado,
  type Item,
  type LinhaCustoFixo,
  type LinhaInsumo,
  type Negocio,
  type Precificacao,
} from "./precificacao";

/** Tudo o que a Bancada carrega uma vez e depois recalcula sozinha, sem voltar ao servidor. */
export type EstadoBancada = {
  negocio: Negocio;
  custosFixos: LinhaCustoFixo[];
  canais: CanalVenda[];
  item: Item;
  insumos: LinhaInsumo[];
  /**
   * Só os preços que alguém escolheu de fato. Canal ausente daqui está no automático e a tela
   * calcula o preço dele da margem-alvo a cada tecla — é isso que faz o preço acompanhar a ficha
   * enquanto ela é preenchida (ver `precificarAutomatico`).
   */
  precosEscolhidos: Record<string, number>;
  canalPadraoId: string | null;
};

export function montarCenario(negocio: Negocio, custosFixos: LinhaCustoFixo[], item: Item, insumos: LinhaInsumo[], canal: CanalVenda): Cenario {
  return { negocio, custosFixos, item, insumos, canal };
}

/**
 * Preço escolhido de um item num canal, ou a sugestão do motor quando ninguém escolheu ainda.
 *
 * É aqui que a decisão "preço por canal é independente, não derivado de um preço-base" vira código:
 * cada canal nasce no preço da própria margem-alvo, e daí em diante anda sozinho.
 */
export function precoDoCanal(cenario: Cenario, salvo: number | null): number {
  if (salvo !== null && salvo > 0) return salvo;
  return precoSugerido(calcularCorredor(cenario));
}

export function estadoBancada(itemId: string): EstadoBancada | null {
  const negocio = obterNegocio();
  if (!negocio) return null;
  const item = obterItem(itemId);
  if (!item || item.negocioId !== negocio.id) return null;

  const custosFixos = listarCustosFixos(negocio.id);
  const canais = listarCanais(negocio.id);
  const insumos = listarInsumos(item.id);

  const precosEscolhidos: Record<string, number> = {};
  for (const p of listarPrecos(item.id)) {
    if (p.precoEscolhido > 0) precosEscolhidos[p.canalId] = p.precoEscolhido;
  }

  return { negocio, custosFixos, canais, item, insumos, precosEscolhidos, canalPadraoId: canalPadrao(negocio.id)?.id ?? null };
}

/** Uma linha da carteira: o item visto pelo canal padrão. */
export type LinhaCarteira = {
  item: Item;
  canal: CanalVenda;
  preco: number;
  derivados: Derivados;
  /** Composição do custo da unidade, para a exportação e para a coluna de custo da lista. */
  custo: ComposicaoCusto;
  estado: Estado;
  /** Participação deste item no faturamento estimado do mês, em fração. */
  participacao: number;
  /** Margem-alvo em vigor para o item (a dele, ou a padrão do negócio). */
  margemAlvoPct: number;
};

export type Carteira = {
  negocio: Negocio | null;
  linhas: LinhaCarteira[];
  /** Quantos itens estão abaixo do preço de lucro zero. */
  noVermelho: number;
  /** Quantos estão acima do piso de prejuízo mas abaixo da margem-alvo. */
  abaixoDoAlvo: number;
};

/**
 * A carteira inteira, cada item no seu canal padrão.
 *
 * A participação usa o volume mensal declarado do negócio dividido igualmente entre os itens: o app
 * não pede volume por item (seria mais um formulário), e uma estimativa igualitária declarada é
 * melhor do que uma participação inventada por item.
 */
export function montarCarteira(): Carteira {
  const negocio = obterNegocio();
  if (!negocio) return { negocio: null, linhas: [], noVermelho: 0, abaixoDoAlvo: 0 };

  const custosFixos = listarCustosFixos(negocio.id);
  const canais = listarCanais(negocio.id);
  const padrao = canalPadrao(negocio.id);
  const itens = listarItens(negocio.id);
  if (!padrao) return { negocio, linhas: [], noVermelho: 0, abaixoDoAlvo: 0 };

  const linhas: LinhaCarteira[] = itens.map((item) => {
    const insumos = listarInsumos(item.id);
    const canal = canais.find((c) => c.id === padrao.id) ?? padrao;
    const cenario = montarCenario(negocio, custosFixos, item, insumos, canal);
    const preco = precoDoCanal(cenario, obterPreco(item.id, canal.id));
    const { corredor, derivados } = precificar(cenario, preco);
    return {
      item,
      canal,
      preco,
      derivados,
      custo: corredor.custo,
      estado: derivados.estado,
      participacao: 0,
      margemAlvoPct: corredor.margemAlvoPct,
    };
  });

  const faturamentoTotal = linhas.reduce((s, l) => s + l.preco, 0);
  for (const linha of linhas) linha.participacao = faturamentoTotal > 0 ? linha.preco / faturamentoTotal : 0;

  return {
    negocio,
    linhas,
    noVermelho: linhas.filter((l) => l.estado === "prejuizo").length,
    abaixoDoAlvo: linhas.filter((l) => l.estado === "abaixo-do-alvo").length,
  };
}

/** Precificação completa de um item num canal, para as rotas de IA e as ferramentas MCP. */
export function precificarItem(itemId: string, canalId?: string): { cenario: Cenario; precificacao: Precificacao; preco: number } | null {
  const negocio = obterNegocio();
  if (!negocio) return null;
  const item = obterItem(itemId);
  if (!item) return null;
  const canais = listarCanais(negocio.id);
  const canal = (canalId && canais.find((c) => c.id === canalId)) || canalPadrao(negocio.id);
  if (!canal) return null;

  const cenario = montarCenario(negocio, listarCustosFixos(negocio.id), item, listarInsumos(item.id), canal);
  const preco = precoDoCanal(cenario, obterPreco(item.id, canal.id));
  return { cenario, precificacao: precificar(cenario, preco), preco };
}

export type ItemAfetado = {
  item: Item;
  preco: number;
  margemAntes: number;
  margemDepois: number;
  estadoAntes: Estado;
  estadoDepois: Estado;
};

/** O que sobe numa simulação: o preço de um insumo (ou de todos) ou as linhas de custo fixo. */
export type AlvoSimulacao = "insumo" | "custo-fixo";

/**
 * Quem sai do alvo se os custos subirem `aumentoPct`, mantendo os preços atuais.
 *
 * Responde a dois jobs sem gravar nada — "o insumo subiu, o que eu preciso reajustar" e "o aluguel
 * aumentou, quais itens caíram abaixo do alvo" — sobre o mesmo cenário, só com os números
 * multiplicados antes de recalcular.
 */
export function simular(aumentoPct: number, { alvo = "insumo", nomeInsumo }: { alvo?: AlvoSimulacao; nomeInsumo?: string } = {}): ItemAfetado[] {
  const negocio = obterNegocio();
  if (!negocio) return [];
  const fator = 1 + Math.max(0, Number(aumentoPct) || 0);
  const custosFixos = listarCustosFixos(negocio.id);
  const padrao = canalPadrao(negocio.id);
  if (!padrao) return [];
  const procurado = nomeInsumo?.trim().toLowerCase();

  const fixosDepois = custosFixos.map((l) => ({ ...l, valorMensal: l.valorMensal * fator }));

  const afetados: ItemAfetado[] = [];
  for (const item of listarItens(negocio.id)) {
    const insumos = listarInsumos(item.id);
    const atinge = (l: LinhaInsumo) => !procurado || l.nome.trim().toLowerCase().includes(procurado);
    if (alvo === "insumo" && procurado && !insumos.some(atinge)) continue;

    const cenario = montarCenario(negocio, custosFixos, item, insumos, padrao);
    const preco = precoDoCanal(cenario, obterPreco(item.id, padrao.id));
    const antes = calcularDerivados(calcularCorredor(cenario), preco);
    const cenarioDepois =
      alvo === "custo-fixo"
        ? { ...cenario, custosFixos: fixosDepois }
        : { ...cenario, insumos: insumos.map((l) => (atinge(l) ? { ...l, custoCompra: l.custoCompra * fator } : l)) };
    const depois = calcularDerivados(calcularCorredor(cenarioDepois), preco);
    if (depois.estado === antes.estado && Math.abs(depois.margemLiquidaPct - antes.margemLiquidaPct) < 0.0001) continue;
    afetados.push({
      item,
      preco,
      margemAntes: antes.margemLiquidaPct,
      margemDepois: depois.margemLiquidaPct,
      estadoAntes: antes.estado,
      estadoDepois: depois.estado,
    });
  }
  return afetados.sort((a, b) => a.margemDepois - b.margemDepois);
}
