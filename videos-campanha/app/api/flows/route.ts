import { projects, project, save, remove } from "@/lib/flow/store";
import { validateProject } from "@/lib/flow/model";
import { generationConnections } from "@/lib/flow/connections";
export async function GET() {
  const connections = generationConnections();
  return Response.json({
    projects: projects(),
    demo: connections.demo,
    connected: connections.muapi,
    higgsfieldConnected: connections.higgsfield,
  });
}
export async function PUT(req: Request) {
  try {
    const text = await req.text();
    if (text.length > 2000000) throw new Error("Projeto muito grande.");
    const p = JSON.parse(text);
    validateProject(p);
    return Response.json({ project: save(p) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Não foi possível salvar." },
      { status: 400 },
    );
  }
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !project(id))
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  remove(id);
  return Response.json({ ok: true });
}
