import { obterRelease } from "@/lib/releases";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const release = obterRelease((await params).id);
  if (!release) return new Response("Pacote não encontrado.", { status: 404 });
  return new Response(new Uint8Array(release.dados), { headers: {
    "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename=site.json.gz",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
}
