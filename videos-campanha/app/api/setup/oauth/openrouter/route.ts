// Início do fluxo PKCE do OpenRouter: gera o verificador, guarda em cookie e redireciona.
import { createHash, randomBytes } from "node:crypto";
import { baseUrl } from "@/lib/setup-comum";

export async function GET(req: Request) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const callback = `${baseUrl(req)}/api/setup/oauth/openrouter/callback`;
  const destino = new URL("https://openrouter.ai/auth");
  destino.searchParams.set("callback_url", callback);
  destino.searchParams.set("code_challenge", challenge);
  destino.searchParams.set("code_challenge_method", "S256");
  const seguro = callback.startsWith("https") ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: destino.toString(),
      "Set-Cookie": `or_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${seguro}`,
    },
  });
}
