// Anexa a imagem do produto a uma campanha já criada (PATCH { imagemDataUrl }). Existe para que esquecer a
// imagem no briefing não obrigue a recriar os três conceitos: a tela mostra a área de envio junto do
// resultado. A lógica vive em lib/videos.ts (guardarImagemDaCampanha).
import { guardarImagemDaCampanha } from "@/lib/videos";
import { responderErro } from "../../videos/erros";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: RouteContext<"/api/conceitos/[id]">) {
  const { id } = await params;
  const corpo = (await req.json().catch(() => ({}))) as { imagemDataUrl?: unknown };
  try {
    const campanha = guardarImagemDaCampanha(id, corpo.imagemDataUrl);
    return Response.json({ campanha });
  } catch (err) {
    return responderErro(err, "Não foi possível guardar a imagem do produto agora.");
  }
}
