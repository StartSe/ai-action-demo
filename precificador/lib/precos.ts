// O preço escolhido para cada par item × canal — a única coisa que o usuário decide; todo o resto é
// derivado. Server-only (node:sqlite via lib/banco.ts).
//
// Cada gravação que muda o preço deixa uma versão com o custo-base da época: é o que responde
// "quanto eu cobrava antes do insumo subir".
import { agora, banco, gerarId } from "./banco";
import type { PrecoCanal } from "./precificacao";

type LinhaPreco = { item_id: string; canal_id: string; preco_escolhido: number; atualizado_em: string };

export function listarPrecos(itemId: string): PrecoCanal[] {
  const linhas = banco().prepare("SELECT * FROM precos_canal WHERE item_id = ?").all(itemId) as LinhaPreco[];
  return linhas.map((l) => ({ itemId: l.item_id, canalId: l.canal_id, precoEscolhido: l.preco_escolhido }));
}

export function obterPreco(itemId: string, canalId: string): number | null {
  const linha = banco().prepare("SELECT preco_escolhido FROM precos_canal WHERE item_id = ? AND canal_id = ?").get(itemId, canalId) as { preco_escolhido: number } | undefined;
  return linha ? linha.preco_escolhido : null;
}

/**
 * Grava o preço escolhido. Só registra uma versão quando o preço realmente mudou — a Bancada salva
 * com debounce enquanto a pessoa arrasta o marcador, e versionar cada passo encheria o histórico de
 * ruído.
 */
export function definirPreco(itemId: string, canalId: string, preco: number, custoBase = 0): PrecoCanal {
  const valor = Math.max(0, Number(preco) || 0);
  const anterior = obterPreco(itemId, canalId);
  const d = banco();
  d.prepare(
    `INSERT INTO precos_canal (item_id, canal_id, preco_escolhido, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id, canal_id) DO UPDATE SET preco_escolhido = excluded.preco_escolhido, atualizado_em = excluded.atualizado_em`
  ).run(itemId, canalId, valor, agora());
  if (anterior === null || Math.abs(anterior - valor) > 0.005) {
    d.prepare("INSERT INTO versoes_preco (id, item_id, canal_id, preco, custo_base, criado_em) VALUES (?, ?, ?, ?, ?, ?)").run(
      gerarId(), itemId, canalId, valor, Math.max(0, Number(custoBase) || 0), agora()
    );
  }
  return { itemId, canalId, precoEscolhido: valor };
}

/**
 * Apaga a escolha e devolve o canal ao preço automático (o da margem-alvo).
 *
 * Não apaga o histórico: quanto se cobrou antes continua sendo verdade.
 */
export function apagarPreco(itemId: string, canalId: string): void {
  banco().prepare("DELETE FROM precos_canal WHERE item_id = ? AND canal_id = ?").run(itemId, canalId);
}

export type VersaoPreco = { id: string; preco: number; custoBase: number; criadoEm: string };

/** Histórico de preço de um item num canal, do mais recente para o mais antigo. */
export function historicoPreco(itemId: string, canalId: string, limite = 30): VersaoPreco[] {
  const linhas = banco()
    .prepare("SELECT id, preco, custo_base, criado_em FROM versoes_preco WHERE item_id = ? AND canal_id = ? ORDER BY criado_em DESC LIMIT ?")
    .all(itemId, canalId, limite) as { id: string; preco: number; custo_base: number; criado_em: string }[];
  return linhas.map((l) => ({ id: l.id, preco: l.preco, custoBase: l.custo_base, criadoEm: l.criado_em }));
}
