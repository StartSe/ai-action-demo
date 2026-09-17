import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Contraste dos links do footer (PRD US-015): `text-muted-foreground` sobre
// `bg-background` precisa dar AA para texto normal (≥ 4,5:1). Os valores vêm
// dos tokens do tema claro em globals.css — a home força `color-scheme:
// light`, então o par escuro não entra. Se alguém clarear a cor, este teste
// avisa antes do browser.

type Rgb = [number, number, number];

function readLightTokens(): Record<string, string> {
  const css = readFileSync(
    path.join(process.cwd(), "src", "app", "globals.css"),
    "utf-8",
  );
  // Primeira ocorrência de cada token = bloco `:root` (tema claro); `.dark`
  // vem depois no arquivo e não sobrescreve aqui.
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (!(name in tokens)) tokens[name] = value.trim();
  }
  return tokens;
}

// oklch → sRGB linear (Björn Ottosson, OKLab → LMS → linear sRGB).
function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function srgbChannelToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function parseCssColorToLinearRgb(value: string): Rgb {
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (oklch) {
    return oklchToLinearRgb(
      Number(oklch[1]),
      Number(oklch[2]),
      Number(oklch[3]),
    );
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [
      srgbChannelToLinear((n >> 16) & 255),
      srgbChannelToLinear((n >> 8) & 255),
      srgbChannelToLinear(n & 255),
    ];
  }
  throw new Error(`cor não suportada no teste: ${value}`);
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const lf = relativeLuminance(parseCssColorToLinearRgb(foreground));
  const lb = relativeLuminance(parseCssColorToLinearRgb(background));
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

describe("contraste do footer (tema claro)", () => {
  it("conversões batem com valores conhecidos", () => {
    // Branco sobre preto = 21:1; cinza médio oklch(0.556 0 0) ≈ #737373.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("oklch(0.556 0 0)", "#737373")).toBeCloseTo(1, 2);
  });

  it("text-muted-foreground sobre bg-background é AA (≥ 4,5:1)", () => {
    const tokens = readLightTokens();
    expect(tokens["muted-foreground"]).toBeDefined();
    expect(tokens["background"]).toBeDefined();
    const ratio = contrastRatio(
      tokens["muted-foreground"],
      tokens["background"],
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
