import { getConfig, setConfig } from "./store";
export function validateEmbedOrigins(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("Informe até 20 endereços de sites.");
  return [...new Set(value.map((v) => {
    if (typeof v !== "string") throw new Error("Endereço inválido.");
    let u: URL;
    try { u = new URL(v); } catch { throw new Error("Use endereços completos, como https://app.exemplo.com."); }
    if (u.hostname.includes("*") || u.origin !== v || (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname)))) throw new Error("Use origens HTTPS completas, sem caminhos. HTTP é aceito apenas em localhost.");
    return u.origin;
  }))];
}
export function embedSecurity(): { origins: string[] } {
  return { origins: JSON.parse(getConfig("EMBED_ALLOWED_ORIGINS") || "[]") };
}
export function saveEmbedSecurity(value: unknown) {
  const origins = validateEmbedOrigins(value);
  setConfig("EMBED_ALLOWED_ORIGINS", JSON.stringify(origins));
  return { origins };
}
export function effectiveEmbedOrigins(origins: string[]) {
  const global = embedSecurity().origins;
  return global.length ? origins.filter((o) => global.includes(o)) : origins;
}
