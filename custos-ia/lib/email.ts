// Leitura da caixa do Gmail conectada em /setup (US-021): lista as mensagens que parecem cobranças
// e devolve cada uma já com assunto, remetente, corpo em texto e anexos PDF em memória, para
// app/api/faturas/importar passar tudo por lib/leitor.ts. Só leitura (escopo gmail.readonly); nada
// aqui grava fatura nem guarda o corpo dos e-mails — quem grava é lib/faturas.ts, e só a Fatura.
//
// Credenciais: o client_id/client_secret do app vêm de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (env ou
// /setup, via lib/store.ts). O código de renovação da pessoa (GMAIL_REFRESH_TOKEN) e a conta conectada
// (GMAIL_CONTA) são gravados pelo callback OAuth em app/api/setup/oauth/google/callback.
import { getConfig, setConfig } from "./store";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Escopo pedido na autorização: leitura da caixa, nada de envio ou exclusão. */
export const ESCOPO_GMAIL = "https://www.googleapis.com/auth/gmail.readonly";

/** Anexos maiores que isso não são baixados (mesmo limite do upload manual). */
const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024;
/** Quantos PDFs por mensagem vale a pena ler — uma nota raramente vem em mais de um arquivo. */
const MAXIMO_ANEXOS_POR_MENSAGEM = 3;
/** Página máxima aceita por users.messages.list. */
const PAGINA_MAXIMA = 500;
/** Tentativas depois de um 429/503 antes de desistir da chamada. */
const MAXIMO_TENTATIVAS = 4;

/** Erro previsível do Gmail (conexão expirada, cota, credenciais), com mensagem pronta para a tela. */
export class ErroGmail extends Error {}

export type CredenciaisApp = { clientId: string; clientSecret: string };

/** client_id/client_secret do app (Google Cloud), ou null quando a equipe técnica ainda não os definiu. */
export function credenciaisDoApp(): CredenciaisApp | null {
  const clientId = getConfig("GOOGLE_CLIENT_ID");
  const clientSecret = getConfig("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function gmailConectado(): boolean {
  return Boolean(getConfig("GMAIL_REFRESH_TOKEN"));
}

export function contaConectada(): string | undefined {
  return getConfig("GMAIL_CONTA");
}

// ---------------------------------------------------------------------------------------------
// Access token: renovado pelo código de renovação e guardado só em memória até expirar.
// ---------------------------------------------------------------------------------------------

let cache: { token: string; expiraEm: number; refresh: string } | null = null;

export function limparCache(): void {
  cache = null;
}

type RespostaToken = { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };

async function renovarAccessToken(refresh: string): Promise<string> {
  const credenciais = credenciaisDoApp();
  if (!credenciais) throw new ErroGmail("As credenciais do Google deste app não estão definidas. Peça à equipe técnica para configurá-las.");
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: credenciais.clientId,
      client_secret: credenciais.clientSecret,
    }).toString(),
  });
  const dados = (await r.json().catch(() => ({}))) as RespostaToken;
  if (!r.ok || !dados.access_token) {
    if (dados.error === "invalid_grant") {
      throw new ErroGmail("A conexão com o Gmail expirou ou foi revogada. Conecte o Gmail de novo na configuração inicial.");
    }
    throw new ErroGmail(`O Google não renovou o acesso ao Gmail (HTTP ${r.status}${dados.error ? `, ${dados.error}` : ""}).`);
  }
  cache = { token: dados.access_token, expiraEm: Date.now() + Math.max((dados.expires_in ?? 3600) - 60, 60) * 1000, refresh };
  return dados.access_token;
}

