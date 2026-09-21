// Recálculo local de uma resposta do motor: troca premissas, roda só o motor, sem chamada de IA.
import { api, body, string } from "@/lib/api";
import { recalcularMensagem } from "@/lib/conversa";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    return { mensagem: recalcularMensagem(string(b.mensagemId, 80), b.ajustes, b.salvar === true) };
  });
}
