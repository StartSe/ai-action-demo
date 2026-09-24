import { listarMateriais, normalizarMateriais, salvarMateriais } from "@/lib/materiais";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  return Response.json({ materiais: listarMateriais(id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = obter(id);
    if (!p) throw new ProjetoNaoEncontrado();
    if (p.estado === "gerando") return Response.json({ error: "Aguarde a criação terminar para trocar os materiais." }, { status: 409 });
    const corpo = await corpoJson(req);
    const materiais = normalizarMateriais(corpo.materiais);
    salvarMateriais(id, materiais);
    return Response.json({ materiais });
  } catch (err) { return respostaErroSites(err); }
}
