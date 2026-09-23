// A conversa é da base inteira: lista, envia uma pergunta ao laço do harness ou limpa.
import { comConversa, titularConversa } from "@/lib/sessoes";
import { api, body, string } from "@/lib/api";
import { executarTurno, limparConversa, listarMensagens } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => comConversa(new URL(req.url).searchParams.get("conversa") || "base", () => ({ mensagens: listarMensagens() })));
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    const id = string(b.conversaId, 80) || "base";
    const r = await comConversa(id, () => executarTurno(b.pergunta, req.signal));
    titularConversa(id, r.pergunta.texto);
    return r;
  });
}
export async function DELETE(req: Request) {
  return api(() => {
    comConversa(new URL(req.url).searchParams.get("conversa") || "base", limparConversa);
    return { ok: true };
  });
}
