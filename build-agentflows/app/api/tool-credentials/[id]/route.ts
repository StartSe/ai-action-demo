import { api, body } from "@/lib/flow-api";
import { deleteToolCredential, getToolCredential, saveToolCredential } from "@/lib/tool-credential-store";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export async function GET(_req: Request, c: Context) { return api(async () => getToolCredential((await c.params).id)); }
export async function PUT(req: Request, c: Context) { return api(async () => saveToolCredential(await body(req), (await c.params).id)); }
export async function DELETE(_req: Request, c: Context) { return api(async () => { deleteToolCredential((await c.params).id); return { ok: true }; }); }
