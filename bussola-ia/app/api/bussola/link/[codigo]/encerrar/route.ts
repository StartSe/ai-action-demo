// "Encerrar" numa avaliação em andamento: para de aceitar respostas novas, sem apagar as já recebidas.
import { encerrarAvaliacao } from "@/lib/link-avaliacao";

export async function POST(_req: Request, { params }: RouteContext<"/api/bussola/link/[codigo]/encerrar">) {
  const { codigo } = await params;
  const ok = encerrarAvaliacao(codigo);
  if (!ok) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
  return Response.json({ ok: true });
}
