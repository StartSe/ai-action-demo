// Leitura da página do produto (US-004): o gestor cola o endereço e a IA aprende o que a empresa vende
// sem ele digitar nada. Server-only, sem nenhuma dependência nova — `fetch` do Node e um normalizador
// de HTML escrito à mão, que é o suficiente para virar texto de prompt (não precisamos de um DOM).
//
// O endereço vem de quem está usando o app, então **toda** busca aqui é uma requisição que um
// estranho manda o nosso servidor fazer. Por isso o endereço é conferido antes do `fetch` e de novo a
// cada redirecionamento, contra o nome e contra o **IP resolvido** — um domínio público pode apontar
// para 127.0.0.1 ou para o endereço interno da nuvem, e só olhar o texto do endereço não pegaria isso.
import dns from "node:dns/promises";
import net from "node:net";

/** Códigos de falha; cada um vira uma frase de negócio na rota (nunca o erro técnico na tela). */
export type ErroExtracao =
  | "endereco_invalido"
  | "endereco_interno"
  | "sem_resposta"
  | "tipo_nao_suportado"
  | "grande_demais"
  | "conteudo_curto";

// `codigo` é declarado e atribuído à mão, em vez de `constructor(readonly codigo: ...)`: propriedade
// de parâmetro é sintaxe que o TypeScript precisa *transformar*, e o Node só sabe **apagar** tipos
// (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). O Next compila as duas formas, mas rodar este arquivo direto
// pelo Node — como os testes deste PRD fazem — só funciona assim.
export class FalhaExtracao extends Error {
  codigo: ErroExtracao;

  constructor(codigo: ErroExtracao, mensagemTecnica: string) {
    super(mensagemTecnica);
    this.name = "FalhaExtracao";
    this.codigo = codigo;
  }
}

export type PaginaExtraida = { url: string; titulo: string; texto: string };

const LIMITE_BYTES = 2 * 1024 * 1024; // 2 MB
const LIMITE_MS = 15_000;
const LIMITE_CARACTERES = 40_000;
const MINIMO_UTEIS = 200;
const MAX_REDIRECIONAMENTOS = 3;
const AGENTE = "SimuladorDeVendas/1.0 (+leitor de página de produto)";

/** true para qualquer endereço que não deva sair para a internet pública. */
function ipPrivado(ip: string): boolean {
  const versao = net.isIP(ip);
  if (versao === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (inclui o metadata da nuvem)
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // multicast e reservados
    return false;
  }
  if (versao === 6) {
    const normalizado = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (normalizado === "::1" || normalizado === "::") return true;
    if (normalizado.startsWith("fe80")) return true; // link-local
    if (/^f[cd]/.test(normalizado)) return true; // fc00::/7, endereços únicos locais
    // ::ffff:10.0.0.1 e afins: IPv4 embrulhado em IPv6
    const embrulhado = normalizado.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (embrulhado) return ipPrivado(embrulhado[1]);
    return false;
  }
  return true; // não é um IP reconhecível: por segurança, trata como interno
}

/**
 * Confere um endereço antes de buscá-lo: esquema, nome e **todos** os IPs para os quais o nome
 * resolve. Lança `FalhaExtracao` quando o endereço não pode ser buscado.
 */
