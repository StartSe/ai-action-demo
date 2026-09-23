/**
 * O atendente escrito a partir de duas frases sobre o negócio.
 *
 * Quem abre o passo 1 do Assistente hoje encontra um formulário com marcadores para preencher. Aqui o
 * caminho é o contrário: a pessoa descreve o negócio como contaria a um amigo ("clínica odontológica
 * em Curitiba, 3 dentistas, atendemos convênios") e recebe o atendente montado — nome, objetivo, tom,
 * saudação e a base — para revisar. Nada é salvo: `gerarPersona` só devolve o rascunho, e a pessoa
 * continua saindo do passo 1 pelo "Salvar e testar o atendente" de sempre.
 *
 * Duas regras que valem mais do que qualquer outra coisa deste arquivo:
 *
 * 1. **O atendente não inventa dado de negócio.** Preço, prazo, endereço e telefone que não estiverem
 *    no texto da pessoa continuam como `[MARCADORES]` na base (lib/base-modelo.ts) — um marcador
 *    esquecido incomoda na tela, mas um preço inventado vira uma promessa ao cliente.
 * 2. **Sem IA conectada, o app diz que é um exemplo.** `lib/persona-exemplos.ts` traz cinco negócios
 *    prontos e as `decisoes` abrem com "Este é um atendente de exemplo" — nunca fingimos ter lido a
 *    descrição de quem escreveu.
 *
 * Por que um módulo próprio e não `lib/atendente.ts`: aquele arquivo é a orquestração da RESPOSTA ao
 * cliente (histórico, ferramentas, transferência). Isto é configuração, roda uma vez e não encosta em
 * conversa nenhuma.
 */
import { aiEnabled, askJSON } from "./ai";
import { MODELOS_DE_BASE } from "./base-modelo";
import { decisoesDeExemplo, exemploParaBrief } from "./persona-exemplos";
import type { Objetivo, PersonaGerada, Tom } from "./types";

export type { PersonaGerada };

/** Limites do que a pessoa escreve: menos que isso não descreve um negócio, mais que isso é um site. */
export const BRIEF_MINIMO = 20;
export const BRIEF_MAXIMO = 1000;

/** O que a rota devolve: a persona, o aviso do site (quando ele não pôde ser lido) e se veio de exemplo. */
export interface GeracaoPersona {
  persona: PersonaGerada;
  /** Frase para a tela quando algo deu errado sem impedir a geração (hoje só a leitura do site). */
  aviso?: string;
  /** Verdadeiro quando a persona saiu de lib/persona-exemplos.ts, sem IA nenhuma. */
  demo: boolean;
}

export const AVISO_SITE_FALHOU = "Não consegui ler o site. Gerei só com a sua descrição.";

const OBJETIVOS: Objetivo[] = ["atendimento", "vendas", "agendamentos", "outro"];
const TONS: Tom[] = ["profissional", "amigavel", "personalizado"];

/** Tetos de cada campo gerado, para um modelo prolixo não encher o formulário de texto. */
const LIMITE_NOME = 60;
const LIMITE_LINHA = 240;
const LIMITE_PERGUNTA = 120;
const LIMITE_DECISAO = 200;
const LIMITE_BASE = 12000;

// --- Leitura do site ------------------------------------------------------------------------------

/** Nada de rede interna: o endereço vem de quem está usando o app, e ele não é um caminho para dentro. */
function enderecoPermitido(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "::1" || host === "0.0.0.0" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

/** Tempo e tamanho máximos de uma leitura de site: 10 s e 1 MB. */
const SITE_TEMPO_MS = 10_000;
const SITE_BYTES = 1024 * 1024;
const SITE_CARACTERES = 20_000;

/**
 * As entidades HTML que aparecem de verdade em página brasileira antiga (&atilde;, &ccedil;) mais as
 * numéricas. Site em UTF-8 já manda o caractere pronto; esta tabela é para quem ainda não manda.
 */
const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", auml: "ä",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  iacute: "í", igrave: "ì", icirc: "î",
  oacute: "ó", ograve: "ò", ocirc: "ô", otilde: "õ", ouml: "ö",
  uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü",
  ccedil: "ç", ntilde: "ñ",
};

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
    .replace(/&([a-zA-Z]+);/g, (inteiro, nome: string) => {
      const minusculo = nome.toLowerCase();
      const valor = ENTIDADES[minusculo];
      if (!valor) return inteiro;
      // &Atilde; é a mesma letra em maiúscula: a tabela guarda só a minúscula.
      return nome[0] === nome[0]!.toUpperCase() && minusculo !== nome ? valor.toUpperCase() : valor;
    });
}

