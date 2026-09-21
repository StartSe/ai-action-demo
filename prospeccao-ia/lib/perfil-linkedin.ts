/** Identidade pública canônica: ignora idioma, rastreamento e barra final. */
export function perfilLinkedin(url: string): string | null {
  try {
    const u = new URL(url);
    const caminho = u.pathname.match(/^\/in\/([^/]+)(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/?$/i);
    if (u.protocol !== "https:" || !(u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) || !caminho || u.username || u.password) return null;
    return `https://www.linkedin.com/in/${caminho[1].toLowerCase()}`;
  } catch { return null; }
}
