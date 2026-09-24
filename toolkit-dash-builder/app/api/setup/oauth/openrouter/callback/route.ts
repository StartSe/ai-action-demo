// Volta do OpenRouter: troca o código pela chave e grava no banco.
import { setConfig } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const cookie = req.headers.get("cookie") || "";
  const verifier = /(?:^|;\s*)or_verifier=([^;]+)/.exec(cookie)?.[1];
  const voltar = (erro?: string) => new Response(null, { status: 302, headers: { Location: erro ? `/setup?erro=${encodeURIComponent(erro)}` : "/setup?conectado=openrouter", "Set-Cookie": "or_verifier=; Path=/; Max-Age=0" } });
  if (!code || !verifier) return voltar("A conexão com o OpenRouter expirou. Tente de novo.");
  try {
    const r = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    if (!r.ok) {
      console.error("O OpenRouter não devolveu a chave:", r.status, await r.text().catch(() => ""));
      return voltar("O OpenRouter não concluiu a conexão. Tente de novo; se repetir, cole a chave manualmente em Opções avançadas.");
    }
    const data = (await r.json()) as { key?: string };
    if (!data.key) return voltar("O OpenRouter não concluiu a conexão. Tente de novo; se repetir, cole a chave manualmente em Opções avançadas.");
    setConfig("OPENROUTER_API_KEY", data.key);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar("Falha ao concluir a conexão com o OpenRouter.");
  }
}
