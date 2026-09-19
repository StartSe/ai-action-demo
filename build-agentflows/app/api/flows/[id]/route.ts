import { getFlow, saveFlow, deleteFlow } from "@/lib/flow-store";
import { api, body } from "@/lib/flow-api";
type C = { params: Promise<{ id: string }> };
export async function GET(_: Request, c: C) {
  return api(async () => getFlow((await c.params).id));
}
export async function PUT(req: Request, c: C) {
  return api(async () => saveFlow((await c.params).id, await body(req)));
}
export async function DELETE(_: Request, c: C) {
  return api(async () => {
    deleteFlow((await c.params).id);
    return { ok: true };
  });
}
