import { version } from "@/package.json";

export function GET() {
  return Response.json({ ok: true, app: "mapify", name: "Mapia", version });
}
