// Leitura das caixas de e-mail conectadas em /setup: Gmail (US-021) e Outlook/Microsoft 365 (US-034).
// Cada provedor lista as mensagens que parecem cobranças e devolve cada uma já com assunto, remetente,
// corpo em texto e anexos PDF em memória, para lib/importacao.ts passar tudo por lib/leitor.ts. Só
// leitura (gmail.readonly / Mail.Read); nada aqui grava fatura nem guarda o corpo dos e-mails — quem
// grava é lib/faturas.ts, e só a Fatura.
//
// Credenciais do app: primeiro as da suíte inteira (GOOGLE_CLIENT_ID_APP/GOOGLE_CLIENT_SECRET_APP e
// MICROSOFT_CLIENT_ID_APP/MICROSOFT_CLIENT_SECRET_APP, embutidas na imagem publicada, como em
// lib/email-envio.ts); na falta delas, um par próprio (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET,
// MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET) do ambiente ou de /setup via lib/store.ts. O código de renovação
// da pessoa (GMAIL_REFRESH_TOKEN / OUTLOOK_REFRESH_TOKEN) e a conta conectada (GMAIL_CONTA /
// OUTLOOK_CONTA) são gravados pelos callbacks OAuth em app/api/setup/oauth/{google,microsoft}/callback.
//
// As funções genéricas (provedoresConectados, listarMensagens, obterMensagem, desconectar) recebem o
// provedor e despacham; o resto do app não precisa saber qual caixa está por trás.
import { getConfig, setConfig } from "./store";
import { NOME_PROVEDOR, PROVEDORES_EMAIL, type ProvedorEmail } from "./types";

export { NOME_PROVEDOR, PROVEDORES_EMAIL, type ProvedorEmail };

/** Anexos maiores que isso não são baixados (mesmo limite do upload manual). */
const LIMITE_ANEXO_BYTES = 5 * 1024 * 1024;
/** Quantos PDFs por mensagem vale a pena ler — uma nota raramente vem em mais de um arquivo. */
const MAXIMO_ANEXOS_POR_MENSAGEM = 3;
/** Tentativas depois de um 429/503 antes de desistir da chamada. */
const MAXIMO_TENTATIVAS = 4;

/** Erro previsível de um provedor de e-mail (conexão expirada, cota, credenciais), com mensagem pronta para a tela. */
export class ErroEmail extends Error {}
/** Erro previsível do Gmail. */
export class ErroGmail extends ErroEmail {}
/** Erro previsível do Outlook (Microsoft Graph). */
export class ErroOutlook extends ErroEmail {}

export type CredenciaisApp = { clientId: string; clientSecret: string };

type Chaves = { clientId: string; clientSecret: string; refresh: string; conta: string; nome: string };

