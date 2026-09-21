// Volta do OpenRouter: troca o código pela chave e grava no banco cifrado.
import { setConfig } from "@/lib/store";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const cookie = req.headers.get("cookie") || "";
  const verifier = /(?:^|;\s*)or_verifier=([^;]+)/.exec(cookie)?.[1];
  const voltar = (erro?: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: erro ? `/configuracoes?erro=${encodeURIComponent(erro)}` : "/configuracoes?conectado=openrouter",
        "Set-Cookie": "or_verifier=; Path=/; Max-Age=0",
      },
    });
  if (!code || !verifier) return voltar("A conexão com o OpenRouter expirou. Tente de novo.");
  try {
    const r = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
      signal: AbortSignal.timeout(20000),
    });
    const data = r.ok ? ((await r.json()) as { key?: string }) : {};
    if (!data.key) return voltar("O OpenRouter não concluiu a conexão. Tente de novo.");
    setConfig("OPENROUTER_API_KEY", data.key);
    setConfig("JEV_CAMINHO", null);
    setConfig("JEV_ULTIMO_TESTE", null);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar("Falha ao concluir a conexão com o OpenRouter.");
  }
}
