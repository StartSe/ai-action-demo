// Cache por hash do pedido (RF-12): um pedido idêntico em até 24 h reaproveita o painel salvo, sem chamar a IA.
// Sem tabela nova: varre listarPorTipo("painel", 50) de lib/historico.ts.
import { createHash } from "node:crypto";
import type { Meta } from "./ai";
import { juntarEsclarecimentos } from "./esclarecer";
import { listarPorTipo } from "./historico";
import type { EspecPainel, PedidoPainel } from "./types";

const VALIDADE_MS = 24 * 60 * 60 * 1000;

export function hashPedido(pedido: PedidoPainel): string {
  const texto = juntarEsclarecimentos(pedido.descricao, pedido.esclarecimentos ?? {})
    .trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(texto).digest("hex");
}

/**
 * Primeiro painel salvo com o mesmo hash, com menos de 24 h, gerado no mesmo modo (demo ou IA) e
 * nunca refinado (um painel com `refinadoEm` não representa mais o pedido original).
 */
export function buscarNoCache(hash: string, demo: boolean): { id: string; painel: EspecPainel; meta: Meta } | null {
  const limite = Date.now() - VALIDADE_MS;
  for (const r of listarPorTipo<PedidoPainel, EspecPainel, Meta>("painel", 50)) {
    if (r.entrada?.hash !== hash) continue;
    if (new Date(r.criadoEm).getTime() < limite) continue;
    if (Boolean(r.meta?.demo) !== demo) continue;
    if (r.saida?.refinadoEm) continue;
    if (!Array.isArray(r.saida?.componentes) || r.saida.componentes.length === 0) continue;
    return { id: r.id, painel: r.saida, meta: r.meta };
  }
  return null;
}
