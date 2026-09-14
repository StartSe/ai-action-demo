import { aiEnabled, modelName, visionEnabled } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { integracaoConfigurada } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

function apolloEnabled() {
  return Boolean(getConfig("APOLLO_API_KEY"));
}

function brightdataEnabled() {
  return Boolean(getConfig("BRIGHTDATA_API_KEY") && getConfig("BRIGHTDATA_ZONE"));
}

export async function GET() {
  const pronto = INTEGRACOES.filter((i) => i.obrigatoria).every(integracaoConfigurada);
  return Response.json({
    ai: aiEnabled(),
    demo: !aiEnabled(),
    model: modelName(),
    vision: visionEnabled(),
    integrations: { apollo: apolloEnabled(), brightdata: brightdataEnabled() },
    setup: { pronto, url: "/setup" },
  });
}
