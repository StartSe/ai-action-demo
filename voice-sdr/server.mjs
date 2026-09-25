// Servidor da imagem da suíte IA para Executivos: entrega a interface já construída (app/dist) e as
// duas rotas que a suíte exige de todo app. Só `node:*`, sem dependência: a imagem final não roda
// `npm install`.
//
// A Voice SDR não tem servidor de produto. O banco e as funções moram no projeto Supabase do
// cliente (docs/instalacao.md), e a configuração acontece na própria tela ("Conectar ao seu
// Supabase" e o tutorial). Por isso não há SQLite, /setup nem chave aqui.
//
// Rotas:
//   GET /api/health  200 { ok: true } (health check do Render e do workflow de publicação)
//   GET /api/status  formato da suíte, com o que este servidor sabe de fato
//   /api/*           404 JSON
//   arquivo de dist  o arquivo, com cache longo em /assets (nome com hash)
//   qualquer outra   index.html, porque o roteador usa o histórico do navegador (/leads, /config/conta)
//
// Variáveis: PORT (padrão 10000), HOSTNAME (padrão 0.0.0.0), DIST (padrão ./dist, ao lado deste
// arquivo; na pasta de desenvolvimento, ./app/dist).
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const aqui = dirname(fileURLToPath(import.meta.url));
const porta = Number(process.env.PORT ?? 10000);
const host = process.env.HOSTNAME ?? "0.0.0.0";
const padraoDist = existsSync(join(aqui, "dist")) ? join(aqui, "dist") : join(aqui, "app", "dist");
const dist = resolve(process.env.DIST ?? padraoDist);
const indice = join(dist, "index.html");

if (!existsSync(indice)) {
  console.error(`index.html não encontrado em ${dist}. Rode npm run build antes de subir o servidor.`);
  process.exit(1);
}

const versao = (() => {
  try {
    return JSON.parse(readFileSync(join(aqui, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
})();

// Projeto Supabase fixado no build (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY). Sem ele, a tela
// recebe o projeto pelo link do instalador ou pelo formulário de conexão. O Dockerfile grava este
// marcador ao lado do servidor (fora de dist, para não ser servido), porque as variáveis VITE_ não
// existem mais quando o servidor sobe.
const projetoNoBuild = existsSync(join(aqui, ".projeto-no-build"));

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Os mesmos do Blueprint de site estático da origem: a tela não tem por que abrir dentro de
// moldura de outro site.
const SEGURANCA = {
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
};

function json(res, status, corpo) {
  res.writeHead(status, { ...SEGURANCA, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
}

// O bundle da tela passa de 1,9 MB e cai para cerca de 530 KB em gzip. Texto é comprimido uma vez
// por arquivo e guardado em memória: dist não muda enquanto o contêiner vive.
const COMPRIMIVEIS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".txt", ".webmanifest"]);
const comprimidos = new Map();

function gzipDe(caminho) {
  let pronto = comprimidos.get(caminho);
  if (!pronto) {
    pronto = gzipSync(readFileSync(caminho));
    comprimidos.set(caminho, pronto);
  }
  return pronto;
}

function arquivo(req, res, caminho, cache) {
  const extensao = extname(caminho).toLowerCase();
  const cabecalhos = {
    ...SEGURANCA,
    "Content-Type": TIPOS[extensao] ?? "application/octet-stream",
    "Cache-Control": cache,
    Vary: "Accept-Encoding",
  };
  if (COMPRIMIVEIS.has(extensao) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    const corpo = gzipDe(caminho);
    res.writeHead(200, { ...cabecalhos, "Content-Encoding": "gzip", "Content-Length": corpo.length });
    return res.end(req.method === "HEAD" ? undefined : corpo);
  }
  res.writeHead(200, { ...cabecalhos, "Content-Length": statSync(caminho).size });
  if (req.method === "HEAD") return res.end();
  createReadStream(caminho).pipe(res);
}

// Caminho de dist para a URL pedida, ou null quando não há arquivo (ou a URL tenta sair de dist).
function noDist(pathname) {
  let decodificado;
  try {
    decodificado = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decodificado.includes("\0")) return null;
  const alvo = normalize(join(dist, decodificado));
  if (alvo !== dist && !alvo.startsWith(dist + sep)) return null;
  try {
    return statSync(alvo).isFile() ? alvo : null;
  } catch {
    return null;
  }
}

const servidor = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");

  if (pathname === "/api/health") return json(res, 200, { ok: true });
  if (pathname === "/api/status") {
    return json(res, 200, {
      // A IA (OpenRouter), a voz (ElevenLabs) e a telefonia (Twilio) são ligadas pela conta dentro do
      // projeto Supabase dela, não neste servidor: daqui não há como saber, e nada é fingido.
      ai: false,
      demo: false,
      model: null,
      integrations: { supabaseNoBuild: projetoNoBuild },
      setup: { pronto: true, url: "/" },
      versao,
    });
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return json(res, 404, { error: "Rota não encontrada." });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...SEGURANCA, Allow: "GET, HEAD" });
    return res.end();
  }

  const encontrado = pathname === "/" ? null : noDist(pathname);
  if (encontrado) {
    // Vite põe hash no nome de tudo em /assets: o arquivo nunca muda sob o mesmo nome.
    const imutavel = pathname.startsWith("/assets/");
    return arquivo(req, res, encontrado, imutavel ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  }
  // Arquivo com extensão que não existe é 404 de verdade; o resto é rota do app.
  if (extname(pathname) && extname(pathname) !== ".html") {
    res.writeHead(404, { ...SEGURANCA, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return res.end("Arquivo não encontrado.");
  }
  return arquivo(req, res, indice, "no-cache");
});

servidor.listen(porta, host, () => {
  console.log(`Voice SDR${versao ? ` v${versao}` : ""} em http://${host}:${porta} (servindo ${dist})`);
});

for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => servidor.close(() => process.exit(0)));
}
