// Como a referência chega ao app quando a pessoa não tem a captura em mãos:
// (1) `baixarImagem` busca uma imagem já publicada em um endereço http/https (endereço terminado em .png/.jpg);
// (2) `lerReferencia` abre o próprio site de referência e devolve uma versão simplificada do HTML (estrutura,
//     textos, cores e fontes), que o construtor (lib/construtor.ts) usa no lugar da captura. Não depende de
//     nenhum serviço de captura: o endereço fica no projeto (lib/projetos.ts, origem "endereco") e é lido na
//     hora de gerar.
// Nenhuma mensagem daqui mostra código HTTP nem corpo do servidor: o detalhe vai só para console.error.

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB
const LIMITE_HTML_BYTES = 3 * 1024 * 1024; // 3 MB de HTML cru é mais do que qualquer página de referência precisa
/** Tamanho do texto simplificado que vai para a IA: cabe com folga em qualquer modelo e mantém a estrutura inteira. */
export const LIMITE_REFERENCIA_CHARS = 28_000;

/** Endereços de rede interna: um endereço colado no formulário nunca deve virar uma chamada à rede do servidor. */
const HOSTS_BLOQUEADOS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|.*\.local|.*\.internal)$/i;

/** Falha ao trazer a referência de fora: `status` vira o código da rota, `acao` o botão da tela. */
export class ErroCaptura extends Error {
  status: number;
  acao?: { rotulo: string; url: string };

  constructor(mensagem: string, status = 400, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroCaptura";
    this.status = status;
    this.acao = acao;
  }
}

/** Endereço http/https público, fora da rede interna. Lança ErroCaptura quando não serve. */
export function enderecoPublico(url: string): URL {
  let endereco: URL;
  try {
    endereco = new URL(url.trim());
  } catch {
    throw new ErroCaptura("Informe um endereço completo, começando com https://.");
  }
  if (!/^https?:$/.test(endereco.protocol)) throw new ErroCaptura("O endereço precisa começar com http:// ou https://.");
  if (HOSTS_BLOQUEADOS.test(endereco.hostname)) throw new ErroCaptura("Endereços da rede interna não são aceitos aqui.");
  return endereco;
}

/** Converte a resposta em data URL, conferindo formato pelos primeiros bytes e o limite de tamanho. */
async function comoDataUrl(resposta: Response, origem: string): Promise<string> {
  const declarado = Number(resposta.headers.get("content-length") || 0);
  if (declarado > LIMITE_IMAGEM_BYTES) throw new ErroCaptura("A imagem passa de 5 MB. Reduza a imagem e envie de novo.");

  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.byteLength > LIMITE_IMAGEM_BYTES) throw new ErroCaptura("A imagem passa de 5 MB. Reduza a imagem e envie de novo.");
  if (buffer.byteLength === 0) throw new ErroCaptura("A imagem baixada está vazia. Confira o endereço e tente de novo.");

  // Reconhece o formato pelos primeiros bytes, não pelo cabeçalho (que pode vir errado ou ausente).
  const ehPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const ehJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (!ehPng && !ehJpeg) {
    console.error(`Conteúdo não reconhecido como PNG/JPG em ${origem}:`, resposta.headers.get("content-type"));
    throw new ErroCaptura("Esse endereço não abre uma imagem PNG ou JPG.");
  }
  return `data:${ehPng ? "image/png" : "image/jpeg"};base64,${buffer.toString("base64")}`;
}

