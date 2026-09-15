import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { sessaoAtual } from "@/lib/conta";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  const usuario = sessaoAtual(req);
  return Response.json({ ai: aiEnabled(), demo: !aiEnabled(), model: modelName(), vision: visionEnabled(), integrations: {}, setup: { pronto, url: "/setup" }, usuario });
}
