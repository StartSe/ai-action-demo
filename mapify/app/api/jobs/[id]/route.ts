import { api } from "@/lib/api";
import { readJob, cancelJob } from "@/lib/generation";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  return api(async () => readJob((await ctx.params).id));
}
export async function DELETE(_req: Request, ctx: Context) {
  return api(async () => cancelJob((await ctx.params).id));
}
