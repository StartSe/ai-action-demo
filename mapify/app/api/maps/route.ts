import { randomUUID } from "node:crypto";
import { api, body } from "@/lib/api";
import { listMaps, createMap, getMap } from "@/lib/maps";
import { demoMap } from "@/lib/demo";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(listMaps);
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    const original = typeof b.copy === "string" ? getMap(b.copy) : demoMap();
    const now = new Date().toISOString();
    return createMap({
      ...original,
      id: randomUUID(),
      title: b.copy ? `${original.title} (cópia)` : original.title,
      revision: 1,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    });
  });
}
