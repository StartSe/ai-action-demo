import { api } from "@/lib/flow-api";
import { knowledgeSourceBody } from "@/lib/knowledge-api";
import {
  getKnowledgeSource,
  listKnowledgeChunks,
  saveKnowledgeSource,
} from "@/lib/knowledge-store";
import {
  processKnowledgeSource,
  removeKnowledgeSource,
} from "@/lib/knowledge-index";
type Context = { params: Promise<{ id: string; sourceId: string }> };
export const maxDuration = 600;
export async function GET(req: Request, context: Context) {
  return api(async () => {
    const { id, sourceId } = await context.params;
    const source = getKnowledgeSource(id, sourceId);
    const search = new URL(req.url).searchParams;
    const page = Math.max(1, Number(search.get("page")) || 1);
    const term = (search.get("search") || "").toLowerCase();
    const chunks = listKnowledgeChunks(id, sourceId).filter((c) =>
      (c.pageContent + JSON.stringify(c.metadata)).toLowerCase().includes(term),
    );
    return {
      source,
      chunks: chunks.slice((page - 1) * 20, page * 20),
      total: chunks.length,
      page,
    };
  });
}
export async function PUT(req: Request, context: Context) {
  return api(async () => {
    const { id, sourceId } = await context.params;
    const { input, files } = await knowledgeSourceBody(req);
    return saveKnowledgeSource(id, input, files, sourceId);
  });
}
export async function POST(_req: Request, context: Context) {
  return api(async () => {
    const { id, sourceId } = await context.params;
    return processKnowledgeSource(id, sourceId);
  });
}
export async function DELETE(_req: Request, context: Context) {
  return api(async () => {
    const { id, sourceId } = await context.params;
    return removeKnowledgeSource(id, sourceId);
  });
}
