import { publishFlow } from "@/lib/flow-store";
import { api, body } from "@/lib/flow-api";
export async function POST(
  req: Request,
  c: { params: Promise<{ id: string }> },
) {
  return api(async () =>
    publishFlow((await c.params).id, (await body(req)).active !== false),
  );
}
