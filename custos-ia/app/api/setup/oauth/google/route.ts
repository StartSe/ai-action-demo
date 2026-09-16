// Início da conexão com o Gmail (US-021): OAuth 2.0 Authorization Code com PKCE, no mesmo molde de
// app/api/setup/oauth/openrouter. Gera verificador e state, guarda em cookie e redireciona para o Google
// pedindo leitura das notas e envio do fechamento (ESCOPO_GMAIL, em lib/email.ts), acesso offline
// (código de renovação) e consentimento explícito (prompt=consent garante que o código de renovação
// venha mesmo em reconexões). As credenciais vêm de credenciaisDoApp: as da suíte primeiro
// (GOOGLE_CLIENT_ID_APP/GOOGLE_CLIENT_SECRET_APP), depois um registro próprio da empresa.
import { createHash, randomBytes } from "node:crypto";
import { credenciaisDoApp, ESCOPO_GMAIL } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";

const AUTORIZACAO_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export async function GET(req: Request) {
  const base = baseUrl(req);
  const credenciais = credenciaisDoApp("gmail");
  if (!credenciais) {
    const erro = "Este app ainda não tem as credenciais do Google. Peça à equipe técnica para defini-las (veja \"Para a equipe técnica\" no cartão do Gmail).";
    return new Response(null, { status: 302, headers: { Location: `${base}/setup?erro=${encodeURIComponent(erro)}` } });
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const callback = `${base}/api/setup/oauth/google/callback`;

  const destino = new URL(AUTORIZACAO_URL);
  destino.searchParams.set("client_id", credenciais.clientId);
  destino.searchParams.set("redirect_uri", callback);
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("scope", ESCOPO_GMAIL);
  destino.searchParams.set("access_type", "offline");
  destino.searchParams.set("prompt", "consent");
  destino.searchParams.set("code_challenge", challenge);
  destino.searchParams.set("code_challenge_method", "S256");
  destino.searchParams.set("state", state);

  const seguro = callback.startsWith("https") ? "; Secure" : "";
  const headers = new Headers({ Location: destino.toString() });
  headers.append("Set-Cookie", `gm_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
  headers.append("Set-Cookie", `gm_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`);
  return new Response(null, { status: 302, headers });
}
