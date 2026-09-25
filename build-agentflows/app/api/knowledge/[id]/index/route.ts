import { api } from "@/lib/flow-api";
import { cleanupKnowledge, indexKnowledge } from "@/lib/knowledge-index";
import { withKnowledgeLock } from "@/lib/knowledge-store";
type Context = { params: Promise<{ id: string }> };
export const maxDuration = 600;
export async function POST(_req: Request, context: Context) {
  return api(async () => indexKnowledge((await context.params).id));
}
export async function DELETE(_req: Request, context: Context) {
  return api(async () => {
    const { id } = await context.params;
    return withKnowledgeLock(id, () => cleanupKnowledge(id));
  });
}
