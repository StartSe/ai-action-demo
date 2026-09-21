export function GET() {
  return Response.json({ ok: true, app: "predictive-harness", version: "0.1.0" });
}
