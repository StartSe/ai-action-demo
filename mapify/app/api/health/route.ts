export function GET() {
  return Response.json({ ok: true, app: "mapify", version: "1.0.1" });
}
