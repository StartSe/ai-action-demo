// Adaptação do fluxo de autorização da CLI oficial, não OAuth público.
// https://github.com/livekit/livekit-cli/blob/main/cmd/lk/cloud.go
import { randomBytes } from "node:crypto";
import { abrirBanco, getConfig, origemConfig, setConfig } from "./store";

const PENDENTE = "_LIVEKIT_CLOUD_AUTORIZACAO";
const CHAVES = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
const API = "https://cloud-api.livekit.io";
const MAX_MS = 15 * 60_000;
type Autorizacao = { id: string; token?: string; expira: number; proximaConsulta: number; conectada?: boolean };
export class ErroConexaoLivekit extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function atual(): Autorizacao | null {
  const salvo = getConfig(PENDENTE);
  if (!salvo) return null;
  try { return JSON.parse(salvo) as Autorizacao; } catch { return null; }
}
function gravar(valor: Autorizacao) { setConfig(PENDENTE, JSON.stringify(valor)); }
function conferirAmbiente() {
  if (CHAVES.some(k => origemConfig(k) === "env")) throw new ErroConexaoLivekit("O LiveKit está definido no ambiente do servidor. Remova essas variáveis antes de conectar outro projeto aqui.", 409);
}
function falha(): never { throw new ErroConexaoLivekit("O LiveKit não concluiu a conexão. Tente novamente ou preencha as credenciais manualmente.", 502); }
async function pedir(caminho: string) {
  try { return await fetch(`${API}${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store" }); }
  catch { return falha(); }
}
const campo = (dados: Record<string, unknown>, nome: string) => dados[nome] ?? dados[nome[0].toLowerCase() + nome.slice(1)];

export async function iniciarConexaoLivekit() {
  conferirAmbiente();
  const antiga = atual();
  if (antiga && !antiga.conectada && antiga.expira > Date.now()) throw new ErroConexaoLivekit("Já existe uma autorização em andamento. Conclua ou cancele a tentativa anterior.", 409);
  const id = randomBytes(32).toString("hex");
  // Reserva antes do primeiro await; duas abas não iniciam duas autorizações.
  gravar({ id, expira: Date.now() + MAX_MS, proximaConsulta: 0 });
  try {
    const res = await pedir(`/cli/auth?device_name=${encodeURIComponent("Entrevistadora IA")}`);
    if (!res.ok) falha();
    const dados = await res.json() as Record<string, unknown>;
    const token = campo(dados, "Token"), expires = campo(dados, "Expires");
    if (typeof token !== "string" || !token || token.length > 4096 || typeof expires !== "number" || !Number.isFinite(expires) || expires * 1000 <= Date.now()) falha();
    if (atual()?.id !== id) throw new ErroConexaoLivekit("Esta autorização foi cancelada.", 410);
    const expira = Math.min(expires * 1000, Date.now() + MAX_MS);
    gravar({ id, token, expira, proximaConsulta: 0 });
    return { id, url: `https://cloud.livekit.io/cli/confirm-auth?t=${encodeURIComponent(token)}`, expira };
  } catch (err) {
    if (atual()?.id === id) setConfig(PENDENTE, null);
    if (err instanceof ErroConexaoLivekit) throw err;
    return falha();
  }
}
export function cancelarConexaoLivekit(id: string) {
  if (atual()?.id === id) setConfig(PENDENTE, null);
}
export async function consultarConexaoLivekit(id: string): Promise<{ conectada: boolean }> {
  const auth = atual();
  if (!auth || auth.id !== id || auth.expira <= Date.now()) {
    cancelarConexaoLivekit(id);
    throw new ErroConexaoLivekit("A autorização expirou ou foi cancelada. Inicie uma nova conexão.", 410);
  }
  if (auth.conectada) return { conectada: true };
  if (!auth.token || auth.proximaConsulta > Date.now()) return { conectada: false };
  conferirAmbiente();
  gravar({ ...auth, proximaConsulta: Date.now() + 15000 });
  try {
    const res = await pedir(`/cli/claim?t=${encodeURIComponent(auth.token)}`);
    if (atual()?.id !== id) throw new ErroConexaoLivekit("Esta autorização foi cancelada.", 410);
    if (res.status === 401) return { conectada: false };
    if (res.status === 404 || res.status === 403) {
      cancelarConexaoLivekit(id);
      throw new ErroConexaoLivekit("O acesso foi recusado ou a autorização expirou. Tente conectar novamente.", 410);
    }
    if (!res.ok) falha();
    const dados = await res.json() as Record<string, unknown>;
    const key = campo(dados, "Key"), secret = campo(dados, "Secret"), endereco = dados.URL ?? dados.url;
    if (typeof key !== "string" || !key.trim() || typeof secret !== "string" || !secret.trim() || typeof endereco !== "string") falha();
    const url = new URL(endereco);
    if (url.protocol !== "wss:" || !url.hostname.endsWith(".livekit.cloud") || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/") falha();
    if (atual()?.id !== id || auth.expira <= Date.now()) throw new ErroConexaoLivekit("Esta autorização expirou ou foi cancelada.", 410);
    conferirAmbiente();
    const db = abrirBanco();
    db.exec("BEGIN IMMEDIATE");
    try {
      setConfig("LIVEKIT_URL", url.origin);
      setConfig("LIVEKIT_API_KEY", key);
      setConfig("LIVEKIT_API_SECRET", secret);
      // Retém só a confirmação para tornar o último poll idempotente.
      gravar({ id, expira: auth.expira, proximaConsulta: 0, conectada: true });
      db.exec("COMMIT");
    } catch (err) { db.exec("ROLLBACK"); throw err; }
    return { conectada: true };
  } catch (err) {
    if (err instanceof ErroConexaoLivekit) throw err;
    return falha();
  } finally {
    const guardada = atual();
    if (guardada?.id === id && !guardada.conectada) gravar({ ...guardada, proximaConsulta: Date.now() + 4000 });
  }
}
