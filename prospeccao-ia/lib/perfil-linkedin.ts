/** Identidade pública canônica: ignora idioma, rastreamento e barra final. */
export function perfilLinkedin(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !(u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) || !/^\/in\/[^/]+\/?$/.test(u.pathname) || u.username || u.password) return null;
    return `https://www.linkedin.com${u.pathname.replace(/\/$/, "").toLowerCase()}`;
  } catch { return null; }
}
