import { criarRadar, listarRadares, renomearRadar } from "@/lib/radares";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json({ itens: listarRadares() }); }
export async function POST(req: Request) {
  try { return Response.json({ radar: criarRadar((await req.json()).nome) }, { status: 201 }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function PATCH(req: Request) {
  try {
    const { id, nome } = await req.json();
    if (typeof id !== "string" || !id) throw new Error("Informe o radar.");
    return Response.json({ radar: renomearRadar(id, nome) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
