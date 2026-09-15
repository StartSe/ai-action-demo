// Volta da Microsoft (US-034): confere o state, troca o code (com o verificador PKCE e o client_secret do
// app) pelo código de renovação, descobre a conta conectada (/me no Graph) e grava OUTLOOK_REFRESH_TOKEN
// e OUTLOOK_CONTA.
import { credenciaisDoApp, ESCOPO_OUTLOOK, limparCache, obterPerfilOutlookComToken } from "@/lib/email";
import { baseUrl } from "@/lib/setup-comum";
import { setConfig } from "@/lib/store";

const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function lerCookie(cookie: string, nome: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`).exec(cookie)?.[1];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = baseUrl(req);
  const cookie = req.headers.get("cookie") || "";
  const verifier = lerCookie(cookie, "ms_verifier");
  const stateEsperado = lerCookie(cookie, "ms_state");

  const voltar = (erro?: string) => {
    const headers = new Headers({ Location: erro ? `${base}/setup?erro=${encodeURIComponent(erro)}` : `${base}/setup?conectado=outlook` });
    headers.append("Set-Cookie", "ms_verifier=; Path=/; Max-Age=0");
    headers.append("Set-Cookie", "ms_state=; Path=/; Max-Age=0");
    return new Response(null, { status: 302, headers });
  };

  const erroMicrosoft = url.searchParams.get("error");
  if (erroMicrosoft) {
    const descricao = url.searchParams.get("error_description") || "";
    if (erroMicrosoft === "access_denied" && /AADSTS65004|declined|cancel/i.test(descricao)) return voltar("Você não autorizou o acesso ao Outlook. Nada foi conectado.");
    if (erroMicrosoft === "access_denied") return voltar("Você não autorizou o acesso ao Outlook, ou a empresa exige que um administrador aprove o app antes. Nada foi conectado.");
    if (erroMicrosoft === "consent_required" || erroMicrosoft === "interaction_required") return voltar("A Microsoft pediu uma aprovação adicional. Tente conectar de novo; se persistir, peça a um administrador da empresa para aprovar o app.");
    return voltar(`A Microsoft recusou a conexão: ${erroMicrosoft}.`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !verifier || !state || !stateEsperado || state !== stateEsperado) {
    return voltar("A conexão com o Outlook expirou. Tente de novo.");
  }

  const credenciais = credenciaisDoApp("outlook");
  if (!credenciais) return voltar("As credenciais da Microsoft deste app não estão definidas.");

  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credenciais.clientId,
        client_secret: credenciais.clientSecret,
        redirect_uri: `${base}/api/setup/oauth/microsoft/callback`,
        grant_type: "authorization_code",
        code_verifier: verifier,
        scope: ESCOPO_OUTLOOK,
      }).toString(),
    });
    const dados = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
    if (!r.ok || !dados.access_token) {
      console.error("Microsoft não devolveu o acesso", r.status, dados.error, dados.error_description);
      return voltar(`A Microsoft não concluiu a conexão (HTTP ${r.status}${dados.error ? `, ${dados.error}` : ""}). Confira as credenciais, o endereço de retorno cadastrado e se o registro aceita contas de qualquer organização.`);
    }
    if (!dados.refresh_token) {
      return voltar("A Microsoft não devolveu o código de renovação. Confira se o escopo offline_access está permitido no registro do app e conecte de novo.");
    }

    const perfil = await obterPerfilOutlookComToken(dados.access_token);
    limparCache("outlook");
    setConfig("OUTLOOK_REFRESH_TOKEN", dados.refresh_token);
    setConfig("OUTLOOK_CONTA", perfil.emailAddress);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar(err instanceof Error ? err.message : "Falha ao concluir a conexão com o Outlook.");
  }
}
