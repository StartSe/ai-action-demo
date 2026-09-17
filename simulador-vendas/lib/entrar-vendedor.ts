// Identificação do vendedor por Google ou Microsoft (US-013): OAuth 2.0 Authorization Code com PKCE,
// no mesmo molde de app/api/setup/oauth/google. A diferença é o objetivo: aqui o app só quer **saber
// quem é a pessoa**, então o escopo é `openid email profile` (nunca gmail.send nem Mail.Send) e nada
// do provedor é guardado — nem access token, nem refresh token. O que sobrevive à chamada é o nome e
// o e-mail, que viram um participante (lib/participantes.ts).
//
// As credenciais são as mesmas do app (`GOOGLE_CLIENT_ID_APP` / `MICROSOFT_CLIENT_ID_APP`): quem opera
// a instância cadastra um único par por provedor, e o endereço de retorno é fixo (sem o código da
// simulação dentro), porque os dois provedores exigem `redirect_uri` registrado caractere a caractere.
// O código da simulação viaja no `state`, que volta intacto.
import { createHash, randomBytes } from "node:crypto";

export type ProvedorEntrada = "google" | "microsoft";

export const PROVEDORES: readonly ProvedorEntrada[] = ["google", "microsoft"];

const ESCOPO = "openid email profile";

const CONFIG = {
  google: {
    nome: "Google",
    autorizacao: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    idEnv: "GOOGLE_CLIENT_ID_APP",
    segredoEnv: "GOOGLE_CLIENT_SECRET_APP",
  },
  microsoft: {
    nome: "Microsoft",
    autorizacao: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    idEnv: "MICROSOFT_CLIENT_ID_APP",
    segredoEnv: "MICROSOFT_CLIENT_SECRET_APP",
  },
} as const;

export function nomeDoProvedor(provedor: ProvedorEntrada): string {
  return CONFIG[provedor].nome;
}

export function ehProvedor(valor: string): valor is ProvedorEntrada {
  return (PROVEDORES as readonly string[]).includes(valor);
}

