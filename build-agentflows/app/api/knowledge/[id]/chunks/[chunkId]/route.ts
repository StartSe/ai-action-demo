import { api, body } from "@/lib/flow-api";
import { editKnowledgeChunk } from "@/lib/knowledge-store";
type Context = { params: Promise<{ id: string; chunkId: string }> };
export async function PUT(req: Request, context: Context) {
  return api(async () => {
    const { id, chunkId } = await context.params;
    const input = await body(req);
    editKnowledgeChunk(id, chunkId, {
      pageContent: input.pageContent,
      metadata: input.metadata,
    });
    return { ok: true };
  });
}
export async function DELETE(_req: Request, context: Context) {
  return api(async () => {
    const { id, chunkId } = await context.params;
    editKnowledgeChunk(id, chunkId, null);
    return { ok: true };
  });
}
