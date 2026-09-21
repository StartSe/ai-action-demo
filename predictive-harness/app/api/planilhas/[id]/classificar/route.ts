import { api } from "@/lib/api";
import { reclassificarPlanilha } from "@/lib/planilhas";
import { sugestoesIniciais } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const p = await reclassificarPlanilha((await params).id);
    return { planilha: { ...p, sugestoes: sugestoesIniciais(p) } };
  });
}
