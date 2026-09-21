// Itens precificados e a ficha de insumos de cada um. Server-only (node:sqlite via lib/banco.ts).
import { agora, banco, gerarId, idDoCliente } from "./banco";
import { UNIDADES, type Item, type LinhaInsumo, type TipoItem, type Unidade } from "./precificacao";

type LinhaItem = {
  id: string;
  negocio_id: string;
  nome: string;
  tipo: string;
  margem_alvo_pct: number | null;
  tempo_minutos: number;
  perda_pct: number;
  custo_direto_manual: number | null;
  preco_valor_teto: number | null;
  precos_concorrentes: string;
  exemplo: number;
  criado_em: string;
};

function paraItem(l: LinhaItem): Item {
  let precos: number[] = [];
  try {
    const bruto = JSON.parse(l.precos_concorrentes);
    if (Array.isArray(bruto)) precos = bruto.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    // lista corrompida no banco não derruba a tela: o item aparece sem concorrentes
  }
  return {
    id: l.id,
    negocioId: l.negocio_id,
    nome: l.nome,
    tipo: (l.tipo === "servico" ? "servico" : "produto") as TipoItem,
    margemAlvoPct: l.margem_alvo_pct ?? undefined,
    tempoMinutos: l.tempo_minutos,
    perdaPct: l.perda_pct,
    custoDiretoManual: l.custo_direto_manual ?? undefined,
    precoValorTeto: l.preco_valor_teto ?? undefined,
    precosConcorrentes: precos,
    criadoEm: l.criado_em,
  };
}

export function listarItens(negocioId: string): Item[] {
  const linhas = banco().prepare("SELECT * FROM itens WHERE negocio_id = ? ORDER BY criado_em").all(negocioId) as LinhaItem[];
  return linhas.map(paraItem);
}

export function obterItem(id: string): Item | null {
  const linha = banco().prepare("SELECT * FROM itens WHERE id = ?").get(id) as LinhaItem | undefined;
  return linha ? paraItem(linha) : null;
}

/** true quando o item veio de um preset. "Apagar os dados de exemplo" usa isto. */
export function ehExemplo(id: string): boolean {
  const linha = banco().prepare("SELECT exemplo FROM itens WHERE id = ?").get(id) as { exemplo: number } | undefined;
  return linha?.exemplo === 1;
}

export type DadosItem = Partial<Omit<Item, "id" | "negocioId" | "criadoEm">> & { exemplo?: boolean };

function opcionalPositivo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function campos(dados: DadosItem, base?: Item) {
  const precos = Array.isArray(dados.precosConcorrentes)
    ? dados.precosConcorrentes.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20)
    : base?.precosConcorrentes ?? [];
  return {
    nome: (typeof dados.nome === "string" ? dados.nome.trim().slice(0, 120) : base?.nome) || "Item sem nome",
    tipo: (dados.tipo === "servico" || dados.tipo === "produto" ? dados.tipo : base?.tipo ?? "produto") as TipoItem,
    margemAlvoPct: dados.margemAlvoPct === undefined ? base?.margemAlvoPct ?? null : opcionalPositivo(dados.margemAlvoPct),
    tempoMinutos: dados.tempoMinutos === undefined ? base?.tempoMinutos ?? 0 : Math.max(0, Number(dados.tempoMinutos) || 0),
    perdaPct: dados.perdaPct === undefined ? base?.perdaPct ?? 0 : Math.min(1, Math.max(0, Number(dados.perdaPct) || 0)),
    custoDiretoManual: dados.custoDiretoManual === undefined ? base?.custoDiretoManual ?? null : opcionalPositivo(dados.custoDiretoManual),
    precoValorTeto: dados.precoValorTeto === undefined ? base?.precoValorTeto ?? null : opcionalPositivo(dados.precoValorTeto),
    precosConcorrentes: JSON.stringify(precos),
  };
}

