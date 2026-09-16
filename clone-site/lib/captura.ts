// Como a captura chega ao app quando a pessoa não tem o arquivo em mãos:
// (1) `baixarImagem` busca uma imagem já publicada em um endereço http/https (o campo "ou cole um
//     endereço" e a ferramenta gerar_pagina do MCP usam esta função);
// (2) `capturarSite` usa o serviço de captura configurado em /setup (chave simples) para fotografar a
//     página inteira a partir do endereço do site.
// Nenhuma mensagem daqui mostra código HTTP nem corpo do serviço: o detalhe vai só para console.error.
import { getConfig } from "./store";

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB

/** Endereços de rede interna: um endereço colado no formulário nunca deve virar uma chamada à rede do servidor. */
const HOSTS_BLOQUEADOS = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|.*\.local|.*\.internal)$/i;

/** Falha ao trazer a captura de fora: `status` vira o código da rota, `acao` o botão da tela. */
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

const ACAO_CONECTAR_CAPTURA = { rotulo: "Conectar o serviço de captura", url: "/setup#captura" };

/** Endereço http/https público, fora da rede interna. Lança ErroCaptura quando não serve. */
function enderecoPublico(url: string): URL {
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

// ---------------------------------------------------------------------------------------------------------
// Captura do site inteiro pelo serviço configurado em /setup (integração opcional "captura")
// ---------------------------------------------------------------------------------------------------------

export const CHAVE_CAPTURA = "SCREENSHOTONE_ACCESS_KEY";

export function capturaConfigurada(): boolean {
  return Boolean(getConfig(CHAVE_CAPTURA));
}

/** Endereço da foto da página inteira no serviço de captura. Exportado para o teste do cartão de /setup. */
export function urlDoServico(chave: string, site: string): string {
  const parametros = new URLSearchParams({
    access_key: chave,
    url: site,
    full_page: "true",
    format: "jpg",
    image_quality: "80",
    viewport_width: "1400",
    block_ads: "true",
    block_cookie_banners: "true",
    cache: "true",
  });
  return `https://api.screenshotone.com/take?${parametros.toString()}`;
}

/** Fotografa a página inteira do site informado e devolve a captura como data URL. */
export async function capturarSite(site: string): Promise<string> {
  const chave = getConfig(CHAVE_CAPTURA);
  if (!chave) {
    throw new ErroCaptura(
      "Para gerar a página a partir do endereço do site, conecte o serviço de captura em Configurações. Ou envie a imagem da referência aqui.",
      400,
      ACAO_CONECTAR_CAPTURA
    );
  }
  const endereco = enderecoPublico(site);
  const resposta = await fetch(urlDoServico(chave, endereco.toString()), { signal: AbortSignal.timeout(90_000) }).catch((err) => {
    console.error("Falha de rede ao capturar o site:", err);
    throw new ErroCaptura("O serviço de captura não respondeu. Tente de novo em um minuto.", 502);
  });
  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    console.error("Falha do serviço de captura:", resposta.status, detalhe.slice(0, 200));
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroCaptura("A chave do serviço de captura foi recusada. Confira em Configurações.", 401, ACAO_CONECTAR_CAPTURA);
    }
    if (resposta.status === 429) {
      throw new ErroCaptura("As capturas do mês acabaram nesse serviço. Envie a imagem da referência ou amplie o plano.", 429, ACAO_CONECTAR_CAPTURA);
    }
    throw new ErroCaptura("O serviço não conseguiu fotografar essa página. Confira o endereço ou envie a imagem da referência.", 502);
  }
  return comoDataUrl(resposta, "serviço de captura");
}

/** Um endereço que termina em .png/.jpg já é a própria captura; qualquer outro é o site a fotografar. */
export function pareceImagem(url: string): boolean {
  return /\.(png|jpe?g)(\?|#|$)/i.test(url.trim());
}
