export function GET() {
  return Response.json({
    ok: true,
    app: "daily-second-brain",
    version: "1.0.0",
  });
}
