import { api, body } from "@/lib/flow-api";
import { createKnowledgeBase, listKnowledgeBases } from "@/lib/knowledge-store";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => listKnowledgeBases());
}
export async function POST(req: Request) {
  return api(async () => createKnowledgeBase(await body(req)));
}
