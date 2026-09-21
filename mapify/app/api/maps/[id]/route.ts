import { api, body, AppError } from "@/lib/api";
import { getMap, saveMap, deleteMap } from "@/lib/maps";
import type { MindNode } from "@/lib/types";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Context) {
  return api(async () => getMap((await ctx.params).id));
}
export async function PUT(req: Request, ctx: Context) {
  return api(async () => {
    const b = await body(req);
    if (typeof b.revision !== "number")
      throw new AppError("Recarregue o mapa antes de salvar.");
    return saveMap(
      (await ctx.params).id,
      {
        title: typeof b.title === "string" ? b.title : undefined,
        root: b.root as MindNode | undefined,
        favorite: typeof b.favorite === "boolean" ? b.favorite : undefined,
      },
      b.revision,
    );
  });
}
export async function DELETE(_req: Request, ctx: Context) {
  return api(async () => deleteMap((await ctx.params).id));
}
