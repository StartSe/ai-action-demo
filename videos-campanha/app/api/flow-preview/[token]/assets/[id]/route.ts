import { sharedCanvas } from "@/lib/flow/share";
import { serveAsset } from "@/lib/flow/serve-media";

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;
  const asset = sharedCanvas(token)?.media.find((a) => a.id === id);
  if (!asset) return new Response("Arquivo não encontrado.", { status: 404 });
  if (!asset.mimeType && asset.url.startsWith("https://")) {
    return new Response(null, {
      status: 307,
      headers: {
        Location: asset.url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return serveAsset(req, asset);
}
