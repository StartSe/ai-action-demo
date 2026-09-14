// Estado da conexão com o Gmail para o cartão próprio de /setup (components/ConectarGmail.tsx):
// GET informa conta conectada, se as credenciais do app existem e o endereço de retorno que a equipe
// técnica precisa cadastrar no Google Cloud; DELETE desconecta (apaga o código de renovação e a conta
// e pede a revogação ao Google).
import { contaConectada, credenciaisDoApp, desconectarGmail, gmailConectado } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";
import { origemConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({
    conectado: gmailConectado(),
    conta: contaConectada() ?? null,
    credenciaisDoApp: Boolean(credenciaisDoApp()),
    credenciaisNoAmbiente: origemConfig("GOOGLE_CLIENT_ID") === "env",
    redirectUri: `${baseUrl(req)}/api/setup/oauth/google/callback`,
  });
}

export async function DELETE() {
  await desconectarGmail();
  return Response.json({ ok: true });
}
