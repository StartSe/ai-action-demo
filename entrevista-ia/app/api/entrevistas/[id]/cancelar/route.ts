// Cancelar a entrevista de um candidato (US-007): o convite deixa de valer e o par (vaga, candidato)
// fica livre para um convite novo. A conversa já gravada e o parecer já gerado continuam onde estão —
// cancelar é parar de esperar, não apagar o que aconteceu. Encerrar o link público é da US-014.
import { cancelar, obter } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrevista = obter(id);
  if (!entrevista) return Response.json({ error: "Essa entrevista não existe mais." }, { status: 404 });
  if (entrevista.status === "cancelada") return Response.json({ entrevista });
  return Response.json({ entrevista: cancelar(id) });
}
