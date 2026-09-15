// Criação dos três conceitos a partir do briefing, compartilhada entre a rota HTTP (app/api/conceitos/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { randomBytes } from "node:crypto";
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { conceitosDemo, distribuirSegundos, esperar } from "./demo";
import { atualizarSaida, salvar } from "./historico";
import { DURACOES, EFEITOS, FORMATOS, OBJETIVOS, type Briefing, type Campanha, type Cena, type Conceito, type Duracao, type EntradaCampanha, type Formato, type Objetivo } from "./types";

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB
export const LIMITE_TEXTO = 600;
export const CENAS_POR_CONCEITO = 3;

/** Erro de entrada (o pedido está errado): a rota responde 400. */
export class ErroDePedido extends Error {}

/** Confere que a imagem é uma data URL PNG/JPG de até 5 MB e devolve o tamanho decodificado. */
export function validarImagem(imagem: unknown): { ok: true; tamanho: number } | { ok: false; erro: string } {
  if (typeof imagem !== "string" || !imagem) return { ok: false, erro: "Envie a imagem do produto em PNG ou JPG." };
  const m = /^data:(image\/png|image\/jpeg|image\/jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(imagem);
  if (!m) return { ok: false, erro: "A imagem do produto precisa ser PNG ou JPG." };
  const base64 = m[2].replace(/\s/g, "");
  const tamanho = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (tamanho <= 0) return { ok: false, erro: "A imagem enviada está vazia." };
  if (tamanho > LIMITE_IMAGEM_BYTES) return { ok: false, erro: "A imagem passa de 5 MB. Reduza e envie de novo." };
  return { ok: true, tamanho };
}

function texto(valor: unknown, limite = LIMITE_TEXTO): string {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

/** Normaliza o briefing vindo do formulário ou do assistente; lança ErroDePedido quando algo está errado. */
export function normalizarBriefing(bruto: unknown): Briefing {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;

  const produto = texto(b.produto);
  if (!produto) throw new ErroDePedido("Descreva o produto ou a oferta da campanha.");

  const objetivo = b.objetivo === undefined || b.objetivo === "" ? "lancamento" : b.objetivo;
  if (!OBJETIVOS.some((o) => o.valor === objetivo)) throw new ErroDePedido(`Objetivo inválido. Use um destes: ${OBJETIVOS.map((o) => o.valor).join(", ")}.`);

  const formato = b.formato === undefined || b.formato === "" ? "9:16" : b.formato;
  if (!FORMATOS.some((f) => f.valor === formato)) throw new ErroDePedido(`Formato inválido. Use um destes: ${FORMATOS.map((f) => f.valor).join(", ")}.`);

  const duracaoBruta = b.duracaoSeg === undefined || b.duracaoSeg === "" ? 10 : Number(b.duracaoSeg);
  if (!DURACOES.includes(duracaoBruta as Duracao)) throw new ErroDePedido(`Duração inválida. Use ${DURACOES.join(", ")} segundos.`);

  const briefing: Briefing = {
    produto,
    publico: texto(b.publico),
    objetivo: objetivo as Objetivo,
    tom: texto(b.tom, 200),
    formato: formato as Formato,
    duracaoSeg: duracaoBruta as Duracao,
  };

  if (b.imagemDataUrl !== undefined && b.imagemDataUrl !== null && b.imagemDataUrl !== "") {
    const imagem = validarImagem(b.imagemDataUrl);
    if (!imagem.ok) throw new ErroDePedido(imagem.erro);
    briefing.imagemDataUrl = b.imagemDataUrl as string;
  }
  return briefing;
}

// ---------------------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------------------

export const SYSTEM = `Você é diretor de criação de uma agência de publicidade brasileira, especialista em vídeos curtos de campanha (5 a 15 segundos) para redes sociais.
Você recebe o briefing de uma campanha e propõe três conceitos diferentes de vídeo. O vídeo será gerado por uma ferramenta de IA a partir da imagem do produto enviada pelo cliente, animada com um efeito visual; por isso cada cena descreve o que acontece com essa imagem (movimento de câmera, luz, fundo, entrada de texto), nunca pessoas reais, atores, locações filmadas ou marcas de terceiros.

Regras:
- Exatamente 3 conceitos, com ângulos distintos entre si (por exemplo: benefício principal, momento de uso ou companhia, antes e depois, prova ou comparação, emoção).
- Cada conceito tem exatamente ${CENAS_POR_CONCEITO} cenas. A soma dos segundos das cenas é exatamente a duração pedida; cada cena dura pelo menos 1 segundo, em números inteiros.
- "textoNaTela" é o texto que aparece sobre o vídeo: até 6 palavras, em português do Brasil, sem emojis, sem aspas.
- "cena" descreve em uma frase o que se vê (ex.: "o produto no centro, fundo escuro, a câmera se aproxima devagar").
- "efeitoSugerido" é um destes nomes, copiado exatamente: ${EFEITOS.join(", ")}.
- "chamada" é a frase curta de ação da campanha (ex.: "Conheça o lançamento").
- "legenda" traz um texto pronto para publicar em cada rede: "instagram" (2 a 3 frases, quebra de linha e até 5 hashtags no fim), "linkedin" (tom profissional, 3 a 4 frases, no máximo 2 hashtags) e "tiktok" (1 a 2 frases curtas e até 4 hashtags).
- Todo o texto em português do Brasil, no tom pedido no briefing, sem inventar preços, prazos ou promessas que não estejam no briefing.

Devolva exatamente este JSON:
{"conceitos":[{"titulo":"...","roteiro":[{"cena":"...","segundos":3,"textoNaTela":"..."}],"efeitoSugerido":"...","chamada":"...","legenda":{"instagram":"...","linkedin":"...","tiktok":"..."}}]}`;

export function montarPrompt(b: Briefing): string {
  const objetivo = OBJETIVOS.find((o) => o.valor === b.objetivo)?.rotulo ?? b.objetivo;
  const formato = FORMATOS.find((f) => f.valor === b.formato)?.rotulo ?? b.formato;
  return [
    `Produto ou oferta: ${b.produto}`,
    `Para quem: ${b.publico || "não informado"}`,
    `Objetivo da campanha: ${objetivo}`,
    `Tom: ${b.tom || "à sua escolha, adequado ao produto"}`,
    `Formato do vídeo: ${formato}`,
    `Duração total: ${b.duracaoSeg} segundos (a soma das ${CENAS_POR_CONCEITO} cenas de cada conceito precisa dar exatamente ${b.duracaoSeg}).`,
    b.imagemDataUrl ? "O cliente enviou a imagem do produto; ela é a base visual de todas as cenas." : "O cliente ainda não enviou a imagem do produto; descreva as cenas como se ela existisse.",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------
// Normalização da resposta
// ---------------------------------------------------------------------------------------------------------

function novoId(): string {
  return randomBytes(6).toString("base64url");
}

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Casa o efeito devolvido pela IA com a lista interna (por nome, sem acento); sem casamento, alterna pela posição. */
export function escolherEfeito(sugerido: unknown, indice: number): string {
  const s = semAcentos(texto(sugerido, 80));
  if (s) {
    const exato = EFEITOS.find((e) => semAcentos(e) === s);
    if (exato) return exato;
    const parcial = EFEITOS.find((e) => s.includes(semAcentos(e)) || semAcentos(e).includes(s));
    if (parcial) return parcial;
    const primeira = s.split(/\s+/)[0];
    const porPalavra = EFEITOS.find((e) => semAcentos(e).split(/\s+/).includes(primeira));
    if (porPalavra) return porPalavra;
  }
  return EFEITOS[indice % EFEITOS.length];
}

/** Garante exatamente CENAS_POR_CONCEITO cenas cujos segundos inteiros somam a duração. */
export function ajustarRoteiro(bruto: unknown, duracaoSeg: number, fechamento: string): Cena[] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const cenas: Cena[] = lista.slice(0, CENAS_POR_CONCEITO).map((c) => {
    const item = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    return { cena: texto(item.cena) || "O produto em destaque.", segundos: Number(item.segundos) || 0, textoNaTela: texto(item.textoNaTela, 80) };
  });
  while (cenas.length < CENAS_POR_CONCEITO) {
    cenas.push({ cena: "Fechamento com o produto parado e a chamada em destaque.", segundos: 0, textoNaTela: fechamento });
  }
  const soma = cenas.reduce((a, c) => a + c.segundos, 0);
  const inteiros = cenas.every((c) => Number.isInteger(c.segundos) && c.segundos >= 1);
  if (soma !== duracaoSeg || !inteiros) {
    const ajustados = distribuirSegundos(duracaoSeg, cenas.map((c) => c.segundos));
    cenas.forEach((c, i) => { c.segundos = ajustados[i]; });
  }
  cenas.forEach((c, i) => { if (!c.textoNaTela) c.textoNaTela = i === cenas.length - 1 ? fechamento : c.cena.split(/[,.]/)[0].slice(0, 40); });
  return cenas;
}

/** Transforma a resposta da IA (ou o exemplo) em exatamente três conceitos válidos, com ids novos. */
export function normalizarConceitos(bruto: unknown, briefing: Briefing): Conceito[] {
  const raiz = (bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>).conceitos : bruto) ?? [];
  const lista = Array.isArray(raiz) ? raiz : [];
  if (lista.length < 3) throw new Error("A IA devolveu menos de três conceitos. Tente de novo.");

  return lista.slice(0, 3).map((item, i) => {
    const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const titulo = texto(c.titulo, 120) || `Conceito ${i + 1}`;
    const chamada = texto(c.chamada, 120) || `Conheça ${briefing.produto}`;
    const legenda = (c.legenda && typeof c.legenda === "object" ? c.legenda : {}) as Record<string, unknown>;
    const padrao = `${titulo}. ${chamada}`;
    return {
      id: novoId(),
      titulo,
      roteiro: ajustarRoteiro(c.roteiro, briefing.duracaoSeg, chamada),
      efeitoSugerido: escolherEfeito(c.efeitoSugerido, i),
      chamada,
      legenda: {
        instagram: texto(legenda.instagram, 1500) || padrao,
        linkedin: texto(legenda.linkedin, 2000) || padrao,
        tiktok: texto(legenda.tiktok, 600) || padrao,
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Criação e gravação
// ---------------------------------------------------------------------------------------------------------

/** Três conceitos para o briefing: pela IA (askJSON) ou, sem chave, o exemplo fictício. */
export async function criarConceitos(briefing: Briefing): Promise<Conceito[]> {
  if (!aiEnabled()) {
    await esperar(1400);
    return normalizarConceitos(conceitosDemo(briefing), briefing);
  }
  const resposta = await askJSON<unknown>({ system: SYSTEM, prompt: montarPrompt(briefing), maxTokens: 3500 });
  return normalizarConceitos(resposta, briefing);
}

export const INSUMO = "seu briefing da campanha";
export const INSUMO_COM_IMAGEM = "seu briefing e da imagem do produto";

export function tituloCampanha(briefing: Briefing): string {
  return briefing.produto.slice(0, 80);
}

/** Cria os conceitos, salva a campanha no histórico (tipo "campanha") e devolve com a proveniência. */
export async function gerarCampanha(briefing: Briefing): Promise<{ demo: boolean; campanha: Campanha; meta: Meta; id: string }> {
  const conceitos = await criarConceitos(briefing);
  const demo = !aiEnabled();
  const metaGerada = meta({ demo, insumo: briefing.imagemDataUrl ? INSUMO_COM_IMAGEM : INSUMO });
  const titulo = tituloCampanha(briefing);

  const { imagemDataUrl, ...semImagem } = briefing;
  const imagem = imagemDataUrl ? validarImagem(imagemDataUrl) : null;
  const entrada: EntradaCampanha = { ...semImagem, tamanhoImagem: imagem && imagem.ok ? imagem.tamanho : 0 };

  const id = salvar({ tipo: "campanha", titulo, entrada, saida: { id: "", titulo, briefing, conceitos }, meta: metaGerada });
  const campanha: Campanha = { id, titulo, briefing, conceitos };
  atualizarSaida(id, campanha);
  return { demo, campanha, meta: metaGerada, id };
}
