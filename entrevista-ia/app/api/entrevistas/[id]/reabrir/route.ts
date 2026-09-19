import { sessaoAtual } from "@/lib/conta";
import { ErroReabertura, reabrirEntrevista } from "@/lib/reabrir-entrevista";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sessaoAtual(req)) return Response.json({ error: "Entre com a conta do gestor para reabrir a entrevista." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Number.isInteger(body?.tentativa) || body.tentativa < 1) return Response.json({ error: "Atualize a página e tente novamente." }, { status: 400 });
  const { id } = await params;
  try { return Response.json({ entrevista: await reabrirEntrevista(id, body.tentativa) }); }
  catch (err) {
    if (err instanceof ErroReabertura) return Response.json({ error: err.message }, { status: err.status });
    console.error("Falha ao reabrir entrevista", err);
    return Response.json({ error: "Não foi possível reabrir agora. Tente novamente." }, { status: 503 });
  }
}
