#!/usr/bin/env node
// Varre app/page.tsx e components/*.tsx (exceto setup.tsx) de cada app do
// catalogo.json procurando jargão técnico em texto visível na tela.
// Uso: node scripts/verificar-jargao.mjs [app-id]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const cat = JSON.parse(readFileSync(join(raiz, "catalogo.json"), "utf8"));
const excecoesPath = join(raiz, "scripts", "jargao-excecoes.json");
const excecoes = existsSync(excecoesPath) ? JSON.parse(readFileSync(excecoesPath, "utf8")) : {};

const TERMOS = [
  { termo: "/setup", regex: /\/setup/ },
  { termo: "webhook", regex: /\bwebhook\b/i },
  { termo: "token", regex: /\btoken\b/i },
  { termo: "ID", regex: / ID\b/ },
  { termo: "OpenRouter", regex: /OpenRouter/ },
  { termo: "Nemotron", regex: /Nemotron/ },
  { termo: "gpt-", regex: /gpt-/i },
  { termo: "API", regex: /\bAPI\b/ },
  { termo: "endpoint", regex: /\bendpoint\b/i },
  { termo: "env", regex: /\benv\b/i },
];

// Atributos técnicos (não são texto exibido/lido na tela): remove o valor
// antes de procurar jargão, para não confundir "/api/..." de fetch/href com
// texto visível.
const ATRIBUTOS_TECNICOS = /\b(href|src|action|formAction|htmlFor|rel|id|name|key|method|type|autoComplete|target|accept|className)\s*=\s*"[^"]*"/g;

function sanitizar(conteudo) {
  return conteudo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .split("\n")
    .map((linha) =>
      linha
        .replace(/(^|[^:])\/\/.*$/, "$1")
        .replace(ATRIBUTOS_TECNICOS, "")
        .replace(/\bfetch\([^)]*\)/g, "")
        .replace(/process\.env\.[A-Z0-9_]+/g, "")
    );
}

function arquivosParaVarrer(appId) {
  const base = join(raiz, appId);
  const arquivos = [join(base, "app", "page.tsx")].filter((f) => existsSync(f));
  const componentesDir = join(base, "components");
  if (existsSync(componentesDir)) {
    for (const nome of readdirSync(componentesDir)) {
      if (nome.endsWith(".tsx") && nome !== "setup.tsx") arquivos.push(join(componentesDir, nome));
    }
  }
  return arquivos;
}

// lib/ai.ts usa "http://localhost:3000" de propósito, como reserva do cabeçalho HTTP-Referer (nunca
// vira link mostrado a alguém) — todo o resto de lib/*.ts que monta link de e-mail/Slack/formulário
// deve usar lib/setup-comum.ts:enderecoPublico() (ver US-019 do prd.json), nunca essa string crua.
function arquivosLibParaVarrer(appId) {
  const libDir = join(raiz, appId, "lib");
  if (!existsSync(libDir)) return [];
  return readdirSync(libDir)
    .filter((nome) => nome.endsWith(".ts") && nome !== "ai.ts")
    .map((nome) => join(libDir, nome));
}

const alvo = process.argv[2];
// Apps com "padrao": "proprio" (estrutura diferente de app/, components/ e lib/) ficam de fora.
const apps = alvo ? cat.apps.filter((a) => a.id === alvo) : cat.apps.filter((a) => a.padrao !== "proprio");

const achados = [];
for (const app of apps) {
  const excecoesApp = (excecoes[app.id] ?? []).map((t) => t.toLowerCase());
  for (const arquivo of arquivosParaVarrer(app.id)) {
    const linhas = sanitizar(readFileSync(arquivo, "utf8"));
    linhas.forEach((linha, i) => {
      for (const { termo, regex } of TERMOS) {
        if (excecoesApp.includes(termo.toLowerCase())) continue;
        if (regex.test(linha)) {
          achados.push({ arquivo: arquivo.slice(raiz.length + 1), linha: i + 1, termo });
        }
      }
    });
  }
  for (const arquivo of arquivosLibParaVarrer(app.id)) {
    const linhas = readFileSync(arquivo, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (linha.includes("http://localhost:3000")) {
        achados.push({ arquivo: arquivo.slice(raiz.length + 1), linha: i + 1, termo: "http://localhost:3000" });
      }
    });
  }
}

if (achados.length > 0) {
  console.error(`Jargão técnico encontrado (${achados.length}):`);
  for (const a of achados) console.error(`  ${a.arquivo}:${a.linha}  "${a.termo}"`);
  process.exit(1);
}

console.log(`Nenhum jargão técnico encontrado${alvo ? ` em ${alvo}` : ""}.`);
process.exit(0);
