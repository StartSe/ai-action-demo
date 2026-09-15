// Andamento de um vídeo: a tela consulta a cada 5 s; enquanto o Higgsfield trabalha, a consulta é repassada a ele.
import { atualizarEstado } from "@/lib/videos";
import { responderErro } from "../erros";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/videos/[id]">) {
  const { id } = await params;
  try {
    return Response.json({ video: await atualizarEstado(id) });
  } catch (err) {
    return responderErro(err, "Não foi possível consultar o andamento agora.");
  }
}
