import { api, body } from "@/lib/api";
import { executarTurno, limparConversa, listarMensagens } from "@/lib/conversa";
import { obterPlanilha } from "@/lib/planilhas";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Params) {
  return api(async () => {
    const { id } = await params;
    obterPlanilha(id);
    return { mensagens: listarMensagens(id) };
  });
}
export async function POST(req: Request, { params }: Params) {
  return api(async () => {
    const { id } = await params;
    const b = await body(req);
    return executarTurno(id, b.pergunta, req.signal);
  });
}
export async function DELETE(_: Request, { params }: Params) {
  return api(async () => {
    const { id } = await params;
    obterPlanilha(id);
    limparConversa(id);
    return { ok: true };
  });
}
