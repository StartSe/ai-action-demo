import { api } from "@/lib/api";
import { reclassificarPlanilha } from "@/lib/planilhas";
export const dynamic = "force-dynamic";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => ({ planilha: await reclassificarPlanilha((await params).id) }));
}
