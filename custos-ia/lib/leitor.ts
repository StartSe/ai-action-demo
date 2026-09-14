// Leitor de notas/recibos de ferramentas de IA: recebe o texto de um documento (PDF extraído, corpo de
// e-mail, imagem transcrita) e devolve uma Fatura pronta para a prévia — ou null quando o documento não
// é uma cobrança de ferramenta de IA. Usado pelo upload (app/api/faturas/upload, US-020) e pela
// importação do Gmail (US-021). Nada é gravado aqui: quem grava é lib/faturas.ts depois da confirmação.
//
// Toda validação numérica/temporal acontece no servidor, nunca é confiada ao modelo: valor > 0, data
// real no formato AAAA-MM-DD, moeda conhecida, periodicidade conhecida. valorBRL é calculado aqui com
// o câmbio salvo em /setup (lib/integracoes.ts), não pedido à IA.
import crypto from "node:crypto";
import { aiEnabled, askJSON } from "./ai";
import { esperar } from "./demo";
import { converterParaBRL } from "./integracoes";
import type { Fatura, Moeda } from "./types";

export type EntradaDocumento = {
  texto: string;
  nomeArquivo?: string;
  assunto?: string;
  remetente?: string;
  /** Origem gravada na fatura quando confirmada. O upload usa "upload"; a importação de e-mail usa "email". */
  origem?: Fatura["origem"];
};

const MOEDAS: Moeda[] = ["BRL", "USD", "EUR"];
const PERIODICIDADES: Fatura["periodicidade"][] = ["mensal", "anual", "unica"];

/** Limite de texto enviado ao modelo: uma nota cabe folgado; evita mandar um PDF de 200 páginas inteiro. */
const LIMITE_TEXTO = 12_000;

const SYSTEM = `Você lê notas fiscais, faturas e recibos e extrai os dados de cobrança de FERRAMENTAS DE INTELIGÊNCIA ARTIFICIAL (assistentes como ChatGPT, Claude, Gemini, Copilot; geração de imagem, vídeo ou voz como Midjourney, Runway, ElevenLabs; créditos de API de modelos como OpenAI, Anthropic, OpenRouter; recursos de IA embutidos em outros produtos, como Notion AI ou Zapier AI, quando a cobrança é do recurso de IA).

Devolva um único objeto JSON com exatamente estes campos:
{
  "ehCobrancaDeIA": boolean,          // false quando o documento não é uma cobrança de ferramenta de IA (ex.: aluguel, passagem, nota de restaurante, contrato, texto qualquer)
  "fornecedor": string,               // empresa que cobra, nome curto (ex.: "OpenAI", "Anthropic", "GitHub")
  "ferramenta": string,               // produto/plano cobrado (ex.: "ChatGPT Team", "Claude for Work", "GitHub Copilot Business")
  "categoria": string,                // uma destas: "Assistente de texto", "Código", "Imagem", "Vídeo", "Voz", "API de modelos", "Produtividade", "Outra"
  "valor": number,                    // valor TOTAL cobrado, número com ponto decimal, na moeda do documento
  "moeda": "BRL" | "USD" | "EUR",
  "data": "AAAA-MM-DD",               // data de emissão/cobrança; se só houver o período, use o primeiro dia dele
  "periodicidade": "mensal" | "anual" | "unica"
}

Regras: nunca invente valores — se um campo não estiver no documento, deixe string vazia ou 0. Use o total pago (com impostos), não subtotais nem parcelas. Se o documento tiver várias cobranças de IA, some-as e descreva a ferramenta principal. Responda só com o JSON.`;

type RespostaLeitor = {
  ehCobrancaDeIA?: boolean;
  fornecedor?: string;
  ferramenta?: string;
  categoria?: string;
  valor?: number | string;
  moeda?: string;
  data?: string;
  periodicidade?: string;
};

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Data válida de verdade (não só o formato): rejeita 2026-02-31 e datas futuras absurdas. */
export function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return false;
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() + 1);
  return ano >= 2000 && d <= limite;
}

/** Converte "1.234,56", "1,234.56", "US$ 640.00" etc. em número; NaN quando não dá. */
export function interpretarValor(bruto: unknown): number {
  if (typeof bruto === "number") return bruto;
  let s = String(bruto ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!s) return NaN;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  if (ultimaVirgula > ultimoPonto) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return Number(s);
}

