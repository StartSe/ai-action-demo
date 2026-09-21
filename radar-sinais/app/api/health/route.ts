import pacote from "@/package.json";

export async function GET() {
  return Response.json({ ok: true, version: pacote.version });
}
