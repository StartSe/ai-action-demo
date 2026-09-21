// Livro de premissas: a pessoa informa (PUT) ou volta ao valor da base (DELETE), por produto e premissa.
import { api, body, AppError, string } from "@/lib/api";
import { carregarBase, premissasEfetivas, removerPremissa, salvarPremissa } from "@/lib/base";
export const dynamic = "force-dynamic";
function respostaProduto(produto: string) {
  const base = carregarBase();
  const e = premissasEfetivas(base, produto);
  return { produto: e.produto, premissas: e.premissas, faltantes: e.faltantes, daBase: e.daBase, baseline: base.baseline, avisos: base.avisos };
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    const produto = string(b.produto, 200);
    if (!produto) throw new AppError("Informe o produto.");
    const chave = string(b.chave, 40);
    salvarPremissa(produto, chave, b.valor, "informada");
    return respostaProduto(produto);
  });
}
export async function DELETE(req: Request) {
  return api(async () => {
    const b = await body(req);
    const produto = string(b.produto, 200);
    if (!produto) throw new AppError("Informe o produto.");
    removerPremissa(produto, string(b.chave, 40) || undefined);
    return respostaProduto(produto);
  });
}
