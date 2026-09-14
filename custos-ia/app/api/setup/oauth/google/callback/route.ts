// Volta do Google (US-021): confere o state, troca o code (com o verificador PKCE e o client_secret do
// app) pelo código de renovação, descobre a conta conectada e grava GMAIL_REFRESH_TOKEN e GMAIL_CONTA.
import { credenciaisDoApp, limparCache, obterPerfilComToken } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function lerCookie(cookie: string, nome: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`).exec(cookie)?.[1];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = baseUrl(req);
  const cookie = req.headers.get("cookie") || "";
  const verifier = lerCookie(cookie, "gm_verifier");
  const stateEsperado = lerCookie(cookie, "gm_state");

  const voltar = (erro?: string) => {
    const headers = new Headers({ Location: erro ? `${base}/setup?erro=${encodeURIComponent(erro)}` : `${base}/setup?conectado=gmail` });
    headers.append("Set-Cookie", "gm_verifier=; Path=/; Max-Age=0");
    headers.append("Set-Cookie", "gm_state=; Path=/; Max-Age=0");
    return new Response(null, { status: 302, headers });
  };

  const erroGoogle = url.searchParams.get("error");
  if (erroGoogle) {
    return voltar(erroGoogle === "access_denied" ? "Você não autorizou o acesso ao Gmail. Nada foi conectado." : `O Google recusou a conexão: ${erroGoogle}.`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !verifier || !state || !stateEsperado || state !== stateEsperado) {
    return voltar("A conexão com o Gmail expirou. Tente de novo.");
  }

  const credenciais = credenciaisDoApp();
  if (!credenciais) return voltar("As credenciais do Google deste app não estão definidas.");

  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credenciais.clientId,
        client_secret: credenciais.clientSecret,
        redirect_uri: `${base}/api/setup/oauth/google/callback`,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    });
    const dados = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
    if (!r.ok || !dados.access_token) {
      console.error("Google não devolveu o acesso", r.status, dados.error, dados.error_description);
      return voltar(`O Google não concluiu a conexão (HTTP ${r.status}${dados.error ? `, ${dados.error}` : ""}). Confira as credenciais e o endereço de retorno cadastrado.`);
    }
    if (!dados.refresh_token) {
      return voltar("O Google não devolveu o código de renovação. Remova o acesso deste app em myaccount.google.com/permissions e conecte de novo.");
    }

    const perfil = await obterPerfilComToken(dados.access_token);
    limparCache();
    setConfig("GMAIL_REFRESH_TOKEN", dados.refresh_token);
    setConfig("GMAIL_CONTA", perfil.emailAddress);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar(err instanceof Error ? err.message : "Falha ao concluir a conexão com o Gmail.");
  }
}
