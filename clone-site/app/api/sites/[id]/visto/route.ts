// A pessoa abriu o site: o aviso do sino deixa de contar.
import { marcarVisto, obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  marcarVisto(id);
  return Response.json({ ok: true });
}
