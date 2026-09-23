// Início do "Conectar com a Netlify" (fluxo implícito do OAuth da Netlify): só existe quando a equipe técnica
// registrou um aplicativo OAuth lá e definiu NETLIFY_CLIENT_ID_APP. Redireciona para a autorização; a Netlify
// volta para /setup/netlify com a chave no fragmento da URL (#access_token=...), que a página grava via
// PUT /api/setup. O `state` vai num cookie de curta duração e é conferido pela página antes de gravar.
import crypto from "node:crypto";
import { CLIENT_ID_NETLIFY_APP } from "@/lib/netlify";
import { baseUrl } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const clientId = process.env[CLIENT_ID_NETLIFY_APP]?.trim();
  if (!clientId) {
    return new Response(null, { status: 302, headers: { Location: `/setup?erro=${encodeURIComponent("A conexão em um clique com a Netlify não está disponível nesta instalação. Cole uma chave de acesso pessoal.")}` } });
  }
  const state = crypto.randomBytes(16).toString("base64url");
  const destino = new URL("https://app.netlify.com/authorize");
  destino.searchParams.set("response_type", "token");
  destino.searchParams.set("client_id", clientId);
  destino.searchParams.set("redirect_uri", `${baseUrl(req)}/setup/netlify`);
  destino.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: { Location: destino.toString(), "Set-Cookie": `netlify_state=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax` },
  });
}

/** Desconectar: apaga a chave salva (o cartão chama PUT na mesma URL do OAuth, como faz com servidores MCP). */
export async function PUT() {
  const { setConfig } = await import("@/lib/store");
  const { CHAVE_NETLIFY } = await import("@/lib/netlify");
  setConfig(CHAVE_NETLIFY, null);
  return Response.json({ ok: true });
}
