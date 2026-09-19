import { startRun } from "@/lib/flow-runtime";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const b = await body(req);
    return startRun((await c.params).id, b.input, false, b.demo);
  });
}
