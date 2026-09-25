import { migrateKnowledgeCredentials } from "@/lib/knowledge-store";
import { api, body } from "@/lib/flow-api";
import { listToolCredentials, saveToolCredential } from "@/lib/tool-credential-store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { return api(() => { migrateKnowledgeCredentials(); return listToolCredentials(new URL(req.url).searchParams.get("provider") || undefined); }); }
export async function POST(req: Request) { return api(async () => saveToolCredential(await body(req))); }
