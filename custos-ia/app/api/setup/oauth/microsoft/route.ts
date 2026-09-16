// Início da conexão com o Outlook / Microsoft 365 (US-034): OAuth 2.0 Authorization Code com PKCE contra
// o Entra ID (login.microsoftonline.com/common — qualquer conta corporativa ou pessoal Microsoft), no
// mesmo molde de app/api/setup/oauth/google. Gera verificador e state, guarda em cookie e redireciona
// pedindo leitura das notas e envio do fechamento (ESCOPO_OUTLOOK, em lib/email.ts), código de
// renovação (offline_access) e a conta (User.Read). As credenciais vêm de credenciaisDoApp: as da
// suíte primeiro (MICROSOFT_CLIENT_ID_APP/MICROSOFT_CLIENT_SECRET_APP), depois um registro próprio.
import { createHash, randomBytes } from "node:crypto";
import { credenciaisDoApp, ESCOPO_OUTLOOK } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";

const AUTORIZACAO_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

export async function GET(req: Request) {
  const base = baseUrl(req);
  const credenciais = credenciaisDoApp("outlook");
  if (!credenciais) {
    const erro = "Este app ainda não tem as credenciais da Microsoft. Peça à equipe técnica para defini-las (veja \"Para a equipe técnica\" no cartão do Outlook).";
    return new Response(null, { status: 302, headers: { Location: `${base}/setup?erro=${encodeURIComponent(erro)}` } });
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const callback = `${base}/api/setup/oauth/microsoft/callback`;

  const destino = new URL(AUTORIZACAO_URL);
  destino.searchParams.set("client_id", credenciais.clientId);
  destino.searchParams.set("redirect_uri", callback);
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("response_mode", "query");
  destino.searchParams.set("scope", ESCOPO_OUTLOOK);
  destino.searchParams.set("prompt", "select_account");
  destino.searchParams.set("code_challenge", challenge);
  destino.searchParams.set("code_challenge_method", "S256");
  destino.searchParams.set("state", state);

  const seguro = callback.startsWith("https") ? "; Secure" : "";
  const headers = new Headers({ Location: destino.toString() });
  headers.append("Set-Cookie", `ms_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
  headers.append("Set-Cookie", `ms_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
  return new Response(null, { status: 302, headers });
}
