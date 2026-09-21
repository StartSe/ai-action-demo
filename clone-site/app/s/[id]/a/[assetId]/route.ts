// Asset (logo ou imagem) de um site, público como o próprio site (/s/* é liberado em proxy.ts): tipo real
// do arquivo, cache de 1 h, nosniff. SVG sai com uma CSP que não executa nada (a sanitização na entrada já
// recusa script/eventos; a CSP é a segunda camada, como no HTML da página).
import { conteudo } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/s/[id]/a/[assetId]">) {
  const { id, assetId } = await params;
  const asset = conteudo(id, assetId);
  if (!asset) return new Response("Imagem não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Content-Length": String(asset.dados.byteLength),
    "Cache-Control": "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  };
  if (asset.mime === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
  return new Response(new Uint8Array(asset.dados), { status: 200, headers });
}
