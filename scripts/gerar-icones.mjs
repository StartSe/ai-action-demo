#!/usr/bin/env node
// Gera, a partir de catalogo.json, o ícone de cada app: <app>/app/icon.svg,
// com a inicial do nome em branco sobre a cor de acento, cantos arredondados.
// Uso: node scripts/gerar-icones.mjs
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const cat = JSON.parse(readFileSync(join(raiz, "catalogo.json"), "utf8"));

const inicial = (nome) => nome.trim().charAt(0).toUpperCase();

const svg = (app) => `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="7" fill="${app.acento}" />
  <text x="16" y="22" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" fill="#ffffff">${inicial(app.nome)}</text>
</svg>
`;

for (const app of cat.apps) {
  if (app.padrao === "proprio") continue; // Esses apps mantêm os próprios ícones e estrutura.
  const destino = join(raiz, app.id, "app", "icon.svg");
  writeFileSync(destino, svg(app));
  console.log(`Gerado ${app.id}/app/icon.svg`);

  const favicon = join(raiz, app.id, "app", "favicon.ico");
  if (existsSync(favicon)) {
    unlinkSync(favicon);
    console.log(`Removido ${app.id}/app/favicon.ico`);
  }
}
