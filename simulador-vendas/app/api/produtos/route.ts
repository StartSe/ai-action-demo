// Biblioteca de produtos (US-003): a lista e o cadastro. O detalhe de um produto e os materiais dele
// ficam em [id]/route.ts e [id]/fontes/route.ts.
import { contarFontes, criar, listar } from "@/lib/produtos";
import { contarPorProduto } from "@/lib/simulacoes";

export async function GET() {
  const produtos = listar();
  const materiais = contarFontes();
  // A lista mostra "N materiais · N simulações" em cada cartão: as duas contagens saem de uma consulta
  // agregada cada, nunca de uma consulta por cartão.
  const itens = produtos.map((p) => ({
    ...p,
    materiais: materiais[p.id] ?? 0,
    simulacoes: contarPorProduto(p.id).total,
  }));
  return Response.json({ itens });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const nome = String(corpo?.nome || "").trim();
  if (!nome) {
    return Response.json({ error: "Dê um nome ao produto para continuar." }, { status: 400 });
  }
  const produto = criar({
    nome,
    descricao: String(corpo?.descricao || "").trim() || undefined,
    categoria: String(corpo?.categoria || "").trim() || undefined,
  });
  return Response.json(produto);
}