/** Tira scripts, estilos e tags, devolve texto corrido. Entidades comuns viram o caractere de verdade. */
function textoDoHtml(html: string): string {
  const semTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decodificarEntidades(semTags)
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * O texto visível de uma página, para somar ao que a pessoa escreveu. Devolve `null` em qualquer
 * tropeço (endereço recusado, tempo esgotado, resposta que não é página) — quem chama vira isso num
 * aviso e segue com a descrição, porque o site é opcional e a geração não pode parar por causa dele.
 */
export async function lerSite(endereco: string): Promise<string | null> {
  const bruto = String(endereco || "").trim();
  if (!bruto) return null;
  let url: URL;
  try {
    // Quem escreve "www.empresa.com.br" quer dizer https; quem escreveu um esquema (inclusive um que
    // não serve, como ftp:) tem o endereço lido como está, para a regra de protocolo abaixo recusá-lo.
    url = new URL(bruto.includes("://") ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }
  if (!enderecoPermitido(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(SITE_TEMPO_MS),
      headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
    });
    if (!res.ok || !res.body) return null;
    // Um redirecionamento pode ter levado para dentro da rede: o endereço final vale a mesma regra.
    try {
      if (res.url && !enderecoPermitido(new URL(res.url))) return null;
    } catch {
      return null;
    }
    const tipo = (res.headers.get("content-type") || "").toLowerCase();
    if (tipo && !tipo.includes("text/html") && !tipo.includes("text/plain") && !tipo.includes("xml")) return null;
    const pedacos: Uint8Array[] = [];
    let total = 0;
    for await (const pedaco of res.body as unknown as AsyncIterable<Uint8Array>) {
      pedacos.push(pedaco);
      total += pedaco.length;
      if (total >= SITE_BYTES) break;
    }
    const html = Buffer.concat(pedacos.map((p) => Buffer.from(p))).subarray(0, SITE_BYTES).toString("utf8");
    const texto = textoDoHtml(html).slice(0, SITE_CARACTERES);
    return texto.length > 40 ? texto : null;
  } catch (err) {
    console.error("Não foi possível ler o site informado no Assistente", err);
    return null;
  }
}

// --- Geração --------------------------------------------------------------------------------------

const SYSTEM = `Você monta o atendente virtual de uma empresa a partir da descrição que a dona do negócio escreveu.

Escreva tudo em português do Brasil, em linguagem simples, sem jargão e sem termos em inglês.

Regras que não podem ser quebradas:
- NUNCA invente preço, prazo, endereço, telefone, convênio, forma de pagamento ou nome de produto que não esteja na descrição. O que faltar continua como marcador em MAIÚSCULAS entre colchetes, exatamente como no modelo.
- Use o modelo de base do objetivo escolhido como estrutura: mantenha os títulos das seções e preencha as linhas que a descrição permitir, deixando o resto como marcador.
- O nome da empresa é o que estiver na descrição; se não houver nome, use um nome curto e descritivo do ramo.
- O nome do atendente é um primeiro nome brasileiro curto, fácil de ler no WhatsApp.
- A saudação tem uma frase só, apresenta o atendente e a empresa e convida o cliente a dizer o que precisa.
- As três perguntas sugeridas são perguntas que um cliente de verdade faria a esse negócio, escritas como ele escreveria no WhatsApp.
- As três decisões explicam, em uma frase cada e em linguagem de negócio, o que você decidiu e por quê. Uma delas diz o que ficou em aberto por falta de informação. Nada de termos técnicos.

Objetivos possíveis: atendimento (tira dúvidas e informa), vendas (apresenta e ajuda a fechar), agendamentos (marca horários ou encaminha à equipe), outro (quando nenhum dos três serve; aí escreva objetivoTexto em uma linha).
Tons possíveis: profissional (clara e objetiva), amigavel (próxima e acolhedora), personalizado (aí escreva tomTexto em uma linha).

Responda com este JSON:
{"atendente":"","negocio":"","objetivo":"atendimento|vendas|agendamentos|outro","objetivoTexto":"","tom":"profissional|amigavel|personalizado","tomTexto":"","saudacao":"","baseConhecimento":"","perguntasSugeridas":["","",""],"decisoes":["","",""]}

Deixe objetivoTexto e tomTexto vazios quando não forem necessários.`;

/** Os quatro modelos de base vão inteiros no prompt: é o objetivo escolhido pela IA que decide qual usar. */
function modelosParaOPrompt(): string {
  return OBJETIVOS.map((o) => `### Modelo do objetivo "${o}"\n${MODELOS_DE_BASE[o]}`).join("\n\n");
}

/**
 * O atendente proposto para a descrição. Sem chave da IA, devolve a persona de exemplo mais parecida
 * com o que foi escrito (e diz isso nas decisões). Com IA, o site — quando informado — é lido e somado
 * à descrição; se ele não puder ser lido, a geração segue com um aviso, nunca com um erro.
 */
export async function gerarPersona({ brief, site }: { brief: string; site?: string }): Promise<GeracaoPersona> {
  const descricao = String(brief || "").trim();
  if (!aiEnabled()) {
    const exemplo = exemploParaBrief(descricao);
    return { persona: { ...exemplo.persona, decisoes: decisoesDeExemplo(exemplo) }, demo: true };
  }

  let aviso: string | undefined;
  let textoDoSite: string | null = null;
  if (site && String(site).trim()) {
    textoDoSite = await lerSite(site);
    if (!textoDoSite) aviso = AVISO_SITE_FALHOU;
  }

  const prompt = `Descrição do negócio, escrita pela dona:
"""
${descricao}
"""
${textoDoSite ? `\nTexto do site da empresa (use só o que for fato sobre o negócio):\n"""\n${textoDoSite}\n"""\n` : ""}
Modelos de base, um por objetivo. Use o do objetivo que você escolher:

${modelosParaOPrompt()}`;

  const bruto = await askJSON<Partial<PersonaGerada>>({ system: SYSTEM, prompt, maxTokens: 3000 });
  return { persona: normalizarPersona(bruto, descricao), aviso, demo: false };
}

function texto(valor: unknown, limite: number): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim().slice(0, limite);
}

