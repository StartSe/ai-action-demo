import { listarPorTipo } from "@/lib/historico";
import type { DadosPosts, Post, ResultadoPosts } from "@/lib/types";
import type { Meta } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** Rascunhos semanais (lib/rascunhos.ts) para o painel "Aprovados": aprovados, aguardando resposta e com
 * ajuste pedido (com o comentário de quem pediu). Descartados ficam de fora. Só resultados que passaram
 * por uma rotina têm `aprovacao`; posts gerados na tela não entram. */
export async function GET() {
  const resultados = listarPorTipo<DadosPosts, ResultadoPosts, Meta>("posts", 50).filter((r) => r.saida.aprovacao && r.saida.aprovacao.status !== "descartado");
  const itens = resultados.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    criadoEm: r.criadoEm,
    empresa: r.entrada.empresa || "",
    status: r.saida.aprovacao!.status,
    comentario: r.saida.aprovacao!.comentario || "",
    posts: r.saida.posts as Post[],
  }));
  return Response.json({ itens });
}
