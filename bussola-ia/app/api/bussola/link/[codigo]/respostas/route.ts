// "Ver resultado" numa avaliação em andamento: respostas já recebidas por este link, sem nenhuma
// análise (nível geral/resumo) — isso é a US-013, quando houver respostas reais o bastante.
import { respostasDoLink } from "@/lib/link-avaliacao";

export async function GET(_req: Request, { params }: RouteContext<"/api/bussola/link/[codigo]/respostas">) {
  const { codigo } = await params;
  const respostas = respostasDoLink(codigo);
  if (respostas === null) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
  return Response.json({ respostas });
}