/** Monta a Fatura final a partir do que a IA devolveu, validando tudo no servidor. Devolve null quando falta algo essencial. */
export function montarFatura(resposta: RespostaLeitor, entrada: EntradaDocumento): Fatura | null {
  if (resposta.ehCobrancaDeIA === false) return null;
  const fornecedor = String(resposta.fornecedor || "").trim();
  const ferramenta = String(resposta.ferramenta || fornecedor).trim();
  const valor = Math.round(interpretarValor(resposta.valor) * 100) / 100;
  const moedaBruta = String(resposta.moeda || "").toUpperCase().trim();
  const moeda = MOEDAS.find((m) => m === moedaBruta);
  const data = String(resposta.data || "").trim().slice(0, 10);
  const periodicidadeBruta = String(resposta.periodicidade || "mensal").toLowerCase().trim();
  const periodicidade = PERIODICIDADES.find((p) => p === periodicidadeBruta) || "mensal";

  if (!fornecedor || !ferramenta) return null;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  if (!moeda) return null;
  if (!dataValida(data)) return null;

  return {
    id: gerarId(),
    fornecedor,
    ferramenta,
    categoria: String(resposta.categoria || "Outra").trim() || "Outra",
    valor,
    moeda,
    valorBRL: converterParaBRL(valor, moeda),
    data,
    periodicidade,
    origem: entrada.origem || "upload",
    referencia: entrada.nomeArquivo || entrada.assunto || undefined,
    criadoEm: new Date().toISOString(),
  };
}

/** Sem chave de IA: uma fatura fictícia por documento, sempre rotulada como exemplo, para a prévia ser demonstrável. */
const EXEMPLOS_DEMO: Array<Pick<Fatura, "fornecedor" | "ferramenta" | "categoria" | "valor" | "moeda">> = [
  { fornecedor: "OpenAI", ferramenta: "ChatGPT Team", categoria: "Assistente de texto", valor: 150, moeda: "USD" },
  { fornecedor: "Anthropic", ferramenta: "Claude for Work", categoria: "Assistente de texto", valor: 210, moeda: "USD" },
  { fornecedor: "GitHub", ferramenta: "GitHub Copilot Business", categoria: "Código", valor: 95, moeda: "USD" },
  { fornecedor: "Midjourney", ferramenta: "Midjourney Standard", categoria: "Imagem", valor: 30, moeda: "USD" },
  { fornecedor: "ElevenLabs", ferramenta: "ElevenLabs Creator", categoria: "Voz", valor: 22, moeda: "USD" },
];

function indiceDeterministico(texto: string): number {
  let h = 0;
  for (let i = 0; i < Math.min(texto.length, 2000); i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h % EXEMPLOS_DEMO.length;
}

function faturaDemo(entrada: EntradaDocumento): Fatura {
  const exemplo = EXEMPLOS_DEMO[indiceDeterministico(entrada.texto + (entrada.nomeArquivo || ""))];
  const hoje = new Date();
  const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const nome = entrada.nomeArquivo || entrada.assunto || "documento";
  return {
    id: gerarId(),
    ...exemplo,
    categoria: `Exemplo (modo demonstração) · ${exemplo.categoria}`,
    valorBRL: converterParaBRL(exemplo.valor, exemplo.moeda),
    data,
    periodicidade: "mensal",
    origem: entrada.origem || "upload",
    referencia: `Exemplo de demonstração — ${nome}`,
    criadoEm: new Date().toISOString(),
  };
}

/** Triagem barata, sem IA, usada só no modo demonstração: um documento sem nenhum sinal de cobrança
 * (moeda, "total", "fatura", "invoice"...) não vira fatura de exemplo — senão um poema ou uma ata de
 * reunião apareceriam como nota na prévia e a demonstração pareceria quebrada. */
export function pareceCobranca(texto: string): boolean {
  const t = texto.toLowerCase();
  const temMoeda = /(r\$|us\$|\$|€|\b(usd|eur|brl)\b)/.test(t);
  const temPalavra = /\b(invoice|fatura|nota fiscal|recibo|receipt|total|amount|valor|cobran[çc]a|pagamento|payment|subscription|assinatura|billing)\b/.test(t);
  return temMoeda || temPalavra;
}

/** Lê um documento e devolve a fatura reconhecida, ou null quando não é cobrança de ferramenta de IA. */
export async function lerDocumento(entrada: EntradaDocumento): Promise<Fatura | null> {
  const texto = String(entrada.texto || "").trim();
  if (!texto) return null;

  if (!aiEnabled()) {
    await esperar(400);
    return pareceCobranca(texto) ? faturaDemo(entrada) : null;
  }

  const contexto: string[] = [];
  if (entrada.nomeArquivo) contexto.push(`Nome do arquivo: ${entrada.nomeArquivo}`);
  if (entrada.assunto) contexto.push(`Assunto do e-mail: ${entrada.assunto}`);
  if (entrada.remetente) contexto.push(`Remetente: ${entrada.remetente}`);

  const prompt = `${contexto.length ? `${contexto.join("\n")}\n\n` : ""}Documento:\n"""\n${texto.slice(0, LIMITE_TEXTO)}\n"""`;
  const resposta = await askJSON<RespostaLeitor>({ system: SYSTEM, prompt, maxTokens: 600 });
  return montarFatura(resposta || {}, entrada);
}
