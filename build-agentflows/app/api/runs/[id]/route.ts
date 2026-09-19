import { getRun } from "@/lib/flow-store";
import { resumeRun, cancelRun } from "@/lib/flow-runtime";
import { api, body } from "@/lib/flow-api";
type C = { params: Promise<{ id: string }> };
export async function GET(_: Request, c: C) {
  return api(async () => getRun((await c.params).id));
}
export async function POST(req: Request, c: C) {
  return api(async () => {
    const b = await body(req);
    return b.action === "cancel"
      ? cancelRun((await c.params).id)
      : resumeRun((await c.params).id, b.decision);
  });
}
