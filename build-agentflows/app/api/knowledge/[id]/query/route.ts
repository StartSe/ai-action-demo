import { api, body } from "@/lib/flow-api";
import { queryKnowledge } from "@/lib/knowledge-index";
type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, context: Context) {
  return api(async () => {
    const input = await body(req);
    return queryKnowledge(
      (await context.params).id,
      input.query,
      input.topK ?? 4,
      input.minScore ?? 0,
      req.signal,
    );
  });
}
