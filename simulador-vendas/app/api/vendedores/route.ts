import { criar, listar } from "@/lib/vendedores";

export async function GET() {
  return Response.json({ itens: listar() });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const nome = String(corpo?.nome || "").trim();
  if (!nome) {
    return Response.json({ error: "Informe o nome do vendedor." }, { status: 400 });
  }
  const email = String(corpo?.email || "").trim();
  const equipe = String(corpo?.equipe || "").trim();
  const vendedor = criar({ nome, email: email || undefined, equipe: equipe || undefined });
  return Response.json(vendedor);
}
