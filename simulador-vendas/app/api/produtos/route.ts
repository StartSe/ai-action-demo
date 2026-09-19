// Biblioteca de produtos (US-003): a lista e o cadastro. O detalhe de um produto e os materiais dele
// ficam em [id]/route.ts e [id]/fontes/route.ts.
import { contarFontes, criar, listar } from "@/lib/produtos";
import { contarPorProduto } from "@/lib/simulacoes";

const SEM_FONTE = { total: 0, landing: 0, documento: 0, texto: 0 };

export async function GET() {
  const produtos = listar();
  const fontes = contarFontes();
  // A lista mostra "N materiais · N simulações" em cada cartão: as duas contagens saem de uma consulta
  // agregada cada, nunca de uma consulta por cartão. `landings` é o que o passo 1 de "Novo treino"
  // usa para dizer "página importada" (US-009) sem pedir as fontes de cada produto.
  const itens = produtos.map((p) => {
    const f = fontes[p.id] ?? SEM_FONTE;
    return { ...p, materiais: f.total, landings: f.landing, simulacoes: contarPorProduto(p.id).total };
  });
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