async function obterAccessToken(forcarRenovacao = false): Promise<string> {
  const refresh = getConfig("GMAIL_REFRESH_TOKEN");
  if (!refresh) throw new ErroGmail("O Gmail não está conectado. Conecte na configuração inicial.");
  if (!forcarRenovacao && cache && cache.refresh === refresh && cache.expiraEm > Date.now()) return cache.token;
  return renovarAccessToken(refresh);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chamada autenticada ao Gmail: renova o acesso em 401 e espera em 429/503 (Retry-After ou recuo exponencial). */
async function chamarGmail<T>(caminho: string): Promise<T> {
  let token = await obterAccessToken();
  let renovado = false;
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(`${GMAIL_API}${caminho}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.ok) return (await r.json()) as T;

    if (r.status === 401 && !renovado) {
      renovado = true;
      token = await obterAccessToken(true);
      continue;
    }
    if ((r.status === 429 || r.status === 503 || (r.status === 403 && /rate/i.test(await r.clone().text()))) && tentativa < MAXIMO_TENTATIVAS) {
      const retryAfter = Number(r.headers.get("retry-after"));
      const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** tentativa;
      await esperar(Math.min(ms, 30_000));
      continue;
    }
    const corpo = await r.text().catch(() => "");
    console.error(`Gmail ${caminho} respondeu HTTP ${r.status}: ${corpo.slice(0, 300)}`);
    if (r.status === 401 || r.status === 403) throw new ErroGmail("O Gmail recusou o acesso. Desconecte e conecte o Gmail de novo na configuração inicial.");
    throw new ErroGmail(`O Gmail respondeu HTTP ${r.status}. Tente de novo em alguns minutos.`);
  }
}

// ---------------------------------------------------------------------------------------------
// Perfil, listagem e leitura de mensagens.
// ---------------------------------------------------------------------------------------------

export type PerfilGmail = { emailAddress: string; messagesTotal?: number };

/** Conta conectada, direto do Gmail (users.getProfile). */
export async function obterPerfil(): Promise<PerfilGmail> {
  return chamarGmail<PerfilGmail>("/profile");
}

/** Perfil usando um access token recém-obtido (callback OAuth, antes de gravar o código de renovação). */
export async function obterPerfilComToken(accessToken: string): Promise<PerfilGmail> {
  const r = await fetch(`${GMAIL_API}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new ErroGmail(`O Gmail não informou a conta conectada (HTTP ${r.status}).`);
  return (await r.json()) as PerfilGmail;
}

/** Termos que identificam uma cobrança no assunto/corpo, combinados com anexos (as notas costumam vir em PDF). */
const TERMOS_COBRANCA = ["fatura", "invoice", "recibo", "receipt", '"nota fiscal"', "has:attachment"];

/** Consulta padrão do Gmail para um período em dias: só mensagens recentes com jeito de cobrança. */
export function consultaPadrao(dias: number): string {
  return `newer_than:${dias}d (${TERMOS_COBRANCA.join(" OR ")})`;
}

export type MensagemResumida = { id: string; threadId?: string };

/**
 * Lista os ids das mensagens do período que batem com a consulta (users.messages.list, paginado).
 * `consulta` substitui a consulta padrão quando informada; `limite` corta a busca (o chamador decide
 * quanto vale a pena ler — cada mensagem vira ao menos uma chamada ao modelo).
 */
export async function listarMensagens({ dias, consulta, limite = PAGINA_MAXIMA }: { dias: number; consulta?: string; limite?: number }): Promise<{ mensagens: MensagemResumida[]; estimativa: number; truncado: boolean }> {
  const q = consulta || consultaPadrao(dias);
  const mensagens: MensagemResumida[] = [];
  let pagina: string | undefined;
  let estimativa = 0;
  do {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(PAGINA_MAXIMA, limite - mensagens.length)) });
    if (pagina) params.set("pageToken", pagina);
    const r = await chamarGmail<{ messages?: MensagemResumida[]; nextPageToken?: string; resultSizeEstimate?: number }>(`/messages?${params}`);
    estimativa = Math.max(estimativa, r.resultSizeEstimate ?? 0);
    for (const m of r.messages ?? []) if (mensagens.length < limite) mensagens.push({ id: m.id, threadId: m.threadId });
    pagina = r.nextPageToken;
  } while (pagina && mensagens.length < limite);
  return { mensagens, estimativa: Math.max(estimativa, mensagens.length), truncado: Boolean(pagina) };
}

type ParteGmail = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: ParteGmail[];
};

type MensagemGmail = {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: ParteGmail;
};

export type AnexoPdf = { nome: string; bytes: Uint8Array };

