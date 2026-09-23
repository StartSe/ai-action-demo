// Construção da página por etapas, em vez de uma única resposta gigante: primeiro a IA entende a referência (ou
// o briefing) e devolve um PLANO (título, paleta, fontes e a lista de seções); depois escreve UMA SEÇÃO POR VEZ;
// por fim o app monta o documento. Cada etapa cabe folgada na janela do modelo (uma página inteira de uma vez
// era o que fazia "a página veio pela metade"), e a tela acompanha o andamento: a lista de etapas e a prévia
// parcial são gravadas no projeto (lib/projetos.ts) depois de cada passo.
//
// Insumos: captura (visão, pelo provedor principal), endereço do site (HTML simplificado por lib/captura.ts, texto) ou
// briefing (texto). Em demonstração, a landing fixa de lib/demo.ts é montada seção a seção, com pausas, para o
// fluxo ser o mesmo.
import { ErroIA, meta, parseJSON, visionModelName, type Meta } from "./ai";
import { esperar, paginaDemo } from "./demo";
import { ACAO_ESCOLHER_MODELO, lerCaptura, metaTexto, sanitizarHtml, type OpcoesAssets } from "./gerador";
import { gerarJSON, gerarTexto, iaDisponivel, visaoDisponivel, provedor } from "./motor";
import type { Referencia } from "./captura";
import type { EtapaGeracao, Marca, ProgressoGeracao, Stack } from "./types";

export type Insumo =
  | { tipo: "referencia"; imagem: string }
  | { tipo: "endereco"; referencia: Referencia }
  | { tipo: "briefing"; briefing: string };

export type PedidoConstrucao = {
  insumo: Insumo;
  stack: Stack;
  marca?: Marca;
  instrucoes?: string;
  contexto?: string;
  assets?: OpcoesAssets;
};

export type SecaoPlano = { id: string; tipo: string; titulo: string; conteudo: string };
export type Plano = {
  titulo: string;
  paleta: { fundo: string; texto: string; primaria: string; secundaria: string };
  fontes: { titulos: string; corpo: string };
  secoes: SecaoPlano[];
};

/** Recebe o andamento depois de cada etapa; `htmlParcial` é a página com as seções prontas e marcadores nas demais. */
export type AoProgresso = (progresso: ProgressoGeracao, htmlParcial: string | null) => void;

export type Construido = { html: string; meta: Meta; demo: boolean; plano: Plano; progresso: ProgressoGeracao };

const MAXIMO_SECOES = 10;
const MINIMO_SECOES = 3;
const TOKENS_PLANO = 2500;
const TOKENS_SECAO = 3500;
const COR_HEX = /^#[0-9a-f]{6}$/i;

export const INSUMOS = {
  referencia: "captura de referência e cores da marca",
  endereco: "site de referência lido pelo endereço e cores da marca",
  briefing: "briefing da empresa e cores da marca",
} as const;

// ---------------------------------------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------------------------------------

const ID_PLANO = "plano";
const ID_MONTAGEM = "montagem";

function agora(): string {
  return new Date().toISOString();
}

