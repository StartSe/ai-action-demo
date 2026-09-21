import { aiEnabled, aiProvider, modelName, visionEnabled } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const ai = await aiEnabled();
  const integrations = Object.fromEntries(
    INTEGRACOES.map((i) => [i.id, integracaoConfigurada(i)]),
  );
  if (aiProvider() === "chatgpt") integrations.chatgpt = ai;
  return Response.json(
    {
      ai,
      demo: !ai,
      model: modelName(),
      vision: visionEnabled(),
      integrations,
      setup: { pronto: ai, url: "/setup" },
      usuario: sessaoAtual(req),
      proximos: ai
        ? []
        : [
            {
              id: "ia",
              titulo: "Conectar IA",
              beneficio: "Use ChatGPT ou OpenRouter nos seus agentes",
              url: "/setup#integracoes",
            },
          ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
