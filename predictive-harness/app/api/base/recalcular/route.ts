// Recálculo local de uma resposta do motor: troca premissas, roda só o motor, sem chamada de IA.
import { comConversa } from "@/lib/sessoes";
import { api, body, string } from "@/lib/api";
import { recalcularMensagem } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    return comConversa(string(b.conversaId, 80) || "base", () => ({ mensagem: recalcularMensagem(string(b.mensagemId, 80), b.ajustes, b.salvar === true) }));
  });
}
