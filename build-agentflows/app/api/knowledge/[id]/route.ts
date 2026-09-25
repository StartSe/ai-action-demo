import { api, body } from "@/lib/flow-api";
import {
  getKnowledgeBase,
  knowledgeBaseUsages,
  knowledgeDb,
  listKnowledgeRuns,
  listKnowledgeSources,
  updateKnowledgeBase,
} from "@/lib/knowledge-store";
import { deleteKnowledgeBase, knowledgeStorageLocation } from "@/lib/knowledge-index";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export async function GET(_req: Request, context: Context) {
  return api(async () => {
    const { id } = await context.params;
    const base = getKnowledgeBase(id);
    const pending = (
      knowledgeDb()
        .prepare(
          "SELECT count(*) n FROM knowledge_cleanup WHERE base_id=? AND id NOT IN (SELECT generation FROM knowledge_indexes WHERE base_id=?)",
        )
        .get(id, id) as { n: number }
    ).n;
    return {
      base,
      storage: knowledgeStorageLocation(id),
      sources: listKnowledgeSources(id),
      runs: listKnowledgeRuns(id),
      usages: knowledgeBaseUsages(id),
      cleanupPending: pending,
    };
  });
}
export async function PUT(req: Request, context: Context) {
  return api(async () =>
    updateKnowledgeBase((await context.params).id, await body(req)),
  );
}
export async function DELETE(_req: Request, context: Context) {
  return api(async () => deleteKnowledgeBase((await context.params).id));
}
