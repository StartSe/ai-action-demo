/** Só exibe fotos públicas do CDN do LinkedIn devolvidas pela fonte do próprio perfil. */
export function urlAvatarPublico(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === "licdn.com" || url.hostname.endsWith(".licdn.com"))) return null;
    return url.toString();
  } catch { return null; }
}

export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return (partes.length > 1 ? [partes[0], partes.at(-1)!] : partes).map(p => Array.from(p)[0]).join("").toLocaleUpperCase("pt-BR") || "?";
}
