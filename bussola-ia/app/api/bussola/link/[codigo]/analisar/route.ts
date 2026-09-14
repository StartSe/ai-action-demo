// "Analisar respostas" numa avaliação em andamento: calcula o diagnóstico a partir das respostas já
// recebidas por este link e salva no histórico (US-013).
import { analisarLink } from "@/lib/bussola";

export async function POST(_req: Request, { params }: RouteContext<"/api/bussola/link/[codigo]/analisar">) {
  const { codigo } = await params;
  try {
    const resultado = await analisarLink(codigo);
    if (resultado === null) return Response.json({ error: "Avaliação não encontrada." }, { status: 404 });
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível analisar as respostas agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
