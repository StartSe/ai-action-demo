// Volta da Microsoft (US-024): confere o state, troca o code (PKCE + client_secret do app) pelo código de
// renovação, descobre a conta conectada (/me no Graph) e grava OUTLOOK_REFRESH_TOKEN e OUTLOOK_CONTA.
// Nenhuma mensagem devolvida à tela expõe status HTTP cru nem o corpo do provedor.
import { credenciaisDoApp, ESCOPO_OUTLOOK, limparCache, obterPerfilOutlook } from "@/lib/email-envio";
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
    console.error("Microsoft recusou a conexão", erroMicrosoft, url.searchParams.get("error_description"));
    if (erroMicrosoft === "access_denied") return voltar("Você não autorizou o acesso ao Outlook, ou a empresa exige aprovação de um administrador. Nada foi conectado.");
    if (erroMicrosoft === "consent_required" || erroMicrosoft === "interaction_required") return voltar("A Microsoft pediu uma aprovação adicional. Tente conectar de novo; se persistir, peça a um administrador da empresa para aprovar o app.");
    return voltar("A Microsoft recusou a conexão. Tente de novo.");
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
      return voltar("A Microsoft não concluiu a conexão. Confira as credenciais, o endereço de retorno cadastrado e se o registro aceita contas de qualquer organização.");
    }
    if (!dados.refresh_token) {
      return voltar("A Microsoft não devolveu o código de renovação. Confira se o escopo offline_access está permitido no registro do app e conecte de novo.");
    }

    const conta = await obterPerfilOutlook(dados.access_token);
    limparCache("outlook");
    setConfig("OUTLOOK_REFRESH_TOKEN", dados.refresh_token);
    setConfig("OUTLOOK_CONTA", conta);
    return voltar();
  } catch (err) {
    console.error(err);
    return voltar("Falha ao concluir a conexão com o Outlook.");
  }
}
