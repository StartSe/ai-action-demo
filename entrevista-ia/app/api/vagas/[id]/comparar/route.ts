// Os candidatos avaliados desta vaga, lado a lado (US-024).
//
// É uma leitura e só: a comparação é calculada a cada pedido, nunca salva — não há POST aqui, e a
// rota antiga que gravava um `ranking` no histórico saiu junto com esta.
import { compararCandidatos } from "@/lib/comparacao";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comparacao = compararCandidatos(id);
  if (!comparacao) return Response.json({ error: "Essa vaga não existe mais." }, { status: 404 });
  return Response.json({ comparacao });
}