function lista(valor: unknown, limite: number, quantos: number): string[] {
  const itens = Array.isArray(valor) ? valor : [];
  return itens.map((i) => texto(i, limite)).filter(Boolean).slice(0, quantos);
}

/**
 * O que a IA devolveu, virado num rascunho que o formulário aceita: valor fora da lista cai no padrão,
 * campo vazio herda do exemplo mais parecido (o formulário nunca abre com um buraco) e cada texto
 * respeita o teto do campo correspondente na tela.
 */
export function normalizarPersona(bruto: Partial<PersonaGerada>, brief: string): PersonaGerada {
  const reserva = exemploParaBrief(brief).persona;
  const objetivo = OBJETIVOS.includes(bruto.objetivo as Objetivo) ? (bruto.objetivo as Objetivo) : "atendimento";
  const tom = TONS.includes(bruto.tom as Tom) ? (bruto.tom as Tom) : "profissional";
  const objetivoTexto = texto(bruto.objetivoTexto, LIMITE_LINHA);
  const tomTexto = texto(bruto.tomTexto, LIMITE_LINHA);
  const perguntas = lista(bruto.perguntasSugeridas, LIMITE_PERGUNTA, 3);
  const decisoes = lista(bruto.decisoes, LIMITE_DECISAO, 3);
  const base = String(bruto.baseConhecimento ?? "").trim().slice(0, LIMITE_BASE);
  // "Outro" sem a linha que o explica e "personalizado" sem o estilo escrito não passam na validação de
  // PUT /api/config: os dois caem no padrão da tela em vez de deixarem o formulário num estado inválido.
  const objetivoValido: Objetivo = objetivo === "outro" && !objetivoTexto ? "atendimento" : objetivo;
  const tomValido: Tom = tom === "personalizado" && !tomTexto ? "profissional" : tom;
  return {
    atendente: texto(bruto.atendente, LIMITE_NOME) || reserva.atendente,
    negocio: texto(bruto.negocio, LIMITE_NOME) || reserva.negocio,
    objetivo: objetivoValido,
    ...(objetivoValido === "outro" ? { objetivoTexto } : {}),
    tom: tomValido,
    ...(tomValido === "personalizado" ? { tomTexto } : {}),
    saudacao: texto(bruto.saudacao, LIMITE_LINHA) || reserva.saudacao,
    baseConhecimento: base || reserva.baseConhecimento,
    perguntasSugeridas: perguntas.length ? perguntas : reserva.perguntasSugeridas,
    decisoes,
  };
}
