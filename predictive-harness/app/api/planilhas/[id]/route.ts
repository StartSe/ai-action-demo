import { api } from "@/lib/api";
import { obterPlanilha, removerPlanilha } from "@/lib/planilhas";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Params) {
  return api(async () => ({ planilha: obterPlanilha((await params).id) }));
}
export async function DELETE(_: Request, { params }: Params) {
  return api(async () => {
    removerPlanilha((await params).id);
    return { ok: true };
  });
}
