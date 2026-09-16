// A imagem do produto de uma campanha, como arquivo: usada pelo Higgsfield quando o servidor dele só importa
// mídia por endereço público (media_import_url).
//
// Esta é a única rota pública deste app (está na lista de `proxy.ts`): quem busca a imagem é o servidor do
// Higgsfield, que não tem o cookie de sessão. A proteção é o id da campanha na própria URL — 12 caracteres
// aleatórios gerados por `lib/historico.ts`, mesma classe de segredo de `/f/<token>` e `/s/<id>`. Nada além
// da imagem enviada no briefing é servido aqui; conceitos, roteiro e legendas continuam exigindo sessão.
import { obter } from "@/lib/historico";
import { decodificarImagem } from "@/lib/higgsfield";
import type { Campanha } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/videos/imagem/[campanhaId]">) {
  const { campanhaId } = await params;
  const registro = obter<unknown, Campanha>(campanhaId);
  const dataUrl = registro?.tipo === "campanha" ? registro.saida.briefing?.imagemDataUrl : undefined;
  if (!dataUrl) return new Response("Imagem não encontrada.", { status: 404 });
  try {
    const { mime, bytes } = decodificarImagem(dataUrl);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Content-Length": String(bytes.byteLength), "Cache-Control": "private, max-age=300" } });
  } catch {
    return new Response("Imagem inválida.", { status: 404 });
  }
}
