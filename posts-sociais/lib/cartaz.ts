// Cartaz SVG gerado localmente quando não há provedor de imagens configurado.
// Fundo em duas cores derivadas do acento, formas geométricas simples e a ideia central em tipografia grande.
import type { Rede } from "./types";

const ACENTO = "#7a2e8e";

type HSL = { h: number; s: number; l: number };

function hexToHsl(hex: string): HSL {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex({ h, s, l }: HSL): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function derivar(hex: string, dl: number, ds = 0): string {
  const c = hexToHsl(hex);
  return hslToHex({ h: c.h, s: Math.max(0, Math.min(1, c.s + ds)), l: Math.max(0, Math.min(1, c.l + dl)) });
}

function escXml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Quebra o texto em linhas estimando a largura média dos caracteres.
function quebrar(texto: string, larguraMax: number, fontSize: number): string[] {
  const media = fontSize * 0.52;
  const maxChars = Math.max(8, Math.floor(larguraMax / media));
  const palavras = String(texto).replace(/\s+/g, " ").trim().split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    if ((atual + " " + p).trim().length > maxChars && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = (atual + " " + p).trim();
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export function gerarCartaz({ texto = "", rede = "linkedin", marca = "" }: { texto?: string; rede?: Rede; marca?: string } = {}): string {
  const quadrado = rede === "instagram";
  const W = quadrado ? 1080 : 1536;
  const H = quadrado ? 1080 : 1024;

  const escuro = derivar(ACENTO, -0.22);
  const medio = derivar(ACENTO, -0.05);
  const claro = derivar(ACENTO, 0.42, -0.15);
  const suave = derivar(ACENTO, 0.5, -0.2);

  // Texto curto o bastante para caber com destaque.
  let frase = String(texto).replace(/\s+/g, " ").trim();
  if (frase.length > 150) frase = frase.slice(0, 147).replace(/\s+\S*$/, "") + "…";

  const margem = Math.round(W * 0.08);
  const larguraTexto = W - margem * 2;
  let fontSize = frase.length < 60 ? Math.round(W * 0.062) : frase.length < 100 ? Math.round(W * 0.05) : Math.round(W * 0.042);
  let linhas = quebrar(frase, larguraTexto, fontSize);
  while (linhas.length * fontSize * 1.18 > H * 0.6 && fontSize > 28) {
    fontSize -= 4;
    linhas = quebrar(frase, larguraTexto, fontSize);
  }
  const alturaBloco = linhas.length * fontSize * 1.18;
  const yInicio = Math.round((H - alturaBloco) / 2 + fontSize * 0.9);

  const tspans = linhas
    .map((l, i) => `<tspan x="${margem}" y="${Math.round(yInicio + i * fontSize * 1.18)}">${escXml(l)}</tspan>`)
    .join("");

  const rodape = marca
    ? `<text x="${margem}" y="${H - margem * 0.9}" font-family="Manrope, 'Helvetica Neue', Arial, sans-serif" font-size="${Math.round(W * 0.02)}" font-weight="600" fill="${suave}" opacity="0.9">${escXml(marca)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${escuro}"/>
  <polygon points="${Math.round(W * 0.58)},0 ${W},0 ${W},${H} ${Math.round(W * 0.36)},${H}" fill="${medio}"/>
  <circle cx="${Math.round(W * 0.86)}" cy="${Math.round(H * 0.2)}" r="${Math.round(W * 0.12)}" fill="${claro}" opacity="0.28"/>
  <circle cx="${Math.round(W * 0.86)}" cy="${Math.round(H * 0.2)}" r="${Math.round(W * 0.07)}" fill="none" stroke="${suave}" stroke-width="${Math.round(W * 0.006)}" opacity="0.7"/>
  <rect x="${Math.round(W * 0.06)}" y="${Math.round(H * 0.8)}" width="${Math.round(W * 0.12)}" height="${Math.round(W * 0.012)}" rx="${Math.round(W * 0.006)}" fill="${claro}"/>
  <rect x="${margem}" y="${Math.round(yInicio - fontSize * 1.6)}" width="${Math.round(W * 0.05)}" height="${Math.round(W * 0.008)}" rx="${Math.round(W * 0.004)}" fill="${suave}"/>
  <text font-family="Manrope, 'Helvetica Neue', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff" letter-spacing="-0.02em">${tspans}</text>
  ${rodape}
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
