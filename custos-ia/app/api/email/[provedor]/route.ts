// Estado da conexão de uma caixa de e-mail (gmail | outlook) para os cartões próprios de /setup
// (components/ConectarEmail.tsx): GET informa conta conectada, se as credenciais do app existem e o
// endereço de retorno que a equipe técnica precisa cadastrar (Google Cloud ou Entra ID); DELETE
// desconecta (apaga o código de renovação e a conta; no Google, pede também a revogação).
import { chavesDoProvedor, contaConectada, credenciaisDoApp, desconectar, provedorConectado, provedorValido } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";
import { origemConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

const ROTA_OAUTH = { gmail: "google", outlook: "microsoft" } as const;

type Params = { params: Promise<{ provedor: string }> };

export async function GET(req: Request, { params }: Params) {
  const { provedor } = await params;
  if (!provedorValido(provedor)) return Response.json({ error: "Caixa desconhecida. Use gmail ou outlook." }, { status: 404 });
  return Response.json({
    provedor,
    conectado: provedorConectado(provedor),
    conta: contaConectada(provedor) ?? null,
    credenciaisDoApp: Boolean(credenciaisDoApp(provedor)),
    credenciaisNoAmbiente: origemConfig(chavesDoProvedor(provedor).clientId) === "env",
    redirectUri: `${baseUrl(req)}/api/setup/oauth/${ROTA_OAUTH[provedor]}/callback`,
    oauthUrl: `/api/setup/oauth/${ROTA_OAUTH[provedor]}`,
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { provedor } = await params;
  if (!provedorValido(provedor)) return Response.json({ error: "Caixa desconhecida. Use gmail ou outlook." }, { status: 404 });
  await desconectar(provedor);
  return Response.json({ ok: true });
}