export function criarItem(negocioId: string, dados: DadosItem): Item {
  const id = gerarId();
  const c = campos(dados);
  banco()
    .prepare(
      `INSERT INTO itens (id, negocio_id, nome, tipo, margem_alvo_pct, tempo_minutos, perda_pct,
       custo_direto_manual, preco_valor_teto, precos_concorrentes, exemplo, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, negocioId, c.nome, c.tipo, c.margemAlvoPct, c.tempoMinutos, c.perdaPct, c.custoDiretoManual, c.precoValorTeto, c.precosConcorrentes, dados.exemplo ? 1 : 0, agora());
  return obterItem(id)!;
}

export function atualizarItem(id: string, dados: DadosItem): Item | null {
  const base = obterItem(id);
  if (!base) return null;
  const c = campos(dados, base);
  banco()
    .prepare(
      `UPDATE itens SET nome = ?, tipo = ?, margem_alvo_pct = ?, tempo_minutos = ?, perda_pct = ?,
       custo_direto_manual = ?, preco_valor_teto = ?, precos_concorrentes = ? WHERE id = ?`
    )
    .run(c.nome, c.tipo, c.margemAlvoPct, c.tempoMinutos, c.perdaPct, c.custoDiretoManual, c.precoValorTeto, c.precosConcorrentes, id);
  return obterItem(id);
}

/** Apaga o item e tudo o que pende dele: ficha, preços por canal e histórico de preço. */
export function apagarItem(id: string): void {
  const d = banco();
  d.prepare("DELETE FROM versoes_preco WHERE item_id = ?").run(id);
  d.prepare("DELETE FROM precos_canal WHERE item_id = ?").run(id);
  d.prepare("DELETE FROM linhas_insumo WHERE item_id = ?").run(id);
  d.prepare("DELETE FROM itens WHERE id = ?").run(id);
}

type LinhaInsumoBanco = {
  id: string;
  item_id: string;
  nome: string;
  qtd_usada: number;
  unidade_uso: string;
  qtd_compra: number;
  custo_compra: number;
  unidade_compra: string;
  ordem: number;
};

function unidade(valor: unknown, padrao: Unidade = "un"): Unidade {
  return UNIDADES.includes(valor as Unidade) ? (valor as Unidade) : padrao;
}

export function listarInsumos(itemId: string): LinhaInsumo[] {
  const linhas = banco().prepare("SELECT * FROM linhas_insumo WHERE item_id = ? ORDER BY ordem").all(itemId) as LinhaInsumoBanco[];
  return linhas.map((l) => ({
    id: l.id,
    itemId: l.item_id,
    nome: l.nome,
    qtdUsada: l.qtd_usada,
    unidadeUso: unidade(l.unidade_uso),
    qtdCompra: l.qtd_compra,
    custoCompra: l.custo_compra,
    unidadeCompra: unidade(l.unidade_compra),
  }));
}

export type DadosInsumo = { id?: string; nome: string; qtdUsada: number; unidadeUso: string; qtdCompra: number; custoCompra: number; unidadeCompra: string };

/**
 * Substitui a ficha inteira do item, preservando os ids enviados (a tela salva tudo de uma vez).
 *
 * Quem decide entre atualizar e inserir é a existência da linha **no banco**, não o fato de o id
 * ter vindo preenchido: a tela gera o id da linha nova antes de gravar, e tratar isso como
 * atualização faria o UPDATE não achar nada e a linha nunca nascer.
 *
 * Linha sem nome não é persistida — ela continua na tela até ganhar um, porque a resposta desta
 * função não volta para lá (ver o comentário de `agendarFicha` em components/Bancada.tsx).
 */
export function definirInsumos(itemId: string, linhas: DadosInsumo[]): LinhaInsumo[] {
  const d = banco();
  const validas = linhas.filter((l) => String(l.nome || "").trim());
  const noBanco = new Set(listarInsumos(itemId).map((l) => l.id));
  const manter = new Set(validas.map((l) => l.id).filter(Boolean) as string[]);
  for (const antiga of noBanco) {
    if (!manter.has(antiga)) d.prepare("DELETE FROM linhas_insumo WHERE id = ?").run(antiga);
  }
  validas.forEach((l, ordem) => {
    const valores = [
      String(l.nome).trim().slice(0, 120),
      Math.max(0, Number(l.qtdUsada) || 0),
      unidade(l.unidadeUso),
      Math.max(0, Number(l.qtdCompra) || 0),
      Math.max(0, Number(l.custoCompra) || 0),
      unidade(l.unidadeCompra),
      ordem,
    ] as const;
    if (l.id && noBanco.has(l.id)) {
      d.prepare("UPDATE linhas_insumo SET nome = ?, qtd_usada = ?, unidade_uso = ?, qtd_compra = ?, custo_compra = ?, unidade_compra = ?, ordem = ? WHERE id = ?").run(...valores, l.id);
    } else {
      d.prepare("INSERT INTO linhas_insumo (id, item_id, nome, qtd_usada, unidade_uso, qtd_compra, custo_compra, unidade_compra, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(idDoCliente(l.id), itemId, ...valores);
    }
  });
  return listarInsumos(itemId);
}
