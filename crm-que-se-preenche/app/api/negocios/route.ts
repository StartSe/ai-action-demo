import { criarNegocio, listarNegocios } from "@/lib/negocios";

export async function GET() {
  return Response.json({ itens: listarNegocios() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { empresa?: string; contato?: string };
  const empresa = (body.empresa || "").trim();
  const contato = (body.contato || "").trim();
  if (!empresa) return Response.json({ error: "Dê o nome da empresa antes de criar o negócio." }, { status: 400 });
  const id = criarNegocio(empresa, contato);
  return Response.json({ id }, { status: 201 });
}
