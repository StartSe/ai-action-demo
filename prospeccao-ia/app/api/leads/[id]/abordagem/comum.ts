import type { EstrategiaAbordagem } from "@/lib/types";
import { obterConta, obterICP, obterLead, obterProduto, obterProspeccao } from "@/lib/workspace";

export const CAMPOS_ESTRATEGIA: (keyof EstrategiaAbordagem)[] = ["objetivo", "gancho", "dorProvavel", "tom", "cta"];

export function estrategiaValida(v: unknown): v is EstrategiaAbordagem {
  if (!v || typeof v !== "object") return false;
  return CAMPOS_ESTRATEGIA.every((campo) => typeof (v as Record<string, unknown>)[campo] === "string" && (v as Record<string, unknown>)[campo] !== "");
}

/** Contexto necessário para gerar/regenerar a estratégia/mensagens de um lead: a própria pessoa, a conta
 * vinculada (nula em B2C ou "explorar uma empresa" sem site) e o produto da prospecção. `null` quando o
 * lead, a prospecção ou o produto não existem mais (mesma regra de "Esta pessoa não existe mais." de
 * FichaLead) — compartilhado por GET/PUT (gerar/editar) e por POST regenerar. */
export function contextoDoLead(leadId: string) {
  const lead = obterLead(leadId);
  if (!lead) return null;
  const prospeccao = obterProspeccao(lead.prospeccaoId);
  const produto = prospeccao ? obterProduto(prospeccao.produtoId) : null;
  if (!produto) return null;
  const icp = prospeccao ? obterICP(prospeccao.icpId) : null;
  const conta = lead.contaId ? obterConta(lead.contaId) : null;
  return { lead, produto, icp, conta };
}
