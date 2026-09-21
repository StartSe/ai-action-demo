// Formato da suíte: { ai, demo, model, integrations, setup }. `ai` é a conversa pronta; o harness
// (Jev) aparece em integrations.
import { api } from "@/lib/api";
import { statusConexoes } from "@/lib/conexoes";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const s = await statusConexoes();
    return {
      ai: s.conversaPronta,
      demo: !s.harnessPronto,
      model: s.conversaPronta ? (s.provider === "chatgpt" ? `chatgpt:${s.model || "auto"}` : `openrouter:${s.model || "auto"}`) : null,
      integrations: { chatgpt: s.chatgpt.conectado, openrouter: s.openrouter.conectado, jev: s.jev.disponivel },
      harness: s.harnessPronto,
      setup: { pronto: s.harnessPronto, url: "/configuracoes" },
    };
  });
}