class Andamento {
  etapas: EtapaGeracao[];
  constructor(private aoProgresso: AoProgresso | undefined, tituloPlano: string) {
    this.etapas = [{ id: ID_PLANO, titulo: tituloPlano, estado: "pendente" }];
  }
  get progresso(): ProgressoGeracao {
    return { etapas: this.etapas.map((e) => ({ ...e })), atualizadoEm: agora() };
  }
  definirSecoes(secoes: SecaoPlano[]) {
    this.etapas = [this.etapas[0], ...secoes.map((s) => ({ id: s.id, titulo: s.titulo, estado: "pendente" as const })), { id: ID_MONTAGEM, titulo: "Montar a página", estado: "pendente" }];
  }
  iniciar(id: string, htmlParcial: string | null = null) {
    const e = this.etapas.find((x) => x.id === id);
    if (e) { e.estado = "andamento"; e.iniciadoEm = agora(); delete e.detalhe; }
    this.aoProgresso?.(this.progresso, htmlParcial);
  }
  concluir(id: string, detalhe: string | undefined, htmlParcial: string | null) {
    const e = this.etapas.find((x) => x.id === id);
    if (e) { e.estado = "pronta"; e.terminadoEm = agora(); if (detalhe) e.detalhe = detalhe; }
    this.aoProgresso?.(this.progresso, htmlParcial);
  }
  falhar(id: string, detalhe: string) {
    const e = this.etapas.find((x) => x.id === id);
    if (e) { e.estado = "falhou"; e.terminadoEm = agora(); e.detalhe = detalhe; }
    this.aoProgresso?.(this.progresso, null);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------------------------------------

const REGRAS_GERAIS = `- Escreva TODOS os textos em português do Brasil. Textos de outra empresa (nome, slogan, produto, depoimento) são substituídos por textos equivalentes e plausíveis para a marca informada, com tamanho parecido para não quebrar o layout.
- Fotos, ilustrações, logotipos e ícones de terceiros NÃO são copiados nem carregados de outros sites: no lugar de cada imagem, um bloco (<div>) com as mesmas dimensões e posição, preenchido com a cor principal da marca (use var(--primaria)), com role="img" e aria-label descrevendo em português o que a imagem mostrava. Exceção: quando o pedido trouxer "Imagens da empresa", use essas imagens com <img> e os endereços exatos.
- Nunca escreva comentários no HTML nem placeholders como "<!-- repita -->": escreva o código completo de cada elemento repetido.
- Nenhum <script>, nenhum atributo de evento (onclick etc.), nada carregado de outras origens além do Google Fonts e do Tailwind.
- Funciona bem no celular (390 px) e no computador, com hierarquia tipográfica, bom contraste, espaçamento generoso, navegação por âncoras e foco visível. Nunca invente depoimentos, clientes, preços ou resultados.`;

function descreverMarca(marca?: Marca): string {
  if (!marca?.nome && !marca?.corPrimaria) return "Nenhuma marca foi informada: mantenha as cores da referência (ou escolha uma paleta sóbria) e use um nome de empresa fictício e neutro.";
  return `Marca: ${marca.nome || "não informada"}. Cor principal: ${marca.corPrimaria || "escolha uma cor sóbria"}.${marca.corSecundaria ? ` Cor secundária: ${marca.corSecundaria}.` : ""}`;
}

function descreverInsumo(insumo: Insumo): string {
  if (insumo.tipo === "referencia") return "a captura de tela anexada (a página de referência inteira)";
  if (insumo.tipo === "endereco") return `o site de referência ${insumo.referencia.url} (HTML simplificado abaixo)`;
  return "o briefing da empresa abaixo";
}

function blocoDoInsumo(insumo: Insumo): string {
  if (insumo.tipo === "endereco") {
    const r = insumo.referencia;
    return [
      `Título da página de referência: ${r.titulo}${r.descricao ? `\nDescrição: ${r.descricao}` : ""}`,
      r.cores.length ? `Cores encontradas: ${r.cores.join(", ")}` : "",
      r.fontes.length ? `Fontes encontradas: ${r.fontes.join(", ")}` : "",
      `HTML simplificado da referência (estrutura e textos; os estilos originais foram removidos):\n${r.texto}`,
    ].filter(Boolean).join("\n\n");
  }
  if (insumo.tipo === "briefing") return `Briefing da empresa:\n${insumo.briefing.trim()}`;
  return "";
}

const ESTRUTURA_BRIEFING = `Estrutura recomendada quando a referência é só um briefing (nesta ordem): cabeçalho com marca e menu curto; herói com título forte de até 12 palavras, frase de apoio e dois botões; três a seis benefícios ou serviços; "como funciona" em três passos; prova social somente quando os materiais fornecem depoimentos ou números reais; chamada final; rodapé com marca, contato e direitos.`;

const SYSTEM_PLANO = `Você é um diretor de arte e desenvolvedor front-end. Sua tarefa agora NÃO é escrever a página: é PLANEJAR a reconstrução dela em seções, para outro passo escrever uma seção por vez.
Devolva SOMENTE um JSON válido, sem markdown, neste formato:
{"titulo":"título da página (<title>)","paleta":{"fundo":"#hex","texto":"#hex","primaria":"#hex","secundaria":"#hex"},"fontes":{"titulos":"Nome da fonte no Google Fonts","corpo":"Nome da fonte no Google Fonts"},"secoes":[{"id":"cabecalho","tipo":"cabecalho|heroi|beneficios|como-funciona|produtos|depoimentos|precos|faq|cta|rodape|outro","titulo":"nome curto da seção em português","conteudo":"o que a seção contém: layout (colunas, alinhamento), textos visíveis (títulos, frases, botões, itens — resumidos mas completos o bastante para reescrever), quantidade de cartões/itens, imagens presentes"}]}
Regras:
- Entre ${MINIMO_SECOES} e ${MAXIMO_SECOES} seções, na ordem em que aparecem de cima para baixo. A primeira é o cabeçalho e a última é o rodapé. Se a referência tiver mais blocos que ${MAXIMO_SECOES}, agrupe blocos pequenos e vizinhos numa seção só.
- "id" em minúsculas, sem acento, só letras, números e hifens, único.
- "conteudo" é o que garante fidelidade: registre os textos e a quantidade de itens de cada bloco (ex.: "6 cartões com ícone, título e uma frase").
- Paleta e fontes: as da referência quando existem; a cor principal da marca informada substitui a cor de destaque da referência.
- Se a marca foi informada, os textos das seções já devem falar dela (nome e negócio plausível), nunca da empresa da referência.`;

function promptPlano(pedido: PedidoConstrucao): string {
  const linhas = [`Planeje a reconstrução da página a partir de ${descreverInsumo(pedido.insumo)}.`, descreverMarca(pedido.marca)];
  if (pedido.insumo.tipo === "briefing") linhas.push(ESTRUTURA_BRIEFING);
  if (pedido.contexto) linhas.push(pedido.contexto);
  if (pedido.assets?.blocoAssets) linhas.push(pedido.assets.blocoAssets);
  if (pedido.instrucoes?.trim()) linhas.push(`Instruções de quem pediu a página (valem para o plano):\n${pedido.instrucoes.trim()}`);
  const bloco = blocoDoInsumo(pedido.insumo);
  if (bloco) linhas.push(bloco);
  return linhas.join("\n\n");
}

function systemSecao(stack: Stack): string {
  const formato = stack === "html-tailwind"
    ? `- Estilize com classes utilitárias do Tailwind (o Tailwind pela CDN já está no <head> do documento final). Para as cores da marca use as variáveis CSS já definidas no documento: bg-[var(--primaria)], text-[var(--primaria)], bg-[var(--secundaria)], bg-[var(--fundo)], text-[var(--texto)]. Fontes: font-[family-name:var(--fonte-titulos)] nos títulos e a fonte do corpo já vale no body. Não escreva <style>.`
    : `- Estilize com CSS próprio dentro de UMA tag <style> no início da resposta, com TODOS os seletores prefixados pelo id da seção (ex.: #secao-heroi .titulo {...}) para não vazar para as outras seções. Use as variáveis CSS já definidas no documento: var(--primaria), var(--secundaria), var(--fundo), var(--texto), var(--fonte-titulos), var(--fonte-corpo). Sem biblioteca nenhuma. Inclua uma media query para telas até 768 px.`;
  return `Você é um desenvolvedor front-end especialista. A página está sendo reconstruída EM PARTES: você recebe o plano da página inteira e escreve SOMENTE UMA seção por vez, a que for pedida.
Regras:
- Devolva só o HTML dessa seção: um único elemento raiz (<header>, <section>, <footer> ou <nav>) com id="secao-<id>", sem <html>, <head>, <body>, sem markdown, sem \`\`\` e sem explicações antes ou depois.
- Reproduza a seção com fidelidade ao que o plano e a referência mostram: estrutura, alinhamento, espaçamentos, proporções, quantidade de itens (se são 6 cartões, escreva os 6), tamanhos de fonte, cantos arredondados.
- Mantenha a coerência com as seções anteriores: mesma paleta, mesmas fontes, mesma largura máxima de conteúdo (ex.: max-width 1200 px centralizado) e o mesmo padding lateral.
${formato}
${REGRAS_GERAIS}`;
}

function promptSecao(pedido: PedidoConstrucao, plano: Plano, indice: number, anterior: string | null): string {
  const secao = plano.secoes[indice];
  const lista = plano.secoes.map((s, i) => `${i + 1}. ${s.titulo}${i === indice ? "  ← ESCREVA ESTA" : ""}`).join("\n");
  const linhas = [
    `Escreva a seção ${indice + 1} de ${plano.secoes.length}: «${secao.titulo}» (tipo: ${secao.tipo}, id="secao-${secao.id}").`,
    `O que ela contém, segundo o plano:\n${secao.conteudo}`,
    `Página: ${plano.titulo}. Paleta: fundo ${plano.paleta.fundo}, texto ${plano.paleta.texto}, principal ${plano.paleta.primaria}, secundária ${plano.paleta.secundaria}. Fontes: títulos ${plano.fontes.titulos}, corpo ${plano.fontes.corpo}.`,
    `Todas as seções da página:\n${lista}`,
    descreverMarca(pedido.marca),
  ];
  if (pedido.assets?.blocoAssets?.trim()) linhas.push(pedido.assets.blocoAssets.trim());
  if (pedido.contexto) linhas.push(pedido.contexto);
  if (pedido.instrucoes?.trim()) linhas.push(`Instruções de quem pediu a página:\n${pedido.instrucoes.trim()}`);
  if (anterior) linhas.push(`Final da seção anterior, para manter o mesmo estilo (não repita este trecho):\n${anterior.slice(-700)}`);
  if (pedido.insumo.tipo === "referencia") linhas.push("A captura anexada é a página inteira: localize a parte que corresponde a esta seção e reproduza só ela.");
  else {
    const bloco = blocoDoInsumo(pedido.insumo);
    if (bloco) linhas.push(bloco);
  }
  return linhas.join("\n\n");
}

// ---------------------------------------------------------------------------------------------------------
// Validação das respostas
// ---------------------------------------------------------------------------------------------------------

function slugId(texto: string, indice: number): string {
  const base = String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return base || `secao-${indice + 1}`;
}

function corOu(valor: unknown, padrao: string): string {
  return typeof valor === "string" && COR_HEX.test(valor.trim()) ? valor.trim().toLowerCase() : padrao;
}

function fonteOu(valor: unknown, padrao: string): string {
  const nome = typeof valor === "string" ? valor.replace(/["']/g, "").trim() : "";
  return /^[A-Za-z][A-Za-z0-9 ]{1,40}$/.test(nome) ? nome : padrao;
}

/** Normaliza o plano devolvido pela IA: cores válidas, fontes plausíveis, ids únicos e entre 3 e 10 seções. */
export function normalizarPlano(bruto: unknown, marca?: Marca): Plano {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const paletaBruta = (b.paleta && typeof b.paleta === "object" ? b.paleta : {}) as Record<string, unknown>;
  const fontesBrutas = (b.fontes && typeof b.fontes === "object" ? b.fontes : {}) as Record<string, unknown>;
  const primaria = corOu(marca?.corPrimaria, corOu(paletaBruta.primaria, "#1f2937"));
  const secundaria = corOu(marca?.corSecundaria, corOu(paletaBruta.secundaria, "#f59e0b"));
  const secoesBrutas = Array.isArray(b.secoes) ? (b.secoes as Record<string, unknown>[]) : [];
  const vistos = new Set<string>();
  const secoes: SecaoPlano[] = secoesBrutas.slice(0, MAXIMO_SECOES).map((s, i) => {
    let id = slugId(String(s?.id ?? s?.titulo ?? ""), i);
    while (vistos.has(id)) id = `${id}-${i + 1}`;
    vistos.add(id);
    return {
      id,
      tipo: typeof s?.tipo === "string" ? s.tipo.slice(0, 30) : "outro",
      titulo: (typeof s?.titulo === "string" && s.titulo.trim() ? s.titulo.trim() : `Seção ${i + 1}`).slice(0, 60),
      conteudo: (typeof s?.conteudo === "string" ? s.conteudo.trim() : "").slice(0, 2500) || "Reproduza esta parte da referência.",
    };
  });
  if (secoes.length < MINIMO_SECOES) throw new ErroIA("resposta_invalida", "A IA não conseguiu dividir a referência em seções. Tente de novo; se repetir, escolha um modelo mais forte.", 502, ACAO_ESCOLHER_MODELO);
  return {
    titulo: (typeof b.titulo === "string" && b.titulo.trim() ? b.titulo.trim() : marca?.nome ? `Página de ${marca.nome}` : "Página gerada").slice(0, 120),
    paleta: { fundo: corOu(paletaBruta.fundo, "#ffffff"), texto: corOu(paletaBruta.texto, "#111827"), primaria, secundaria },
    fontes: { titulos: fonteOu(fontesBrutas.titulos, "Inter"), corpo: fonteOu(fontesBrutas.corpo, "Inter") },
    secoes,
  };
}

/**
 * Recorta a resposta da IA para o HTML da seção: tira cercas de markdown; se veio um documento inteiro, fica só o
 * conteúdo do <body>; separa os <style> (formato CSS) do markup. Lança quando não há markup aproveitável.
 */
export function extrairFragmento(texto: string, secao: SecaoPlano): { html: string; css: string } {
  let t = String(texto).replace(/```(?:html|css)?/gi, "").trim();
  const corpo = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(t);
  if (corpo) t = corpo[1];
  t = t.replace(/<\/?(html|head|body)\b[^>]*>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "").trim();
  const estilos: string[] = [];
  t = t.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => { estilos.push(css.trim()); return ""; }).trim();
  // Explicações antes/depois do elemento raiz saem: fica do primeiro "<" ao último ">".
  const inicio = t.indexOf("<");
  const fim = t.lastIndexOf(">");
  if (inicio < 0 || fim <= inicio) throw new Error(`A seção «${secao.titulo}» veio sem código.`);
  t = t.slice(inicio, fim + 1);
  if (!/<(header|section|footer|nav|div|main|article)\b/i.test(t)) throw new Error(`A seção «${secao.titulo}» veio em um formato inesperado.`);
  // Garante o id da seção no elemento raiz (a tela e o agente localizam as seções por ele).
  if (!new RegExp(`id=["']secao-${secao.id}["']`).test(t)) {
    t = t.replace(/^<([a-z][a-z0-9-]*)\b([^>]*)>/i, (_m, tag: string, atributos: string) => `<${tag} id="secao-${secao.id}"${atributos.replace(/\s+id\s*=\s*(?:"[^"]*"|'[^']*')/i, "")}>`);
  }
  return { html: t, css: estilos.join("\n") };
}

// ---------------------------------------------------------------------------------------------------------
// Montagem do documento
// ---------------------------------------------------------------------------------------------------------

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function linkGoogleFonts(fontes: Plano["fontes"]): string {
  const familias = [...new Set([fontes.titulos, fontes.corpo])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`);
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link href="https://fonts.googleapis.com/css2?${familias.join("&")}&display=swap" rel="stylesheet">`;
}

function cabecaDocumento(plano: Plano, stack: Stack, cssExtra: string): string {
  const { paleta, fontes } = plano;
  const base = `:root{--primaria:${paleta.primaria};--secundaria:${paleta.secundaria};--fundo:${paleta.fundo};--texto:${paleta.texto};--fonte-titulos:'${fontes.titulos}',ui-sans-serif,system-ui,sans-serif;--fonte-corpo:'${fontes.corpo}',ui-sans-serif,system-ui,sans-serif}
    html{scroll-behavior:smooth}
    body{margin:0;background:var(--fundo);color:var(--texto);font-family:var(--fonte-corpo);-webkit-font-smoothing:antialiased}
    h1,h2,h3,h4{font-family:var(--fonte-titulos)}
    img{max-width:100%;display:block}`;
  const reset = stack === "html-css" ? `\n    *,*::before,*::after{box-sizing:border-box}\n    a{color:inherit}\n    button{font:inherit}` : "";
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaparHtml(plano.titulo)}</title>
  ${stack === "html-tailwind" ? '<script src="https://cdn.tailwindcss.com"></script>\n  ' : ""}${linkGoogleFonts(fontes)}
  <style>
    ${base}${reset}
${cssExtra ? `    ${cssExtra.split("\n").join("\n    ")}\n` : ""}  </style>
</head>`;
}

/** Marcador de uma seção ainda não escrita, para a prévia parcial: tracejado, com o nome da seção. */
function marcador(secao: SecaoPlano, andamento: boolean): string {
  const texto = andamento ? `Escrevendo «${escaparHtml(secao.titulo)}»...` : `«${escaparHtml(secao.titulo)}» vem a seguir`;
  const estilo = `margin:16px;padding:44px 24px;border:2px dashed ${andamento ? "var(--primaria)" : "#cbd5e1"};border-radius:16px;text-align:center;color:${andamento ? "var(--primaria)" : "#94a3b8"};font:600 15px/1.4 system-ui,sans-serif;background:${andamento ? "color-mix(in srgb, var(--primaria) 6%, transparent)" : "transparent"}`;
  return `<section id="secao-${secao.id}" data-marcador="${andamento ? "andamento" : "pendente"}" style="${estilo}">${texto}</section>`;
}

/** O documento inteiro: cabeça (Tailwind, fontes, variáveis da paleta, CSS das seções) e as seções na ordem. */
export function montarDocumento(plano: Plano, stack: Stack, fragmentos: { html: string; css: string }[]): string {
  const css = fragmentos.map((f) => f.css).filter(Boolean).join("\n");
  return `<!DOCTYPE html>\n<html lang="pt-BR">\n${cabecaDocumento(plano, stack, css)}\n<body>\n${fragmentos.map((f) => f.html).join("\n")}\n</body>\n</html>`;
}

function documentoParcial(plano: Plano, stack: Stack, prontos: { html: string; css: string }[], emAndamento: number): string {
  const partes = plano.secoes.map((s, i) => (i < prontos.length ? prontos[i] : { html: marcador(s, i === emAndamento), css: "" }));
  return montarDocumento(plano, stack, partes);
}

// ---------------------------------------------------------------------------------------------------------
// Demonstração: a landing fixa, fatiada em seções
// ---------------------------------------------------------------------------------------------------------

/** Elementos de primeiro nível do <body> (header, section, main, footer, nav, div), com as tags balanceadas. */
export function fatiarBody(html: string): { cabeca: string; secoes: string[] } {
  const cabeca = /<head\b[^>]*>[\s\S]*?<\/head>/i.exec(html)?.[0] ?? "";
  const corpo = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  const secoes: string[] = [];
  const abre = /<(header|section|main|footer|nav|div|aside|article)\b[^>]*>|<\/(header|section|main|footer|nav|div|aside|article)\s*>/gi;
  let profundidade = 0;
  let inicio = -1;
  for (const m of corpo.matchAll(abre)) {
    const ehFechamento = m[0].startsWith("</");
    if (!ehFechamento) {
      if (profundidade === 0) inicio = m.index;
      profundidade++;
    } else {
      profundidade = Math.max(0, profundidade - 1);
      if (profundidade === 0 && inicio >= 0) {
        secoes.push(corpo.slice(inicio, m.index + m[0].length).trim());
        inicio = -1;
      }
    }
  }
  return { cabeca, secoes };
}

function tituloDaFatia(fatia: string, i: number): string {
  const tag = /^<([a-z]+)/i.exec(fatia)?.[1]?.toLowerCase();
  if (tag === "header") return "Cabeçalho";
  if (tag === "footer") return "Rodapé";
  const titulo = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(fatia)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return titulo ? titulo.slice(0, 48) : `Seção ${i + 1}`;
}

async function construirDemo(pedido: PedidoConstrucao, aoProgresso: AoProgresso | undefined): Promise<Construido> {
  const insumo = pedido.insumo;
  const html = paginaDemo({ stack: pedido.stack, marca: pedido.marca, briefing: insumo.tipo === "briefing" ? insumo.briefing : undefined, ...pedido.assets?.demoAssets });
  const { cabeca, secoes } = fatiarBody(html);
  const plano: Plano = {
    titulo: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "Página de exemplo",
    paleta: { fundo: "#ffffff", texto: "#0f172a", primaria: pedido.marca?.corPrimaria || "#0f766e", secundaria: pedido.marca?.corSecundaria ?? "#f59e0b" },
    fontes: { titulos: "Inter", corpo: "Inter" },
    secoes: secoes.map((s, i) => ({ id: slugId(tituloDaFatia(s, i), i), tipo: "outro", titulo: tituloDaFatia(s, i), conteudo: "" })),
  };
  const andamento = new Andamento(aoProgresso, insumo.tipo === "briefing" ? "Entender o briefing" : "Entender a referência");
  andamento.iniciar(ID_PLANO);
  await esperar(900);
  andamento.definirSecoes(plano.secoes);
  andamento.concluir(ID_PLANO, `${plano.secoes.length} seções planejadas (exemplo)`, null);
  const prontos: string[] = [];
  const parcial = (emAndamento: number) => {
    const partes = plano.secoes.map((s, i) => (i < prontos.length ? prontos[i] : marcador(s, i === emAndamento)));
    return `<!DOCTYPE html>\n<html lang="pt-BR">\n${cabeca.replace("</head>", `<style>:root{--primaria:${plano.paleta.primaria}}</style></head>`)}\n<body class="bg-white text-slate-900 antialiased">\n${partes.join("\n")}\n</body>\n</html>`;
  };
  for (let i = 0; i < secoes.length; i++) {
    andamento.iniciar(plano.secoes[i].id, parcial(i));
    await esperar(650);
    prontos.push(secoes[i]);
    andamento.concluir(plano.secoes[i].id, "Pronta (exemplo)", parcial(i + 1));
  }
  andamento.iniciar(ID_MONTAGEM, parcial(secoes.length));
  await esperar(400);
  const metaGerada = meta({ demo: true, insumo: INSUMOS[insumo.tipo] });
  andamento.concluir(ID_MONTAGEM, "Página de exemplo montada", html);
  return { html, meta: metaGerada, demo: true, plano, progresso: andamento.progresso };
}

// ---------------------------------------------------------------------------------------------------------
// Construção com IA
// ---------------------------------------------------------------------------------------------------------

async function pedirPlano(pedido: PedidoConstrucao): Promise<Plano> {
  const prompt = promptPlano(pedido);
  if (pedido.insumo.tipo === "referencia") {
    const imagem = pedido.insumo.imagem;
    const tentar = async () => parseJSON(await lerCaptura({ system: `${SYSTEM_PLANO}\n\nResponda somente com JSON válido, sem comentários e sem blocos de código markdown.`, prompt, imagem, maxTokens: TOKENS_PLANO }));
    try {
      return normalizarPlano(await tentar(), pedido.marca);
    } catch (err) {
      if (err instanceof ErroIA && err.codigo !== "resposta_invalida") throw err;
      return normalizarPlano(await tentar(), pedido.marca);
    }
  }
  return normalizarPlano(await gerarJSON({ system: SYSTEM_PLANO, prompt, maxTokens: TOKENS_PLANO }), pedido.marca);
}

async function pedirSecao(pedido: PedidoConstrucao, plano: Plano, indice: number, anterior: string | null): Promise<{ html: string; css: string }> {
  const system = systemSecao(pedido.stack);
  const prompt = promptSecao(pedido, plano, indice, anterior);
  const secao = plano.secoes[indice];
  const chamar = () =>
    pedido.insumo.tipo === "referencia"
      ? lerCaptura({ system, prompt, imagem: pedido.insumo.imagem, maxTokens: TOKENS_SECAO })
      : gerarTexto({ system, prompt, maxTokens: TOKENS_SECAO, temperature: 0.3 });
  try {
    return extrairFragmento(await chamar(), secao);
  } catch (err) {
    if (err instanceof ErroIA) throw err;
    // Resposta sem código aproveitável: uma segunda tentativa antes de desistir desta seção.
    try {
      return extrairFragmento(await chamar(), secao);
    } catch (err2) {
      if (err2 instanceof ErroIA) throw err2;
      throw new ErroIA("resposta_invalida", `A seção «${secao.titulo}» não ficou pronta: a IA não devolveu o código dela. Tente de novo; se repetir, escolha um modelo mais forte.`, 502, ACAO_ESCOLHER_MODELO);
    }
  }
}

/**
 * Constrói a página por etapas e avisa o andamento. Em demonstração (sem IA para o insumo), monta a landing fixa
 * seção a seção. Lança ErroIA/ErroCaptura com a etapa já marcada como falha no último `aoProgresso`.
 */
export async function construirSite(pedido: PedidoConstrucao, aoProgresso?: AoProgresso): Promise<Construido> {
  const insumo = pedido.insumo;
  const temIA = insumo.tipo === "referencia" ? await visaoDisponivel() : await iaDisponivel();
  if (!temIA) return construirDemo(pedido, aoProgresso);

  const andamento = new Andamento(aoProgresso, insumo.tipo === "briefing" ? "Entender o briefing" : "Entender a referência");
  andamento.iniciar(ID_PLANO);
  let plano: Plano;
  try {
    plano = await pedirPlano(pedido);
  } catch (err) {
    andamento.falhar(ID_PLANO, err instanceof Error ? err.message : "Não foi possível planejar a página.");
    throw err;
  }
  andamento.definirSecoes(plano.secoes);
  andamento.concluir(ID_PLANO, `${plano.secoes.length} seções: ${plano.secoes.map((s) => s.titulo).join(", ")}`, documentoParcial(plano, pedido.stack, [], -1));

  const prontos: { html: string; css: string }[] = [];
  for (let i = 0; i < plano.secoes.length; i++) {
    const secao = plano.secoes[i];
    andamento.iniciar(secao.id, documentoParcial(plano, pedido.stack, prontos, i));
    try {
      const fragmento = await pedirSecao(pedido, plano, i, prontos.length ? prontos[prontos.length - 1].html : null);
      prontos.push(fragmento);
    } catch (err) {
      andamento.falhar(secao.id, err instanceof Error ? err.message : "A seção não ficou pronta.");
      throw err;
    }
    andamento.concluir(secao.id, `${Math.round(prontos[i].html.length / 1000)} mil caracteres`, documentoParcial(plano, pedido.stack, prontos, i + 1));
  }

  andamento.iniciar(ID_MONTAGEM, documentoParcial(plano, pedido.stack, prontos, -1));
  const html = sanitizarHtml(montarDocumento(plano, pedido.stack, prontos), pedido.stack);
  const metaGerada: Meta = insumo.tipo === "referencia" && provedor() === "openrouter" ? { ...meta({ demo: false, insumo: INSUMOS.referencia }), model: visionModelName() } : metaTexto(INSUMOS[insumo.tipo]);
  andamento.concluir(ID_MONTAGEM, `${plano.secoes.length} seções, ${Math.round(html.length / 1000)} mil caracteres`, html);
  return { html, meta: metaGerada, demo: false, plano, progresso: andamento.progresso };
}
