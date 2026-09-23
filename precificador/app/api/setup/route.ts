import { INTEGRACOES } from "@/lib/integracoes";
import { statusIntegracoes } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await statusIntegracoes(INTEGRACOES));
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
  return Response.json({ salvos, ...(await statusIntegracoes(INTEGRACOES)) });
}
