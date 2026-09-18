import { apagarProduto, atualizarProduto, obterProduto } from "@/lib/workspace";
import type { NovoProduto } from "@/lib/types";

/** Produto para pré-preencher o formulário de edição (US-005); sem filtro de apagado_em (ver lib/workspace.ts). */
export async function GET(_req: Request, { params }: RouteContext<"/api/produtos/[id]">) {
  const { id } = await params;
  const produto = obterProduto(id);
  if (!produto) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  return Response.json(produto);
}

/** Atualiza um produto (US-005); mesma validação da criação. Devolve o registro inteiro já atualizado. */
export async function PUT(req: Request, { params }: RouteContext<"/api/produtos/[id]">) {
  const { id } = await params;
  if (!obterProduto(id)) return Response.json({ error: "Produto não encontrado." }, { status: 404 });
  const corpo = await req.json().catch(() => null);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const propostaValor = typeof corpo?.propostaValor === "string" ? corpo.propostaValor.trim() : "";
  if (!nome) return Response.json({ error: "Informe o nome do produto." }, { status: 400 });
  if (!propostaValor) return Response.json({ error: "Descreva a proposta de valor do produto." }, { status: 400 });
  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao.trim() : "";
  const site = typeof corpo?.site === "string" && corpo.site.trim() ? corpo.site.trim() : null;
  const dados: Partial<NovoProduto> = { nome, descricao, site, propostaValor };
  return Response.json(atualizarProduto(id, dados));
}

/** Apaga um produto da lista ativa; prospecções e ICPs já criados continuam intactos (ver lib/workspace.ts). */
export async function DELETE(_req: Request, { params }: RouteContext<"/api/produtos/[id]">) {
  const { id } = await params;
  apagarProduto(id);
  return Response.json({ ok: true });
}
