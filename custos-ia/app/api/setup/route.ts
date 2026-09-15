import { COM_CARTAO_PROPRIO, INTEGRACOES } from "@/lib/integracoes";
import { statusIntegracoes } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Gmail e Outlook têm cartão próprio em /setup (components/ConectarEmail.tsx: mostra a conta conectada e
 * as instruções para a equipe técnica, que o cartão genérico não suporta), por isso saem da lista genérica.
 * Continuam em INTEGRACOES para o PUT abaixo, o teste de conexão e o /api/status. */
const GENERICAS = INTEGRACOES.filter((i) => !COM_CARTAO_PROPRIO.some((p) => p.id === i.id));

export async function GET() {
  return Response.json(await statusIntegracoes(GENERICAS));
}

/** Salva valores. Chave com valor "" é ignorada (mantém o atual); null apaga. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { valores?: Record<string, string | null> };
  const permitidas = new Set(INTEGRACOES.flatMap((i) => i.campos.map((c) => c.chave)));
  const valores = body.valores || {};
  let salvos = 0;
  for (const [chave, valor] of Object.entries(valores)) {
    if (!permitidas.has(chave)) continue;
    if (valor === "") continue;
    setConfig(chave, valor);
    salvos++;
  }
  return Response.json({ salvos, ...(await statusIntegracoes(GENERICAS)) });
}
