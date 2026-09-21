// A conversa é da base inteira: lista, envia uma pergunta ao laço do harness ou limpa.
import { api, body } from "@/lib/api";
import { executarTurno, limparConversa, listarMensagens } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => ({ mensagens: listarMensagens() }));
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    return executarTurno(b.pergunta, req.signal);
  });
}
export async function DELETE() {
  return api(() => {
    limparConversa();
    return { ok: true };
  });
}
