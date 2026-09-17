// Sessão do vendedor no navegador (US-013). Não tem nada a ver com a sessão de administrador de
// lib/conta.ts: quem treina não tem conta, não tem senha e não enxerga nada do app fora do link.
//
// O cookie `sv_sessao` guarda **só** o id do participante e, depois que a conversa começa, o id da
// sessão de treino — nunca o token do provedor de identidade. A identificação por Google/Microsoft é
// usada uma vez, para saber o nome e o e-mail, e o acesso é descartado no mesmo instante.
//
// O conteúdo é assinado (HMAC-SHA256) com um segredo por instância: sem isso, qualquer pessoa
// trocaria o id no cookie e passaria a treinar no lugar de outra — e o painel do gestor registraria
// a sessão no nome errado.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig, setConfig } from "./store";

const COOKIE = "sv_sessao";
const HORAS = 12;
const CHAVE_SEGREDO = "SESSAO_VENDEDOR_SEGREDO";

export type SessaoVendedor = {
  participanteId: string;
  /** Preenchido quando a sessão de treino é aberta (US-014). */
  sessaoId?: string;
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
 * Lê um cookie do cabeçalho cru. Mesmo molde dos callbacks de OAuth em app/api/setup/oauth.
 *
 * Recebe o cabeçalho, e não a requisição, porque a tela pública é um Server Component: lá o cabeçalho
 * vem de `headers()`, e não existe `Request` nenhum para passar adiante.
 */
export function lerCookie(cabecalho: string | null, nome: string): string | undefined {
  return new RegExp(`(?:^|;\\s*)${nome}=([^;]+)`).exec(cabecalho || "")?.[1];
}

export function lerSessaoVendedor(cabecalho: string | null): SessaoVendedor | null {
  const valor = lerCookie(cabecalho, COOKIE);
  if (!valor) return null;
  const [corpo, assinatura] = valor.split(".");
  if (!corpo || !assinatura) return null;

  const esperada = Buffer.from(assinar(corpo), "base64url");
  const recebida = Buffer.from(assinatura, "base64url");
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const lido = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Partial<SessaoVendedor>;
    if (typeof lido.participanteId !== "string" || typeof lido.ate !== "number") return null;
    if (lido.ate < Date.now()) return null;
    return { participanteId: lido.participanteId, sessaoId: typeof lido.sessaoId === "string" ? lido.sessaoId : undefined, ate: lido.ate };
  } catch (err) {
    console.error("Cookie de sessão do vendedor mal formado; tratando como ausente.", err);
    return null;
  }
}

/** O `Set-Cookie` que identifica o vendedor neste navegador pelas próximas 12 horas. */
export function cookieSessaoVendedor({ participanteId, sessaoId, seguro }: { participanteId: string; sessaoId?: string; seguro: boolean }): string {
  const dados: SessaoVendedor = { participanteId, sessaoId, ate: Date.now() + HORAS * 60 * 60 * 1000 };
  const corpo = Buffer.from(JSON.stringify(dados), "utf8").toString("base64url");
  const valor = `${corpo}.${assinar(corpo)}`;
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HORAS * 60 * 60}${seguro ? "; Secure" : ""}`;
}

/** "Não sou eu": apaga a identificação deste navegador. */
export function cookieSair(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function ehSeguro(base: string): boolean {
  return base.startsWith("https");
}
