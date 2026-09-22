import { AppError } from "./api";
import { getConfig, setConfig, mascarar, origemConfig } from "./store";
export type Voz = { id: string; nome: string; brasileira: boolean };
type VozAPI = { voice_id: string; name: string; labels?: Record<string, string>; verified_languages?: { language: string; locale?: string; accent?: string }[] };
const ENDERECO = "https://api.elevenlabs.io";
export function statusVoz() {
  return { conectado: !!getConfig("ELEVENLABS_API_KEY"), mascarado: mascarar(getConfig("ELEVENLABS_API_KEY")), origem: origemConfig("ELEVENLABS_API_KEY"), vozId: getConfig("ELEVENLABS_VOICE_ID") || "", vozNome: getConfig("ELEVENLABS_VOICE_NAME") || "", idioma: "pt-BR" };
}
async function chamar(caminho: string, init: RequestInit = {}, chave = getConfig("ELEVENLABS_API_KEY")) {
  if (!chave) throw new AppError("Conecte a ElevenLabs em Configurações para usar voz.", 409);
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  let res: Response;
  try { res = await fetch(ENDERECO + caminho, { ...init, headers: { ...init.headers, "xi-api-key": chave }, signal }); }
  catch { throw new AppError("Não foi possível acessar a ElevenLabs. Tente novamente.", 502); }
  if (!res.ok) throw new AppError(res.status === 401 || res.status === 403 ? "A ElevenLabs recusou a credencial ou a permissão. Confira as permissões de vozes, transcrição e síntese." : res.status === 429 ? "Limite da ElevenLabs atingido. Confira os créditos da sua conta e tente novamente." : "A ElevenLabs não concluiu o pedido. Confira sua conta e tente novamente.", 502);
  return res;
}
export function normalizarVoz(v: VozAPI): Voz {
  const br = /brazil|brasil|pt[-_]br/i;
  return { id: v.voice_id, nome: v.name, brasileira: br.test(v.labels?.accent || "") || (v.verified_languages || []).some(l => br.test(`${l.locale} ${l.accent}`)) };
}
export async function listarVozes(chave?: string): Promise<Voz[]> {
  const vozes: Voz[] = [];
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100", language: "pt" });
    if (token) query.set("next_page_token", token);
    const r = await (await chamar(`/v2/voices?${query}`, {}, chave)).json() as { voices: VozAPI[]; has_more: boolean; next_page_token?: string };
    vozes.push(...r.voices.map(normalizarVoz));
    token = r.has_more ? r.next_page_token : undefined;
  } while (token && vozes.length < 1000);
  return vozes.sort((a,b) => Number(b.brasileira) - Number(a.brasileira) || a.nome.localeCompare(b.nome, "pt-BR"));
}
export async function configurarVoz(b: Record<string, unknown>) {
  if (b.desconectar === true) {
    if (origemConfig("ELEVENLABS_API_KEY") === "env") throw new AppError("Remova a variável de ambiente para desconectar.");
    for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_VOICE_NAME"]) setConfig(k, null);
    return;
  }
  const chave = typeof b.chave === "string" && b.chave.trim() ? b.chave.trim() : undefined;
  if (chave && chave.length > 1000) throw new AppError("Credencial inválida.");
  const vozes = await listarVozes(chave);
  const voz = vozes.find(v => v.id === b.vozId);
  if (b.vozId && !voz) throw new AppError("Escolha uma voz disponível em português na sua conta.");
  if (chave) {
    if (origemConfig("ELEVENLABS_API_KEY") === "env") throw new AppError("A credencial é definida por variável de ambiente.");
    setConfig("ELEVENLABS_API_KEY", chave);
    setConfig("ELEVENLABS_VOICE_ID", null);
    setConfig("ELEVENLABS_VOICE_NAME", null);
  }
  if (voz) {
    setConfig("ELEVENLABS_VOICE_ID", voz.id);
    setConfig("ELEVENLABS_VOICE_NAME", voz.nome);
  }
}
// Single-use credentials allow microphone streaming without exposing the API key.
export async function tokenVoz(signal?: AbortSignal) {
  if (!getConfig("ELEVENLABS_VOICE_ID")) throw new AppError("Selecione a voz padrão nas Configurações.", 409);
  const r = await (await chamar("/v1/single-use-token/realtime_scribe", { method: "POST", signal })).json();
  if (typeof r.token !== "string" || !r.token) throw new AppError("Não foi possível iniciar a conversa por voz.", 502);
  return { token: r.token };
}
export async function falar(texto: string, signal?: AbortSignal, vozId?: string) {
  const id = vozId || getConfig("ELEVENLABS_VOICE_ID");
  if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new AppError("Selecione a voz padrão nas Configurações.", 409);
  if (!texto.trim() || texto.length > 10000) throw new AppError("O texto para leitura deve ter entre 1 e 10.000 caracteres.");
  const res = await chamar(`/v1/text-to-speech/${encodeURIComponent(id)}?output_format=mp3_44100_128`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texto.replace(/[*#`]/g, ""), model_id: "eleven_multilingual_v2" }), signal });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