export type Mensagem = {
  id: string;
  assunto: string;
  remetente: string;
  /** Data da mensagem, AAAA-MM-DD, pela hora local do servidor. */
  data: string;
  corpo: string;
  resumo: string;
  anexos: AnexoPdf[];
};

function decodificarBase64Url(dados: string): Buffer {
  return Buffer.from(dados.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function cabecalho(parte: ParteGmail | undefined, nome: string): string {
  return parte?.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value ?? "";
}

/** Converte o HTML de um e-mail em texto simples legível pelo modelo (sem estilos, scripts nem tags). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)\s*\/?>/gi, "\n")
    .replace(/<\s*\/t[dh]\s*>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ehPdf(parte: ParteGmail): boolean {
  return Boolean(parte.filename) && (parte.mimeType === "application/pdf" || /\.pdf$/i.test(parte.filename || ""));
}

/** Percorre a árvore MIME juntando texto (text/plain preferido, senão text/html) e os anexos PDF. */
function percorrer(parte: ParteGmail | undefined, acumulado: { texto: string[]; html: string[]; pdfs: { nome: string; attachmentId?: string; data?: string; size?: number }[] }): void {
  if (!parte) return;
  if (ehPdf(parte)) {
    acumulado.pdfs.push({ nome: parte.filename || "anexo.pdf", attachmentId: parte.body?.attachmentId, data: parte.body?.data, size: parte.body?.size });
  } else if (!parte.filename && parte.body?.data) {
    const texto = decodificarBase64Url(parte.body.data).toString("utf8");
    if (parte.mimeType === "text/plain") acumulado.texto.push(texto);
    else if (parte.mimeType === "text/html") acumulado.html.push(texto);
  }
  for (const filha of parte.parts ?? []) percorrer(filha, acumulado);
}

function dataLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lê uma mensagem completa (messages.get) e baixa os anexos PDF (attachments.get) que cabem no limite. */
export async function obterMensagem(id: string): Promise<Mensagem> {
  const m = await chamarGmail<MensagemGmail>(`/messages/${encodeURIComponent(id)}?format=full`);
  const acumulado = { texto: [] as string[], html: [] as string[], pdfs: [] as { nome: string; attachmentId?: string; data?: string; size?: number }[] };
  percorrer(m.payload, acumulado);

  const corpo = acumulado.texto.length > 0 ? acumulado.texto.join("\n\n").trim() : htmlParaTexto(acumulado.html.join("\n"));

  const anexos: AnexoPdf[] = [];
  for (const pdf of acumulado.pdfs.slice(0, MAXIMO_ANEXOS_POR_MENSAGEM)) {
    if (pdf.size && pdf.size > LIMITE_ANEXO_BYTES) continue;
    let dados = pdf.data;
    if (!dados && pdf.attachmentId) {
      const anexo = await chamarGmail<{ data?: string; size?: number }>(`/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(pdf.attachmentId)}`);
      if (anexo.size && anexo.size > LIMITE_ANEXO_BYTES) continue;
      dados = anexo.data;
    }
    if (dados) anexos.push({ nome: pdf.nome, bytes: new Uint8Array(decodificarBase64Url(dados)) });
  }

  return {
    id: m.id,
    assunto: cabecalho(m.payload, "Subject"),
    remetente: cabecalho(m.payload, "From"),
    data: dataLocal(Number(m.internalDate) || Date.now()),
    corpo,
    resumo: m.snippet || "",
    anexos,
  };
}

// ---------------------------------------------------------------------------------------------
// Desconexão.
// ---------------------------------------------------------------------------------------------

/** Apaga a conexão neste app e pede ao Google para revogar o código de renovação (melhor esforço). */
export async function desconectarGmail(): Promise<void> {
  const refresh = getConfig("GMAIL_REFRESH_TOKEN");
  limparCache();
  setConfig("GMAIL_REFRESH_TOKEN", null);
  setConfig("GMAIL_CONTA", null);
  if (!refresh || process.env.GMAIL_REFRESH_TOKEN) return; // definido por variável de ambiente: não dá para revogar daqui
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } catch (err) {
    console.error("Não foi possível revogar o acesso ao Gmail no Google", err);
  }
}