const CHAVES: Record<ProvedorEmail, Chaves> = {
  gmail: { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET", refresh: "GMAIL_REFRESH_TOKEN", conta: "GMAIL_CONTA", nome: "Gmail" },
  outlook: { clientId: "MICROSOFT_CLIENT_ID", clientSecret: "MICROSOFT_CLIENT_SECRET", refresh: "OUTLOOK_REFRESH_TOKEN", conta: "OUTLOOK_CONTA", nome: "Outlook" },
};

/** Nomes das chaves de configuração de um provedor (para rotas e cartões de /setup). */
export function chavesDoProvedor(provedor: ProvedorEmail): Chaves {
  return CHAVES[provedor];
}

export function provedorValido(valor: unknown): valor is ProvedorEmail {
  return PROVEDORES_EMAIL.includes(valor as ProvedorEmail);
}

/** Chaves de ambiente das credenciais da SUÍTE (GOOGLE_CLIENT_ID_APP etc.), embutidas na imagem
 * publicada pela equipe técnica — mesmo espírito de TRELLO_API_KEY_APP em agente-kanban e das
 * credenciais de envio em lib/email-envio.ts. Quando existem, o executivo só vê "Conectar o Gmail". */
const CHAVES_DA_SUITE: Record<ProvedorEmail, { clientId: string; clientSecret: string }> = {
  gmail: { clientId: "GOOGLE_CLIENT_ID_APP", clientSecret: "GOOGLE_CLIENT_SECRET_APP" },
  outlook: { clientId: "MICROSOFT_CLIENT_ID_APP", clientSecret: "MICROSOFT_CLIENT_SECRET_APP" },
};

/** Credenciais da suíte no provedor, quando a equipe técnica as embutiu na imagem publicada. */
export function credenciaisDaSuite(provedor: ProvedorEmail): CredenciaisApp | null {
  const clientId = process.env[CHAVES_DA_SUITE[provedor].clientId]?.trim();
  const clientSecret = process.env[CHAVES_DA_SUITE[provedor].clientSecret]?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** client_id/client_secret do app naquele provedor, ou null quando ninguém os definiu ainda. As
 * credenciais da suíte vêm primeiro: com elas, quem publica o app não precisa criar projeto no Google
 * Cloud nem registro no Entra. O par próprio (GOOGLE_CLIENT_ID/..., do ambiente ou de /setup) fica
 * como saída para quem quer usar o registro da própria empresa. */
export function credenciaisDoApp(provedor: ProvedorEmail): CredenciaisApp | null {
  const daSuite = credenciaisDaSuite(provedor);
  if (daSuite) return daSuite;
  const clientId = getConfig(CHAVES[provedor].clientId);
  const clientSecret = getConfig(CHAVES[provedor].clientSecret);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function provedorConectado(provedor: ProvedorEmail): boolean {
  return Boolean(getConfig(CHAVES[provedor].refresh));
}

/** Provedores com uma caixa conectada, na ordem de PROVEDORES_EMAIL. */
export function provedoresConectados(): ProvedorEmail[] {
  return PROVEDORES_EMAIL.filter(provedorConectado);
}

export function gmailConectado(): boolean {
  return provedorConectado("gmail");
}

export function outlookConectado(): boolean {
  return provedorConectado("outlook");
}

export function contaConectada(provedor: ProvedorEmail): string | undefined {
  return getConfig(CHAVES[provedor].conta);
}

function erroDe(provedor: ProvedorEmail, mensagem: string): ErroEmail {
  return provedor === "gmail" ? new ErroGmail(mensagem) : new ErroOutlook(mensagem);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dataLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// ---------------------------------------------------------------------------------------------
// Access token: renovado pelo código de renovação e guardado só em memória até expirar.
// Um cache por provedor. O Microsoft devolve um código de renovação novo a cada renovação (rotação):
// quando vem, é gravado no lugar do antigo (salvo quando o antigo veio do ambiente — aí não dá).
// ---------------------------------------------------------------------------------------------

const TOKEN_URL: Record<ProvedorEmail, string> = {
  gmail: "https://oauth2.googleapis.com/token",
  outlook: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

/** Escopos pedidos na autorização do Google. Leitura (gmail.readonly) para achar as notas, e envio
 * (gmail.send) porque a mesma conexão é a que manda o fechamento mensal pela caixa da pessoa
 * (lib/email-envio.ts, compartilhado, que lê as MESMAS chaves GMAIL_REFRESH_TOKEN/GMAIL_CONTA).
 * Pedir os dois de uma vez evita conectar o Gmail duas vezes na mesma tela de configuração — e nunca
 * inclui apagar nem modificar mensagens. */
export const ESCOPO_GMAIL = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
/** Escopos pedidos na autorização da Microsoft, pelo mesmo motivo: ler a caixa, enviar o fechamento,
 * código de renovação e a conta conectada. */
export const ESCOPO_OUTLOOK = "Mail.Read Mail.Send offline_access User.Read";

const ESCOPO: Record<ProvedorEmail, string> = { gmail: ESCOPO_GMAIL, outlook: ESCOPO_OUTLOOK };

type CacheToken = { token: string; expiraEm: number; refresh: string };
const cache: Partial<Record<ProvedorEmail, CacheToken>> = {};

export function limparCache(provedor?: ProvedorEmail): void {
  if (provedor) delete cache[provedor];
  else for (const p of PROVEDORES_EMAIL) delete cache[p];
}

type RespostaToken = { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };

async function renovarAccessToken(provedor: ProvedorEmail, refresh: string): Promise<string> {
  const nome = CHAVES[provedor].nome;
  const credenciais = credenciaisDoApp(provedor);
  if (!credenciais) throw erroDe(provedor, `As credenciais ${provedor === "gmail" ? "do Google" : "da Microsoft"} deste app não estão definidas. Peça à equipe técnica para configurá-las.`);
  const corpo = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: credenciais.clientId, client_secret: credenciais.clientSecret });
  if (provedor === "outlook") corpo.set("scope", ESCOPO.outlook);
  const r = await fetch(TOKEN_URL[provedor], { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo.toString() });
  const dados = (await r.json().catch(() => ({}))) as RespostaToken;
  if (!r.ok || !dados.access_token) {
    if (dados.error === "invalid_grant") {
      throw erroDe(provedor, `A conexão com o ${nome} expirou ou foi revogada. Conecte o ${nome} de novo na configuração inicial.`);
    }
    throw erroDe(provedor, `${provedor === "gmail" ? "O Google" : "A Microsoft"} não renovou o acesso ao ${nome} (HTTP ${r.status}${dados.error ? `, ${dados.error}` : ""}).`);
  }
  let refreshAtual = refresh;
  if (dados.refresh_token && dados.refresh_token !== refresh && !process.env[CHAVES[provedor].refresh]) {
    setConfig(CHAVES[provedor].refresh, dados.refresh_token);
    refreshAtual = dados.refresh_token;
  }
  cache[provedor] = { token: dados.access_token, expiraEm: Date.now() + Math.max((dados.expires_in ?? 3600) - 60, 60) * 1000, refresh: refreshAtual };
  return dados.access_token;
}

async function obterAccessToken(provedor: ProvedorEmail, forcarRenovacao = false): Promise<string> {
  const refresh = getConfig(CHAVES[provedor].refresh);
  if (!refresh) throw erroDe(provedor, `O ${CHAVES[provedor].nome} não está conectado. Conecte na configuração inicial.`);
  const c = cache[provedor];
  if (!forcarRenovacao && c && c.refresh === refresh && c.expiraEm > Date.now()) return c.token;
  return renovarAccessToken(provedor, refresh);
}

/**
 * Chamada autenticada a um provedor: renova o acesso em 401 e espera em 429/503 (Retry-After ou recuo
 * exponencial). `url` pode ser absoluta (o Graph devolve @odata.nextLink completo) ou relativa à base.
 */
async function chamar<T>(provedor: ProvedorEmail, base: string, url: string, headersExtras: Record<string, string> = {}): Promise<T> {
  const nome = CHAVES[provedor].nome;
  const destino = /^https?:/i.test(url) ? url : `${base}${url}`;
  let token = await obterAccessToken(provedor);
  let renovado = false;
  for (let tentativa = 0; ; tentativa++) {
    const r = await fetch(destino, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...headersExtras } });
    if (r.ok) return (await r.json()) as T;

    if (r.status === 401 && !renovado) {
      renovado = true;
      token = await obterAccessToken(provedor, true);
      continue;
    }
    const limitado = r.status === 429 || r.status === 503 || r.status === 504 || (r.status === 403 && /rate/i.test(await r.clone().text()));
    if (limitado && tentativa < MAXIMO_TENTATIVAS) {
      const retryAfter = Number(r.headers.get("retry-after"));
      const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** tentativa;
      await esperar(Math.min(ms, 30_000));
      continue;
    }
    const corpo = await r.text().catch(() => "");
    console.error(`${nome} ${destino.replace(base, "")} respondeu HTTP ${r.status}: ${corpo.slice(0, 300)}`);
    if (r.status === 401 || r.status === 403) throw erroDe(provedor, `O ${nome} recusou o acesso. Desconecte e conecte o ${nome} de novo na configuração inicial.`);
    if (r.status === 400) throw new ErroPedidoInvalido(`O ${nome} recusou o pedido (HTTP 400). Tente de novo em alguns minutos.`);
    throw erroDe(provedor, `O ${nome} respondeu HTTP ${r.status}. Tente de novo em alguns minutos.`);
  }
}

/** 400 do provedor: consulta malformada (ex.: $search rejeitado pelo Graph). Para a rota é um ErroEmail comum (502); a listagem do Outlook usa a distinção para cair no plano B. */
class ErroPedidoInvalido extends ErroEmail {}

// ---------------------------------------------------------------------------------------------
// Tipos comuns aos dois provedores.
// ---------------------------------------------------------------------------------------------

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

export type MensagemResumida = { id: string; threadId?: string };

export type Listagem = { mensagens: MensagemResumida[]; estimativa: number; truncado: boolean };

/** Termos que identificam uma cobrança no assunto/corpo (as notas costumam vir em PDF, por isso o anexo também conta). */
const TERMOS_COBRANCA = ["fatura", "invoice", "recibo", "receipt"];

/**
 * Referência gravada na fatura para pular a mensagem na próxima importação. O Gmail continua com o id
 * puro (compatível com o que já foi gravado pela US-021); o Outlook ganha prefixo, porque os ids dos
 * dois provedores vivem na mesma coluna.
 */
export function referenciaDaMensagem(provedor: ProvedorEmail, id: string): string {
  return provedor === "gmail" ? id : `${provedor}:${id}`;
}

// ---------------------------------------------------------------------------------------------
// Gmail.
// ---------------------------------------------------------------------------------------------

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Página máxima aceita por users.messages.list. */
const GMAIL_PAGINA_MAXIMA = 500;

function chamarGmail<T>(caminho: string): Promise<T> {
  return chamar<T>("gmail", GMAIL_API, caminho);
}

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

/** Consulta padrão do Gmail para um período em dias: só mensagens recentes com jeito de cobrança. */
export function consultaPadrao(dias: number): string {
  return `newer_than:${dias}d (${[...TERMOS_COBRANCA, '"nota fiscal"', "has:attachment"].join(" OR ")})`;
}

async function listarGmail({ dias, consulta, limite }: { dias: number; consulta?: string; limite: number }): Promise<Listagem> {
  const q = consulta || consultaPadrao(dias);
  const mensagens: MensagemResumida[] = [];
  let pagina: string | undefined;
  let estimativa = 0;
  do {
    const params = new URLSearchParams({ q, maxResults: String(Math.min(GMAIL_PAGINA_MAXIMA, limite - mensagens.length)) });
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

function decodificarBase64Url(dados: string): Buffer {
  return Buffer.from(dados.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function cabecalho(parte: ParteGmail | undefined, nome: string): string {
  return parte?.headers?.find((h) => h.name.toLowerCase() === nome.toLowerCase())?.value ?? "";
}

function ehPdf(nome: string | undefined, mimeType: string | undefined): boolean {
  return Boolean(nome) && (mimeType === "application/pdf" || /\.pdf$/i.test(nome || ""));
}

/** Percorre a árvore MIME juntando texto (text/plain preferido, senão text/html) e os anexos PDF. */
function percorrer(parte: ParteGmail | undefined, acumulado: { texto: string[]; html: string[]; pdfs: { nome: string; attachmentId?: string; data?: string; size?: number }[] }): void {
  if (!parte) return;
  if (ehPdf(parte.filename, parte.mimeType)) {
    acumulado.pdfs.push({ nome: parte.filename || "anexo.pdf", attachmentId: parte.body?.attachmentId, data: parte.body?.data, size: parte.body?.size });
  } else if (!parte.filename && parte.body?.data) {
    const texto = decodificarBase64Url(parte.body.data).toString("utf8");
    if (parte.mimeType === "text/plain") acumulado.texto.push(texto);
    else if (parte.mimeType === "text/html") acumulado.html.push(texto);
  }
  for (const filha of parte.parts ?? []) percorrer(filha, acumulado);
}

/** Lê uma mensagem completa (messages.get) e baixa os anexos PDF (attachments.get) que cabem no limite. */
async function obterMensagemGmail(id: string): Promise<Mensagem> {
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
// Outlook / Microsoft 365 (Microsoft Graph).
// ---------------------------------------------------------------------------------------------

const GRAPH_API = "https://graph.microsoft.com/v1.0";
/** Página máxima aceita por /me/messages. */
const GRAPH_PAGINA_MAXIMA = 100;
/** Ids estáveis: sem isso o id da mensagem muda quando ela é movida de pasta, e a dedup por referência falha. */
const GRAPH_ID_IMUTAVEL = { Prefer: 'IdType="ImmutableId"' };

function chamarGraph<T>(url: string, headersExtras: Record<string, string> = {}): Promise<T> {
  return chamar<T>("outlook", GRAPH_API, url, { ...GRAPH_ID_IMUTAVEL, ...headersExtras });
}

export type PerfilOutlook = { emailAddress: string; nome?: string };

type UsuarioGraph = { mail?: string | null; userPrincipalName?: string; displayName?: string };

function perfilDe(u: UsuarioGraph): PerfilOutlook {
  return { emailAddress: u.mail || u.userPrincipalName || "", nome: u.displayName };
}

/** Conta conectada, direto do Graph (/me). */
export async function obterPerfilOutlook(): Promise<PerfilOutlook> {
  return perfilDe(await chamarGraph<UsuarioGraph>("/me?$select=mail,userPrincipalName,displayName"));
}

/** Perfil usando um access token recém-obtido (callback OAuth, antes de gravar o código de renovação). */
export async function obterPerfilOutlookComToken(accessToken: string): Promise<PerfilOutlook> {
  const r = await fetch(`${GRAPH_API}/me?$select=mail,userPrincipalName,displayName`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new ErroOutlook(`A Microsoft não informou a conta conectada (HTTP ${r.status}).`);
  return perfilDe((await r.json()) as UsuarioGraph);
}

function inicioDoPeriodo(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Consulta padrão do Outlook (KQL, usada em $search) para um período em dias. O Graph não aceita $search
 * junto com $filter em /me/messages, então a data entra na própria consulta (received>=AAAA-MM-DD); o
 * $filter de data fica para o plano B (listarOutlookPorFiltro), quando a busca é rejeitada.
 */
export function consultaPadraoOutlook(dias: number): string {
  return `received>=${dataLocal(inicioDoPeriodo(dias).getTime())} AND (${[...TERMOS_COBRANCA, "fiscal", "hasattachment:true"].join(" OR ")})`;
}

/** Query string com %20 (não "+") nos espaços: é a forma que o Graph documenta para $search/$filter. */
function queryGraph(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

type MensagemGraphResumida = { id: string; subject?: string; bodyPreview?: string; hasAttachments?: boolean; receivedDateTime?: string };
type PaginaGraph<T> = { value?: T[]; "@odata.nextLink"?: string };

/** Só mensagens dentro do período (a busca pode devolver algo mais antigo se a KQL de data não for honrada). */
function dentroDoPeriodo(m: MensagemGraphResumida, inicio: Date): boolean {
  if (!m.receivedDateTime) return true;
  const t = Date.parse(m.receivedDateTime);
  return !Number.isFinite(t) || t >= inicio.getTime();
}

async function paginarGraph(url: string, limite: number, aceitar: (m: MensagemGraphResumida) => boolean): Promise<Listagem> {
  const mensagens: MensagemResumida[] = [];
  let proxima: string | undefined = url;
  let vistas = 0;
  while (proxima && mensagens.length < limite) {
    const pagina: PaginaGraph<MensagemGraphResumida> = await chamarGraph<PaginaGraph<MensagemGraphResumida>>(proxima);
    for (const m of pagina.value ?? []) {
      vistas++;
      if (aceitar(m) && mensagens.length < limite) mensagens.push({ id: m.id });
    }
    proxima = pagina["@odata.nextLink"];
  }
  return { mensagens, estimativa: Math.max(vistas, mensagens.length), truncado: Boolean(proxima) };
}

/** Plano B sem $search: $filter por data de recebimento e o pré-filtro de cobrança feito aqui, no assunto/prévia/anexo. */
async function listarOutlookPorFiltro(dias: number, limite: number): Promise<Listagem> {
  const inicio = inicioDoPeriodo(dias);
  const params = queryGraph({
    $filter: `receivedDateTime ge ${inicio.toISOString()}`,
    $orderby: "receivedDateTime desc",
    $select: "id,subject,bodyPreview,hasAttachments,receivedDateTime",
    $top: String(GRAPH_PAGINA_MAXIMA),
  });
  const termos = new RegExp(`\\b(${[...TERMOS_COBRANCA, "nota fiscal", "cobrança", "pagamento", "payment", "billing", "subscription", "assinatura"].join("|")})\\b`, "i");
  return paginarGraph(`/me/messages?${params}`, limite, (m) => Boolean(m.hasAttachments) || termos.test(`${m.subject ?? ""}\n${m.bodyPreview ?? ""}`));
}

async function listarOutlook({ dias, consulta, limite }: { dias: number; consulta?: string; limite: number }): Promise<Listagem> {
  const inicio = inicioDoPeriodo(dias);
  const params = queryGraph({
    $search: `"${(consulta || consultaPadraoOutlook(dias)).replace(/"/g, "")}"`,
    $select: "id,receivedDateTime",
    $top: String(GRAPH_PAGINA_MAXIMA),
  });
  try {
    return await paginarGraph(`/me/messages?${params}`, limite, (m) => dentroDoPeriodo(m, inicio));
  } catch (err) {
    // Consulta própria rejeitada é erro de quem a escreveu; a padrão rejeitada cai no plano B por $filter.
    if (!(err instanceof ErroPedidoInvalido) || consulta) throw err;
    console.error("Outlook: $search rejeitado, listando por data e filtrando aqui", err.message);
    return listarOutlookPorFiltro(dias, limite);
  }
}

type MensagemGraph = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: "text" | "html"; content?: string };
};

type AnexoGraph = { "@odata.type"?: string; id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; contentBytes?: string };

/** Lê uma mensagem (/me/messages/{id}, corpo já em texto) e baixa os anexos PDF (/attachments/{id}, contentBytes) que cabem no limite. */
async function obterMensagemOutlook(id: string): Promise<Mensagem> {
  const caminho = `/me/messages/${encodeURIComponent(id)}`;
  const m = await chamarGraph<MensagemGraph>(`${caminho}?$select=id,subject,bodyPreview,receivedDateTime,hasAttachments,from,body`, { Prefer: `${GRAPH_ID_IMUTAVEL.Prefer}, outlook.body-content-type="text"` });
  const corpo = m.body?.contentType === "html" ? htmlParaTexto(m.body.content || "") : (m.body?.content || "").trim();

  const anexos: AnexoPdf[] = [];
  if (m.hasAttachments) {
    const lista = await chamarGraph<PaginaGraph<AnexoGraph>>(`${caminho}/attachments?$select=id,name,contentType,size,isInline`);
    const pdfs = (lista.value ?? []).filter((a) => (a["@odata.type"] ?? "#microsoft.graph.fileAttachment") === "#microsoft.graph.fileAttachment" && !a.isInline && ehPdf(a.name, a.contentType));
    for (const pdf of pdfs.slice(0, MAXIMO_ANEXOS_POR_MENSAGEM)) {
      if (pdf.size && pdf.size > LIMITE_ANEXO_BYTES) continue;
      const anexo = await chamarGraph<AnexoGraph>(`${caminho}/attachments/${encodeURIComponent(pdf.id)}`);
      if (anexo.size && anexo.size > LIMITE_ANEXO_BYTES) continue;
      if (anexo.contentBytes) anexos.push({ nome: pdf.name || "anexo.pdf", bytes: new Uint8Array(Buffer.from(anexo.contentBytes, "base64")) });
    }
  }

  const de = m.from?.emailAddress;
  return {
    id: m.id,
    assunto: m.subject || "",
    remetente: de ? (de.name ? `${de.name} <${de.address || ""}>` : de.address || "") : "",
    data: dataLocal(Date.parse(m.receivedDateTime || "") || Date.now()),
    corpo,
    resumo: m.bodyPreview || "",
    anexos,
  };
}

// ---------------------------------------------------------------------------------------------
// Camada genérica: o resto do app fala com estas funções, passando o provedor.
// ---------------------------------------------------------------------------------------------

/**
 * Lista os ids das mensagens do período que batem com a consulta, paginado. `consulta` substitui a
 * consulta padrão do provedor quando informada; `limite` corta a busca (o chamador decide quanto vale a
 * pena ler — cada mensagem vira ao menos uma chamada ao modelo).
 */
export async function listarMensagens({ provedor = "gmail", dias, consulta, limite = GMAIL_PAGINA_MAXIMA }: { provedor?: ProvedorEmail; dias: number; consulta?: string; limite?: number }): Promise<Listagem> {
  return provedor === "gmail" ? listarGmail({ dias, consulta, limite }) : listarOutlook({ dias, consulta, limite });
}

/** Lê uma mensagem completa, com anexos PDF em memória. */
export async function obterMensagem(id: string, provedor: ProvedorEmail = "gmail"): Promise<Mensagem> {
  return provedor === "gmail" ? obterMensagemGmail(id) : obterMensagemOutlook(id);
}

// ---------------------------------------------------------------------------------------------
// Desconexão.
// ---------------------------------------------------------------------------------------------

/** Apaga a conexão neste app e, no Google, pede a revogação do código de renovação (melhor esforço).
 * A Microsoft não tem revogação por chamada: a pessoa remove o app em myaccount.microsoft.com. */
export async function desconectar(provedor: ProvedorEmail): Promise<void> {
  const chaves = CHAVES[provedor];
  const refresh = getConfig(chaves.refresh);
  limparCache(provedor);
  setConfig(chaves.refresh, null);
  setConfig(chaves.conta, null);
  if (!refresh || process.env[chaves.refresh]) return; // definido por variável de ambiente: não dá para revogar daqui
  if (provedor !== "gmail") return;
  try {
    await fetch(`${GMAIL_REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  } catch (err) {
    console.error("Não foi possível revogar o acesso ao Gmail no Google", err);
  }
}

export function desconectarGmail(): Promise<void> {
  return desconectar("gmail");
}
