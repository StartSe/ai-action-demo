import { APP_VERSION } from "@/lib/version";

export function GET() {
  return Response.json({
    ok: true,
    app: "daily-second-brain",
    version: APP_VERSION,
  });
}
