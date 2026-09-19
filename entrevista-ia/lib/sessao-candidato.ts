// Sessão do candidato no navegador (US-016 da PRD). Não tem nada a ver com a sessão de administrador
// de lib/conta.ts: quem faz a entrevista não tem conta, não tem senha e não enxerga nada do app fora
// do link que recebeu.
//
// O cookie `ei_sessao` guarda **só** o id da entrevista e o código do link — nada sobre a pessoa. Ele
// serve a duas coisas: recarregar a página no meio da conversa e continuar de onde parou, e reconhecer
// que um segundo aparelho abriu o mesmo link enquanto a conversa está acontecendo (um link é de uma
// pessoa e de uma conversa só).
//
// O conteúdo é assinado (HMAC-SHA256) com um segredo por instalação: sem a assinatura, qualquer pessoa
// trocaria o id no cookie e entraria na conversa de outro candidato.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig, setConfig } from "./store";

const COOKIE = "ei_sessao";
const CHAVE_SEGREDO = "SESSAO_CANDIDATO_SEGREDO";
/** Quanto o cookie vale quando o convite não tem prazo próprio (os links antigos). */
const DIAS_PADRAO = 15;

export type SessaoCandidato = {
  entrevistaId: string;
  codigo: string;
  /** Instante (ms) em que este cookie deixa de valer, conferido no servidor. */
  ate: number;
};

function segredo(): Buffer {
  const guardado = getConfig(CHAVE_SEGREDO);
  if (guardado) return Buffer.from(guardado, "base64url");
  const novo = randomBytes(32);
  setConfig(CHAVE_SEGREDO, novo.toString("base64url"));
  return novo;
}

function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url");
}

/**
 * Lê um cookie do cabeçalho cru.
 *
 * Recebe o cabeçalho, e não a requisição, porque a tela do candidato é um Server Component: lá o
 * cabeçalho vem de `headers()` e não existe `Request` nenhum para passar adiante.
 */
export function lerCookie(cabecalho: string | null, nome: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`).exec(cabecalho || "")?.[1];
}

export function lerSessaoCandidato(cabecalho: string | null): SessaoCandidato | null {
  const valor = lerCookie(cabecalho, COOKIE);
  if (!valor) return null;
  const [corpo, assinatura] = valor.split(".");
  if (!corpo || !assinatura) return null;

  const esperada = Buffer.from(assinar(corpo), "base64url");
  const recebida = Buffer.from(assinatura, "base64url");
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const lido = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Partial<SessaoCandidato>;
    if (typeof lido.entrevistaId !== "string" || typeof lido.codigo !== "string" || typeof lido.ate !== "number") return null;
    if (lido.ate < Date.now()) return null;
    return { entrevistaId: lido.entrevistaId, codigo: lido.codigo, ate: lido.ate };
  } catch (err) {
    console.error("Cookie de sessão do candidato mal formado; tratando como ausente.", err);
    return null;
  }
}

/** Até quando o cookie vale: o mesmo prazo do link, para ele nunca sobreviver ao convite. */
function ate(expiraEm?: string): number {
  const prazo = expiraEm ? Date.parse(expiraEm) : NaN;
  const padrao = Date.now() + DIAS_PADRAO * 24 * 60 * 60 * 1000;
  return Number.isFinite(prazo) && prazo > Date.now() ? prazo : padrao;
}

/** O `Set-Cookie` que marca este aparelho como o que está fazendo esta entrevista. */
export function cookieSessaoCandidato({
  entrevistaId,
  codigo,
  expiraEm,
  seguro,
}: {
  entrevistaId: string;
  codigo: string;
  expiraEm?: string;
  seguro: boolean;
}): string {
  const dados: SessaoCandidato = { entrevistaId, codigo, ate: ate(expiraEm) };
  const corpo = Buffer.from(JSON.stringify(dados), "utf8").toString("base64url");
  const valor = `${corpo}.${assinar(corpo)}`;
  const segundos = Math.max(60, Math.floor((dados.ate - Date.now()) / 1000));
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${segundos}${seguro ? "; Secure" : ""}`;
}

/** Fim da conversa: este aparelho deixa de ser o dono da entrevista. */
export function cookieSairCandidato(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function ehSeguro(base: string | null | undefined): boolean {
  return Boolean(base?.startsWith("https"));
}
