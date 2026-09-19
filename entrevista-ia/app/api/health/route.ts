import { version } from "@/package.json";

export async function GET() {
  return Response.json({ ok: true, versao: version }, { headers: { "Cache-Control": "no-store" } });
}
