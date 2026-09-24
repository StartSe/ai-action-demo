import { criarRadar, editarRadar, listarRadares, renomearRadar } from "@/lib/radares";
import { sincronizarAgendas } from "@/lib/agendas-radar";
export const dynamic = "force-dynamic";
export async function GET() { await sincronizarAgendas(); return Response.json({ itens: listarRadares() }); }
export async function POST(req: Request) {
  try { const b = await req.json(); const radar = criarRadar(b.nome, b.pesquisa); await sincronizarAgendas(); return Response.json({ radar }, { status: 201 }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
export async function PATCH(req: Request) {
  try {
    const { id, nome, pesquisa } = await req.json();
    if (typeof id !== "string" || !id) throw new Error("Informe o radar.");
    const radar = pesquisa === undefined ? renomearRadar(id, nome) : editarRadar(id, nome, pesquisa);
    await sincronizarAgendas();
    return Response.json({ radar });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
