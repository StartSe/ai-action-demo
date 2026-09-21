// "O que o agente sugere": GET devolve três sugestões para a versão atual (cache de 24 h; ?forcar=1 gera de novo).
import { sugerir } from "@/lib/sugestoes";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: RouteContext<"/api/sites/[id]/sugestoes">) {
  const { id } = await params;
  try {
    const forcar = new URL(req.url).searchParams.get("forcar") === "1";
    return Response.json(await sugerir(id, forcar), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return respostaErroSites(err);
  }
}
