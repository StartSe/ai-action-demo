import { criarProduto, produtosComICPs } from "@/lib/workspace";
import type { NovoProduto } from "@/lib/types";

/** Lista de produtos com os ICPs de cada um já embutidos (US-004): a tela não faz uma segunda chamada por
 * produto. Mesma função (lib/workspace.ts:produtosComICPs) usada pela ferramenta MCP `listar_produtos`. */
export async function GET() {
  return Response.json({ itens: produtosComICPs() });
}

/** Cria um produto (US-005); nome e proposta de valor são obrigatórios, descrição e site são opcionais. */
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const nome = typeof corpo?.nome === "string" ? corpo.nome.trim() : "";
  const propostaValor = typeof corpo?.propostaValor === "string" ? corpo.propostaValor.trim() : "";
  if (!nome) return Response.json({ error: "Informe o nome do produto." }, { status: 400 });
  if (!propostaValor) return Response.json({ error: "Descreva a proposta de valor do produto." }, { status: 400 });
  const descricao = typeof corpo?.descricao === "string" ? corpo.descricao.trim() : "";
  const site = typeof corpo?.site === "string" && corpo.site.trim() ? corpo.site.trim() : null;
  const dados: NovoProduto = { nome, descricao, site, propostaValor };
  return Response.json(criarProduto(dados));
}