export function credenciaisDoProvedor(provedor: ProvedorEntrada): { clientId: string; clientSecret: string } | null {
  const clientId = process.env[CONFIG[provedor].idEnv]?.trim();
  const clientSecret = process.env[CONFIG[provedor].segredoEnv]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Os botões só aparecem na tela quando as credenciais existem (D5): nada de botão que dá erro. */
export function provedoresDisponiveis(): ProvedorEntrada[] {
  return PROVEDORES.filter((p) => credenciaisDoProvedor(p) !== null);
}

export function callbackDe(base: string, provedor: ProvedorEntrada): string {
  return `${base}/api/salas/entrar/${provedor}/callback`;
}

/** O `state` leva o código da simulação: o endereço de retorno é um só para todos os treinos. */
export function montarState(codigo: string): { state: string; aleatorio: string } {
  const aleatorio = randomBytes(16).toString("base64url");
  return { state: `${aleatorio}.${codigo}`, aleatorio };
}

export function lerState(state: string): { aleatorio: string; codigo: string } | null {
  const ponto = state.indexOf(".");
  if (ponto <= 0 || ponto === state.length - 1) return null;
  return { aleatorio: state.slice(0, ponto), codigo: state.slice(ponto + 1) };
}

export function urlDeAutorizacao({
  provedor,
  base,
  state,
  verifier,
}: {
  provedor: ProvedorEntrada;
  base: string;
  state: string;
  verifier: string;
}): string | null {
  const credenciais = credenciaisDoProvedor(provedor);
  if (!credenciais) return null;

  const destino = new URL(CONFIG[provedor].autorizacao);
  destino.searchParams.set("client_id", credenciais.clientId);
  destino.searchParams.set("redirect_uri", callbackDe(base, provedor));
  destino.searchParams.set("response_type", "code");
  destino.searchParams.set("scope", ESCOPO);
  destino.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  destino.searchParams.set("code_challenge_method", "S256");
  destino.searchParams.set("state", state);
  // Quem treina costuma ter mais de uma conta no mesmo navegador (a pessoal e a da empresa):
  // escolher a conta é melhor do que entrar com a última usada sem perceber.
  destino.searchParams.set("prompt", "select_account");
  if (provedor === "microsoft") destino.searchParams.set("response_mode", "query");
  return destino.toString();
}

export function gerarVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export type IdentidadeVendedor = { nome: string; email: string };

/**
 * Troca o `code` pelo `id_token` e devolve só nome e e-mail.
 *
 * O `id_token` chega pelo canal do servidor, direto do provedor e por TLS — a assinatura não precisa
 * ser conferida contra a chave pública (é o que o próprio OpenID Connect dispensa no fluxo de código).
 * O que **precisa** ser conferido está aqui: `aud` (foi emitido para este app, não para outro),
 * `iss` (veio de quem dizemos que veio) e `exp` (não é um token antigo reaproveitado).
 */
export async function identificarPeloCodigo({
  provedor,
  base,
  code,
  verifier,
}: {
  provedor: ProvedorEntrada;
  base: string;
  code: string;
  verifier: string;
}): Promise<IdentidadeVendedor> {
  const credenciais = credenciaisDoProvedor(provedor);
  if (!credenciais) throw new ErroEntrada(`As credenciais ${provedor === "google" ? "do Google" : "da Microsoft"} deste app não estão definidas.`);

  const corpo = new URLSearchParams({
    code,
    client_id: credenciais.clientId,
    client_secret: credenciais.clientSecret,
    redirect_uri: callbackDe(base, provedor),
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  if (provedor === "microsoft") corpo.set("scope", ESCOPO);

  const r = await fetch(CONFIG[provedor].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo.toString(),
  });
  const dados = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!r.ok || !dados.id_token) {
    console.error(`${CONFIG[provedor].nome} não devolveu a identificação`, r.status, dados.error, dados.error_description);
    throw new ErroEntrada(`Não conseguimos confirmar sua conta ${CONFIG[provedor].nome}. Informe seu nome e e-mail para começar.`);
  }
  return lerIdToken(dados.id_token, { provedor, clientId: credenciais.clientId });
}

export class ErroEntrada extends Error {}

type Claims = { aud?: string | string[]; iss?: string; exp?: number; email?: string; name?: string; given_name?: string; preferred_username?: string };

function issAceitavel(provedor: ProvedorEntrada, iss: string): boolean {
  if (provedor === "google") return iss === "https://accounts.google.com" || iss === "accounts.google.com";
  // O endpoint `common` emite em nome do tenant de quem entrou, então o emissor muda de pessoa para
  // pessoa: o que é fixo é o domínio da Microsoft e o sufixo de versão.
  return /^https:\/\/login\.microsoftonline\.com\/[^/]+\/v2\.0$/.test(iss) || /^https:\/\/sts\.windows\.net\/[^/]+\/$/.test(iss);
}

export function lerIdToken(idToken: string, { provedor, clientId }: { provedor: ProvedorEntrada; clientId: string }): IdentidadeVendedor {
  const partes = idToken.split(".");
  if (partes.length !== 3) throw new ErroEntrada("Não conseguimos ler sua identificação. Informe seu nome e e-mail para começar.");

  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Claims;
  } catch (err) {
    console.error("id_token com conteúdo ilegível", err);
    throw new ErroEntrada("Não conseguimos ler sua identificação. Informe seu nome e e-mail para começar.");
  }

  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) {
    console.error("id_token com aud de outro app", claims.aud);
    throw new ErroEntrada("Sua identificação não confere. Informe seu nome e e-mail para começar.");
  }
  if (!claims.iss || !issAceitavel(provedor, claims.iss)) {
    console.error("id_token com emissor inesperado", claims.iss);
    throw new ErroEntrada("Sua identificação não confere. Informe seu nome e e-mail para começar.");
  }
  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    console.error("id_token expirado", claims.exp);
    throw new ErroEntrada("Sua identificação expirou. Tente entrar de novo.");
  }

  const email = (claims.email || claims.preferred_username || "").trim().toLowerCase();
  if (!email.includes("@")) {
    console.error("id_token sem e-mail utilizável");
    throw new ErroEntrada(`Sua conta ${CONFIG[provedor].nome} não informou um e-mail. Informe seu nome e e-mail para começar.`);
  }
  // Sem nome (acontece em conta corporativa recém-criada), a parte antes do @ é melhor do que vazio:
  // o gestor precisa reconhecer quem treinou na lista dele.
  const nome = (claims.name || claims.given_name || "").trim() || email.split("@")[0];
  return { nome, email };
}
