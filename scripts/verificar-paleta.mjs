#!/usr/bin/env node
// Confere as regras da paleta por segmento (tasks/paleta-segmentos.json), a fonte única de onde vem o
// acento de cada app. Uso: node scripts/verificar-paleta.mjs
//
// Regras conferidas:
//   1. Todo app do catalogo.json tem uma entrada na paleta (e vice-versa).
//   2. Contraste AA do acento contra branco >= 4,5 (WCAG), e o campo `contrasteBranco` bate com o
//      valor recalculado.
//   3. `acento2` é derivado do `acento` pela regra: matiz +18°, saturação +12 (teto 90), luminosidade
//      +14 (teto 66).
//   4. `soft` é derivado do `acento` pela regra: mesma matiz, saturação com teto 60, luminosidade 94.
//   5. `ink` é derivado do `acento` pela regra: mesma matiz, saturação +10 (teto 85), luminosidade -18
//      (piso 20).
//   6. ΔE (CIE76) >= 10 entre acentos de segmentos diferentes e >= 6 entre acentos do mesmo segmento
//      (dois apps do mesmo segmento precisam ser visualmente distinguíveis).
//
// Sai com código 1 e a lista de problemas quando alguma regra falha; código 0 quando a paleta inteira
// está de acordo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogo = JSON.parse(readFileSync(join(raiz, "catalogo.json"), "utf8"));
const paleta = JSON.parse(readFileSync(join(raiz, "tasks", "paleta-segmentos.json"), "utf8"));

const problemas = [];

function hexParaRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbParaHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

// HSL <-> RGB em [0,255]/[0,100], igual ao usado para gerar tasks/paleta-segmentos.json.
function hslParaRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const canal = (t) => {
    let tc = t;
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return [canal(hk + 1 / 3) * 255, canal(hk) * 255, canal(hk - 1 / 3) * 255];
}

function hslParaHex(h, s, l) {
  return rgbParaHex(hslParaRgb(h, s, l));
}

// Luminância relativa (WCAG 2.x) e razão de contraste contra branco.
function luminanciaRelativa([r, g, b]) {
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [canal(r), canal(g), canal(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrasteContraBranco(hex) {
  const l1 = 1; // luminância do branco
  const l2 = luminanciaRelativa(hexParaRgb(hex));
  return (l1 + 0.05) / (l2 + 0.05);
}

// ΔE76 (CIE76): distância euclidiana em Lab, suficiente para uma checagem de "distinguível o bastante"
// sem precisar de dependência nova.
function rgbParaLab([r, g, b]) {
  const inv = (c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const [rl, gl, bl] = [inv(r / 255), inv(g / 255), inv(b / 255)].map((v) => v * 100);
  let x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  let y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  let z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;
  x /= 95.047;
  y /= 100;
  z /= 108.883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(hex1, hex2) {
  const [l1, a1, b1] = rgbParaLab(hexParaRgb(hex1));
  const [l2, a2, b2] = rgbParaLab(hexParaRgb(hex2));
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// Regra 1: catálogo <-> paleta.
// Apps com "padrao": "proprio" (ex.: automl-pocket) têm interface própria e não entram na paleta por segmento.
const idsCatalogo = catalogo.apps.filter((a) => a.padrao !== "proprio").map((a) => a.id).sort();
const idsPaleta = Object.keys(paleta).sort();
for (const id of idsCatalogo) {
  if (!paleta[id]) problemas.push(`${id}: sem entrada em tasks/paleta-segmentos.json`);
}
for (const id of idsPaleta) {
  if (!catalogo.apps.some((a) => a.id === id)) problemas.push(`${id}: sobra em tasks/paleta-segmentos.json (não existe em catalogo.json)`);
}

// Regras 2-5: por app.
for (const [id, dados] of Object.entries(paleta)) {
  const [h, s, l] = dados.hsl;
  if (rgbParaHex(hslParaRgb(h, s, l)).toLowerCase() !== dados.acento.toLowerCase()) {
    problemas.push(`${id}: campo hsl [${h}, ${s}, ${l}] não corresponde ao acento ${dados.acento}`);
  }

  const contrasteCalculado = contrasteContraBranco(dados.acento);
  if (Math.abs(contrasteCalculado - dados.contrasteBranco) > 0.05) {
    problemas.push(`${id}: contrasteBranco declarado (${dados.contrasteBranco}) não bate com o calculado (${contrasteCalculado.toFixed(2)})`);
  }
  if (contrasteCalculado < 4.5) {
    problemas.push(`${id}: contraste do acento contra branco é ${contrasteCalculado.toFixed(2)}, abaixo do mínimo AA (4,5)`);
  }

  const acento2Esperado = hslParaHex(h + 18, Math.min(s + 12, 90), Math.min(l + 14, 66));
  if (acento2Esperado.toLowerCase() !== dados.acento2.toLowerCase()) {
    problemas.push(`${id}: acento2 é ${dados.acento2}, esperado ${acento2Esperado} pela regra (matiz +18, saturação +12/teto 90, luminosidade +14/teto 66)`);
  }

  const softEsperado = hslParaHex(h, Math.min(s, 60), 94);
  if (softEsperado.toLowerCase() !== dados.soft.toLowerCase()) {
    problemas.push(`${id}: soft é ${dados.soft}, esperado ${softEsperado} pela regra (mesma matiz, saturação teto 60, luminosidade 94)`);
  }

  const inkEsperado = hslParaHex(h, Math.min(s + 10, 85), Math.max(l - 18, 20));
  if (inkEsperado.toLowerCase() !== dados.ink.toLowerCase()) {
    problemas.push(`${id}: ink é ${dados.ink}, esperado ${inkEsperado} pela regra (mesma matiz, saturação +10/teto 85, luminosidade -18/piso 20)`);
  }
}

// Regra 6: ΔE dentro e entre segmentos, usando o acento de cada app.
const entradas = Object.entries(paleta).map(([id, d]) => ({ id, segmento: d.segmento, acento: d.acento }));
for (let i = 0; i < entradas.length; i++) {
  for (let j = i + 1; j < entradas.length; j++) {
    const a = entradas[i];
    const b = entradas[j];
    const de = deltaE(a.acento, b.acento);
    if (a.segmento === b.segmento && de < 6) {
      problemas.push(`${a.id} e ${b.id} (segmento ${a.segmento}): ΔE ${de.toFixed(2)} abaixo do mínimo 6 dentro do segmento`);
    }
    if (a.segmento !== b.segmento && de < 10) {
      problemas.push(`${a.id} (${a.segmento}) e ${b.id} (${b.segmento}): ΔE ${de.toFixed(2)} abaixo do mínimo 10 entre segmentos`);
    }
  }
}

if (problemas.length > 0) {
  console.error(`verificar-paleta: ${problemas.length} problema(s) na paleta:\n`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`verificar-paleta: ok (${idsPaleta.length} apps, todas as regras conferidas).`);
