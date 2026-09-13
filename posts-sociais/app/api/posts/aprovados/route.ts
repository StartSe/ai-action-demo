import { listarPorTipo } from "@/lib/historico";
import type { DadosPosts, Post, ResultadoPosts } from "@/lib/types";
import type { Meta } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Rascunhos aprovados pelo link de aprovação (lib/rascunhos.ts), para o painel "Aprovados". */
export async function GET() {
  const resultados = listarPorTipo<DadosPosts, ResultadoPosts, Meta>("posts", 50).filter((r) => r.saida.aprovacao?.status === "aprovado");
  const itens = resultados.map((r) => ({ id: r.id, titulo: r.titulo, criadoEm: r.criadoEm, posts: r.saida.posts as Post[] }));
  return Response.json({ itens });
}