/** Baixa a captura já publicada em um endereço (só http/https públicos, PNG ou JPG, até 5 MB). */
export async function baixarImagem(url: string): Promise<string> {
  const endereco = enderecoPublico(url);
  const resposta = await fetch(endereco, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch((err) => {
    console.error("Falha ao baixar a captura:", err);
    throw new ErroCaptura("Não foi possível abrir esse endereço. Confira o link e tente de novo.");
  });
  if (!resposta.ok) {
    console.error("Falha ao baixar a captura:", resposta.status, endereco.hostname);
    throw new ErroCaptura("Não foi possível abrir esse endereço. Confira se o link abre a imagem direto no navegador.");
  }
  return comoDataUrl(resposta, endereco.hostname);
}

/** Um endereço que termina em .png/.jpg já é a própria captura; qualquer outro é o site a ler. */
export function pareceImagem(url: string): boolean {
  return /\.(png|jpe?g)(\?|#|$)/i.test(url.trim());
}

// ---------------------------------------------------------------------------------------------------------
// Leitura do site de referência pelo endereço: o HTML da página, simplificado para a IA
// ---------------------------------------------------------------------------------------------------------

export type Referencia = {
  url: string;
  titulo: string;
  descricao: string;
  /** HTML simplificado: estrutura e textos, sem scripts, estilos, rastreadores e atributos que não mudam o desenho. */
  texto: string;
  /** Quantas seções de primeiro nível a página tem (header, section, main, footer...). */
  secoes: number;
  /** Cores encontradas em estilos inline e variáveis CSS, as mais frequentes primeiro (até 8). */
  cores: string[];
  /** Famílias de fonte declaradas (Google Fonts ou CSS), até 4. */
  fontes: string[];
};

const CABECALHOS_NAVEGADOR = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function textoDe(html: string): string {
  return decodificarEntidades(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Cores hexadecimais e rgb() em estilos inline, <style> e variáveis, contadas por frequência. */
function coresDe(html: string): string[] {
  const contagem = new Map<string, number>();
  for (const m of html.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/gi)) {
    const cor = m[0].toLowerCase();
    if (/^#(fff|ffffff|000|000000)$/.test(cor)) continue;
    contagem.set(cor, (contagem.get(cor) ?? 0) + 1);
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cor]) => cor);
}

/** Fontes do Google Fonts (family=...) e de font-family em <style>, até 4. */
function fontesDe(html: string): string[] {
  const fontes = new Set<string>();
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"']*family=([^"'&:]+)/gi)) fontes.add(decodeURIComponent(m[1]).replace(/\+/g, " "));
  for (const m of html.matchAll(/font-family\s*:\s*["']?([A-Za-z][A-Za-z0-9 ]{2,40})["']?/gi)) {
    const nome = m[1].trim();
    if (!/^(inherit|initial|sans-serif|serif|monospace|system-ui|ui-sans-serif|Arial|Helvetica|Times|Verdana|Georgia)$/i.test(nome)) fontes.add(nome);
  }
  return [...fontes].slice(0, 4);
}

/**
 * Deixa só o que ajuda a reconstruir o desenho: tags de estrutura e de texto, `class`, `href`, `alt`, `src` de
 * imagens (só o nome do arquivo) e estilos inline de cor/fundo. Scripts, estilos, SVGs longos, comentários,
 * atributos de rastreamento e espaços em excesso saem. Corta em LIMITE_REFERENCIA_CHARS mantendo o fim da página
 * (o rodapé importa) quando a página é muito longa.
 */
export function simplificarHtml(html: string, limite = LIMITE_REFERENCIA_CHARS): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|iframe|object|embed|canvas|video|audio|source|track|map)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|link|meta|base)\b[^>]*\/?>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, '<span class="icone"></span>')
    .replace(/<(path|circle|rect|polygon|line|g|defs|use|symbol)\b[^>]*\/?>/gi, "");
  // Atributos: fica class, href, alt, title, aria-label, role e um style reduzido a cor/fundo.
  s = s.replace(/<([a-z][a-z0-9-]*)((?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/gi, (_tudo, tag: string, atributos: string, fecha: string) => {
    const mantidos: string[] = [];
    for (const m of atributos.matchAll(/([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
      const nome = m[1].toLowerCase();
      const valor = (m[2] ?? "").replace(/^["']|["']$/g, "");
      if (nome === "class" && valor) mantidos.push(`class="${valor.split(/\s+/).slice(0, 8).join(" ")}"`);
      else if ((nome === "alt" || nome === "title" || nome === "aria-label" || nome === "role" || nome === "placeholder") && valor) mantidos.push(`${nome}="${valor.slice(0, 80)}"`);
      else if (nome === "href" && valor) mantidos.push(`href="${valor.startsWith("#") ? valor : "#"}"`);
      else if (nome === "src" && tag.toLowerCase() === "img" && valor) mantidos.push(`src="${valor.split(/[?#]/)[0].split("/").pop()?.slice(0, 60) ?? ""}"`);
      else if (nome === "style" && valor) {
        const cores = [...valor.matchAll(/(background(?:-color)?|color|border-color)\s*:\s*([^;]+)/gi)].map((c) => `${c[1]}:${c[2].trim()}`);
        if (cores.length) mantidos.push(`style="${cores.join(";")}"`);
      }
    }
    return `<${tag.toLowerCase()}${mantidos.length ? " " + mantidos.join(" ") : ""}${fecha ? " /" : ""}>`;
  });
  s = s.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  if (s.length <= limite) return s;
  const cabeca = Math.floor(limite * 0.8);
  const cauda = limite - cabeca;
  return `${s.slice(0, cabeca)}\n<!-- trecho do meio omitido: a página é longa -->\n${s.slice(-cauda)}`;
}

/** Abre o site de referência e devolve o HTML simplificado, o título e a descrição. */
export async function lerReferencia(url: string): Promise<Referencia> {
  const endereco = enderecoPublico(url);
  const resposta = await fetch(endereco, { redirect: "follow", headers: CABECALHOS_NAVEGADOR, signal: AbortSignal.timeout(25_000) }).catch((err) => {
    console.error("Falha ao abrir o site de referência:", err instanceof Error ? err.message : err);
    throw new ErroCaptura("Não foi possível abrir esse site. Confira o endereço ou envie uma captura da página.", 502);
  });
  if (!resposta.ok) {
    console.error("O site de referência respondeu com erro:", resposta.status, endereco.hostname);
    if (resposta.status === 403 || resposta.status === 401) throw new ErroCaptura("Esse site bloqueia leitura automática. Envie uma captura da página em vez do endereço.", 502);
    if (resposta.status === 404) throw new ErroCaptura("Esse endereço não existe (página não encontrada). Confira o link.", 404);
    throw new ErroCaptura("Esse site não respondeu como esperado. Tente de novo ou envie uma captura da página.", 502);
  }
  const tipo = resposta.headers.get("content-type") ?? "";
  if (/^image\//i.test(tipo)) throw new ErroCaptura("Esse endereço abre uma imagem: use um endereço terminado em .png ou .jpg para ela ser tratada como captura.");
  if (tipo && !/html|xml|text\/plain/i.test(tipo)) throw new ErroCaptura("Esse endereço não abre uma página web. Confira o link.");
  const declarado = Number(resposta.headers.get("content-length") || 0);
  if (declarado > LIMITE_HTML_BYTES) throw new ErroCaptura("Essa página é grande demais para ser lida. Envie uma captura de um trecho.");
  const buffer = Buffer.from(await resposta.arrayBuffer());
  if (buffer.byteLength > LIMITE_HTML_BYTES) throw new ErroCaptura("Essa página é grande demais para ser lida. Envie uma captura de um trecho.");
  const html = buffer.toString("utf8");
  if (!/<(html|body|div|section|main|header)\b/i.test(html)) throw new ErroCaptura("Esse endereço não devolveu uma página web legível. Envie uma captura da página.");

  const titulo = textoDe(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") || endereco.hostname;
  const descricao = decodificarEntidades(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ?? "").trim();
  const corpo = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  const texto = simplificarHtml(corpo);
  const secoes = (texto.match(/<(header|section|main|footer|nav|article)\b/gi) ?? []).length;
  return { url: endereco.toString(), titulo: titulo.slice(0, 120), descricao: descricao.slice(0, 300), texto, secoes, cores: coresDe(html), fontes: fontesDe(html) };
}
