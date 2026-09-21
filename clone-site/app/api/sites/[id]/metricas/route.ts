// Visitas do site publicado: GET ?dias=7|30 devolve o resumo (lib/metricas.ts).
import { resumo } from "@/lib/metricas";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteContext<"/api/sites/[id]/metricas">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  const dias = Number(new URL(req.url).searchParams.get("dias")) === 30 ? 30 : 7;
  return Response.json(resumo(id, dias), { headers: { "Cache-Control": "no-store" } });
}
