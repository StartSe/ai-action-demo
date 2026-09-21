import { aiEnabled } from "@/lib/ai";
import { INTEGRACOES } from "@/lib/integracoes";
import { statusIntegracoes } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Divergência registrada em scripts/padrao-excecoes.json: `pronto` usa a conta de IA escolhida (OpenRouter
 * ou ChatGPT, lib/ai.ts:aiEnabled), sem exigir chave do OpenRouter quando a conta ChatGPT está conectada. */
export async function GET() {
  return Response.json({ ...(await statusIntegracoes(INTEGRACOES)), pronto: await aiEnabled() });
}

/** Salva valores. Chave com valor "" é ignorada (mantém o atual); null apaga. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { valores?: Record<string, string | null> };
  const permitidas = new Set(INTEGRACOES.flatMap((i) => i.campos.map((c) => c.chave)));
  permitidas.add("APP_URL");
  const valores = body.valores || {};
  let salvos = 0;
  for (const [chave, valor] of Object.entries(valores)) {
    if (!permitidas.has(chave)) continue;
    if (valor === "") continue;
    setConfig(chave, valor);
    salvos++;
  }
  return Response.json({ salvos, ...(await statusIntegracoes(INTEGRACOES)), pronto: await aiEnabled() });
}
