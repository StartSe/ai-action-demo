import { listarICPs, listarProdutos } from "@/lib/workspace";

/** Lista de produtos com os ICPs de cada um já embutidos (US-004): a tela não faz uma segunda chamada por produto. */
export async function GET() {
  const produtos = listarProdutos();
  const icps = listarICPs();
  const itens = produtos.map((p) => ({ ...p, icps: icps.filter((i) => i.produtoId === p.id) }));
  return Response.json({ itens });
}