export async function conferirEndereco(bruto: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new FalhaExtracao("endereco_invalido", `Endereço que não é uma URL: ${bruto}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FalhaExtracao("endereco_invalido", `Esquema fora de http/https: ${url.protocol}`);
  }

  if (url.username || url.password) throw new FalhaExtracao("endereco_invalido", "Não use credenciais no endereço.");

  const nome = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (nome === "localhost" || nome.endsWith(".localhost") || nome.endsWith(".internal") || nome.endsWith(".local")) {
    throw new FalhaExtracao("endereco_interno", `Nome interno: ${nome}`);
  }
  if (net.isIP(nome) && ipPrivado(nome)) {
    throw new FalhaExtracao("endereco_interno", `Endereço interno informado direto: ${nome}`);
  }

  if (!net.isIP(nome)) {
    let enderecos: { address: string }[];
    try {
      enderecos = await dns.lookup(nome, { all: true });
    } catch (err) {
      throw new FalhaExtracao("sem_resposta", `Não foi possível resolver ${nome}: ${String(err)}`);
    }
    if (!enderecos.length) throw new FalhaExtracao("sem_resposta", `${nome} não resolveu para nenhum endereço`);
    // Basta um endereço interno para recusar: não dá para escolher qual o fetch vai usar.
    const interno = enderecos.find((e) => ipPrivado(e.address));
    if (interno) throw new FalhaExtracao("endereco_interno", `${nome} resolve para um endereço interno (${interno.address})`);
  }

  return url;
}

/** Busca seguindo redirecionamentos na mão, conferindo cada destino (o `fetch` sozinho não confere). */
async function buscar(enderecoInicial: string): Promise<{ resposta: Response; url: URL }> {
  let url = await conferirEndereco(enderecoInicial);

  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), LIMITE_MS);
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        redirect: "manual",
        signal: controle.signal,
        headers: { "User-Agent": AGENTE, Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      });
    } catch (err) {
      throw new FalhaExtracao("sem_resposta", `Falha ao buscar ${url.href}: ${String(err)}`);
    } finally {
      clearTimeout(prazo);
    }

    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get("location");
      if (!destino) throw new FalhaExtracao("sem_resposta", `Redirecionamento sem destino em ${url.href}`);
      if (salto === MAX_REDIRECIONAMENTOS) throw new FalhaExtracao("sem_resposta", `Mais de ${MAX_REDIRECIONAMENTOS} redirecionamentos a partir de ${enderecoInicial}`);
      url = await conferirEndereco(new URL(destino, url).href);
      continue;
    }

    if (!resposta.ok) throw new FalhaExtracao("sem_resposta", `${url.href} respondeu ${resposta.status}`);
    return { resposta, url };
  }
  throw new FalhaExtracao("sem_resposta", `Redirecionamentos demais a partir de ${enderecoInicial}`);
}

/** Lê no máximo 2 MB do corpo, sem nunca carregar uma resposta gigante inteira na memória. */
async function lerLimitado(resposta: Response): Promise<string> {
  const declarado = Number(resposta.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_BYTES) throw new FalhaExtracao("grande_demais", `Content-Length de ${declarado} bytes`);

  const corpo = resposta.body;
  if (!corpo) return "";
  const pedacos: Uint8Array[] = [];
  let total = 0;
  const leitor = corpo.getReader();
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_BYTES) throw new FalhaExtracao("grande_demais", `Corpo passou de ${LIMITE_BYTES} bytes`);
      pedacos.push(value);
    }
  } finally {
    await leitor.cancel().catch(() => {});
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(pedacos));
}

const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'",
  "&ndash;": "–", "&mdash;": "—", "&hellip;": "…", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”",
  "&laquo;": "«", "&raquo;": "»", "&bull;": "•", "&middot;": "·", "&deg;": "°", "&euro;": "€", "&pound;": "£",
  "&reg;": "®", "&copy;": "©", "&trade;": "™", "&times;": "×", "&ordm;": "º", "&ordf;": "ª", "&szlig;": "ß",
};

/**
 * Acentos por composição, em vez de uma tabela com as ~60 entidades acentuadas do HTML: `&aacute;` é
 * "a" + acento agudo, `&ccedil;` é "c" + cedilha. Cobre a acentuação inteira do português (e de
 * qualquer outra língua latina) com sete linhas. Sem isso, uma página brasileira chegava ao prompt
 * escrita "implanta&ccedil;&atilde;o" — foi o que o teste desta história pegou.
 */
const ACENTOS: Record<string, string> = {
  acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈", ring: "̊", cedil: "̧",
};

function decodificarEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (entidade, corpo: string) => {
    const conhecida = ENTIDADES[entidade.toLowerCase()];
    if (conhecida) return conhecida;

    if (corpo.startsWith("#x") || corpo.startsWith("#X")) {
      const ponto = Number.parseInt(corpo.slice(2), 16);
      return Number.isFinite(ponto) ? String.fromCodePoint(ponto) : entidade;
    }
    if (corpo.startsWith("#")) {
      const ponto = Number(corpo.slice(1));
      return Number.isFinite(ponto) ? String.fromCodePoint(ponto) : entidade;
    }

    const acentuada = corpo.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|ring|cedil)$/);
    if (acentuada) return (acentuada[1] + ACENTOS[acentuada[2]]).normalize("NFC");

    return entidade; // entidade desconhecida fica como está, nunca vira lixo
  });
}

/** O título da página, para a lista de materiais mostrar algo melhor que o endereço cru. */
function tituloDe(html: string): string {
  const achado = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return achado ? decodificarEntidades(achado[1]).replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

/**
 * HTML → texto em linhas. Não é um parser: é uma limpeza para virar prompt. O que importa é que o
 * conteúdo de venda (títulos, parágrafos, itens de lista) sobreviva e que menu, rodapé, script e
 * estilo não entrem — eles enchem o prompt de "Entrar", "Política de privacidade" e nada de produto.
 */
export function normalizarHtml(html: string): string {
  let texto = html;

  // Fora: comentários e todo bloco que não é conteúdo de leitura.
  texto = texto.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of ["script", "style", "noscript", "template", "svg", "nav", "footer", "header", "aside", "form", "iframe"]) {
    texto = texto.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }

  // Quebra de linha onde havia bloco: cada título, parágrafo e item de lista vira uma linha.
  texto = texto.replace(/<\/(h[1-6]|p|li|div|section|article|tr|blockquote)>/gi, "\n");
  texto = texto.replace(/<(br|hr)\s*\/?>/gi, "\n");
  texto = texto.replace(/<li\b[^>]*>/gi, "\n- ");
  texto = texto.replace(/<\/(td|th)>/gi, " | ");

  // O resto das tags (com os atributos) some.
  texto = texto.replace(/<[^>]+>/g, " ");
  texto = decodificarEntidades(texto);

  return texto
    .split("\n")
    .map((linha) => linha.replace(/[ \t ]+/g, " ").trim())
    .filter((linha) => linha && linha !== "-")
    // Linhas repetidas seguidas (menu que sobrou, "Saiba mais" em cada cartão) só atrapalham o prompt.
    .filter((linha, i, todas) => linha !== todas[i - 1])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, LIMITE_CARACTERES);
}

/** Quanto do texto é conteúdo de verdade, para recusar uma página que só tem menu e botão. */
function caracteresUteis(texto: string): number {
  return texto.replace(/[\s\-|]/g, "").length;
}

/** Busca a página e devolve o texto pronto para virar material do produto. Lança `FalhaExtracao`. */
export async function extrairPagina(endereco: string): Promise<PaginaExtraida> {
  const { resposta, url } = await buscar(endereco.trim());

  const tipo = (resposta.headers.get("content-type") ?? "").toLowerCase();
  if (!tipo.includes("text/html") && !tipo.includes("text/plain")) {
    throw new FalhaExtracao("tipo_nao_suportado", `Content-Type ${tipo || "(ausente)"} em ${url.href}`);
  }

  const bruto = await lerLimitado(resposta);
  const ehHtml = tipo.includes("text/html");
  const texto = ehHtml ? normalizarHtml(bruto) : bruto.replace(/[ \t]+/g, " ").trim().slice(0, LIMITE_CARACTERES);

  if (caracteresUteis(texto) < MINIMO_UTEIS) {
    throw new FalhaExtracao("conteudo_curto", `Só ${caracteresUteis(texto)} caracteres úteis em ${url.href}`);
  }

  return { url: url.href, titulo: ehHtml ? tituloDe(bruto) : "", texto };
}
