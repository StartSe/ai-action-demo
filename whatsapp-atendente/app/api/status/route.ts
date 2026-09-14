import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

// Informa ao frontend se a IA e o WhatsApp estão conectados (para exibir avisos de modo demonstração).
function whatsappConectado(): boolean {
  return Boolean(getConfig("WHATSAPP_TOKEN") && getConfig("WHATSAPP_PHONE_NUMBER_ID"));
}

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    vision: visionEnabled(),
    integrations: { whatsapp: whatsappConectado() },
    setup: { pronto, url: "/setup" },
  });
}
