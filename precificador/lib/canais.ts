// Canais de venda: onde o mesmo item é vendido com taxas diferentes. Server-only (node:sqlite via
// lib/banco.ts). Client Components importam o tipo de lib/precificacao.
import { banco, gerarId } from "./banco";
import type { CanalVenda } from "./precificacao";

type LinhaCanal = { id: string; negocio_id: string; nome: string; taxa_pct: number; taxa_fixa: number; padrao: number; ordem: number };

function paraCanal(l: LinhaCanal): CanalVenda {
  return { id: l.id, negocioId: l.negocio_id, nome: l.nome, taxaPct: l.taxa_pct, taxaFixa: l.taxa_fixa, padrao: l.padrao === 1 };
}

export function listarCanais(negocioId: string): CanalVenda[] {
  const linhas = banco().prepare("SELECT * FROM canais_venda WHERE negocio_id = ? ORDER BY ordem, nome").all(negocioId) as LinhaCanal[];
  return linhas.map(paraCanal);
}

export function obterCanal(id: string): CanalVenda | null {
  const linha = banco().prepare("SELECT * FROM canais_venda WHERE id = ?").get(id) as LinhaCanal | undefined;
  return linha ? paraCanal(linha) : null;
}

/** O canal marcado como padrão, ou o primeiro da lista. Nunca devolve nada quando não há canal. */
export function canalPadrao(negocioId: string): CanalVenda | null {
  const canais = listarCanais(negocioId);
  return canais.find((c) => c.padrao) ?? canais[0] ?? null;
}

/**
 * Os três canais que quase todo pequeno negócio brasileiro usa, criados junto com o negócio.
 * As taxas são as de mercado em setembro de 2026 e servem de ponto de partida — a tela deixa editar.
 */
export function canaisSemente(negocioId: string): CanalVenda[] {
  const semente: Omit<CanalVenda, "id" | "negocioId">[] = [
    { nome: "Loja", taxaPct: 0, taxaFixa: 0, padrao: true },
    { nome: "Maquininha", taxaPct: 0.035, taxaFixa: 0, padrao: false },
    { nome: "Marketplace", taxaPct: 0.16, taxaFixa: 0, padrao: false },
  ];
  const d = banco();
  semente.forEach((c, ordem) => {
    d.prepare("INSERT INTO canais_venda (id, negocio_id, nome, taxa_pct, taxa_fixa, padrao, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      gerarId(), negocioId, c.nome, c.taxaPct, c.taxaFixa, c.padrao ? 1 : 0, ordem
    );
  });
  return listarCanais(negocioId);
}

export type DadosCanal = { id?: string; nome: string; taxaPct: number; taxaFixa: number; padrao?: boolean };

function fracao(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Substitui a lista de canais preservando os ids enviados. O id importa mais aqui do que nos custos
 * fixos: `precos_canal` aponta para ele, e trocar o id faria o preço escolhido do iFood reaparecer
 * como preço da loja.
 *
 * Exatamente um canal fica marcado como padrão — o primeiro marcado, ou o primeiro da lista.
 */
export function definirCanais(negocioId: string, canais: DadosCanal[]): CanalVenda[] {
  const d = banco();
  const validos = canais.filter((c) => String(c.nome || "").trim());
  const manter = new Set(validos.map((c) => c.id).filter(Boolean) as string[]);
  for (const antigo of listarCanais(negocioId)) {
    if (!manter.has(antigo.id)) {
      d.prepare("DELETE FROM precos_canal WHERE canal_id = ?").run(antigo.id);
      d.prepare("DELETE FROM versoes_preco WHERE canal_id = ?").run(antigo.id);
      d.prepare("DELETE FROM canais_venda WHERE id = ?").run(antigo.id);
    }
  }
  const indicePadrao = Math.max(0, validos.findIndex((c) => c.padrao));
  validos.forEach((c, ordem) => {
    const nome = String(c.nome).trim().slice(0, 60);
    const taxaPct = fracao(c.taxaPct);
    const taxaFixa = Math.max(0, Number(c.taxaFixa) || 0);
    const padrao = ordem === indicePadrao ? 1 : 0;
    if (c.id && manter.has(c.id)) {
      d.prepare("UPDATE canais_venda SET nome = ?, taxa_pct = ?, taxa_fixa = ?, padrao = ?, ordem = ? WHERE id = ?").run(nome, taxaPct, taxaFixa, padrao, ordem, c.id);
    } else {
      d.prepare("INSERT INTO canais_venda (id, negocio_id, nome, taxa_pct, taxa_fixa, padrao, ordem) VALUES (?, ?, ?, ?, ?, ?, ?)").run(gerarId(), negocioId, nome, taxaPct, taxaFixa, padrao, ordem);
    }
  });
  return listarCanais(negocioId);
}
