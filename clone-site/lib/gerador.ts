// Geração da página a partir da captura, compartilhada entre a rota HTTP (app/api/pagina/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
// O prompt de sistema é portado e traduzido do projeto aberto screenshot-to-code (abi/screenshot-to-code),
// adaptado para um único arquivo HTML em português e com as imagens de terceiros substituídas por blocos
// na cor da marca.
import { askVision, meta, visionEnabled, visionModelName, type Meta } from "./ai";
import { esperar, paginaDemo } from "./demo";
import { atualizarSaida, salvar } from "./historico";
import type { EntradaPagina, Marca, Pagina, Pedido, Stack, Versao } from "./types";

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024; // 5 MB
export const STACKS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

const REGRAS_COMUNS = `- Reproduza a estrutura, o alinhamento, os espaçamentos, as cores de fundo e de texto, os tamanhos de fonte e as proporções exatamente como aparecem na captura. Preste atenção em padding, margin, bordas e cantos arredondados.
- Escreva TODOS os textos em português do Brasil. Se a referência estiver em outro idioma, traduza. Se um texto for de outra empresa (nome, slogan, produto, depoimento), substitua por um texto equivalente e plausível para a marca informada, mantendo o tamanho parecido para não quebrar o layout.
- Repita os elementos quantas vezes for preciso para bater com a captura. Se há 6 cartões, escreva os 6. NUNCA escreva comentários como "<!-- repita para os outros itens -->" no lugar do código: escreva o código completo.
- Não escreva nenhum comentário no HTML.
- Fotos, ilustrações, logotipos e ícones de terceiros NÃO devem ser copiados nem carregados de outros sites: no lugar de cada imagem, coloque um bloco (<div>) com as mesmas dimensões e posição, preenchido com a cor principal da marca, com role="img" e um aria-label descrevendo em português o que a imagem mostrava (ex.: "Foto de uma equipe reunida em volta de uma mesa"). Ícones pequenos podem ser blocos arredondados na cor da marca ou caracteres simples.
- Use fontes do Google Fonts (<link> em https://fonts.googleapis.com) para chegar perto da tipografia da captura.
- Não inclua nenhum <script> além do permitido para o formato. Não use onclick nem outros atributos de evento. Não carregue nada de outras origens além do Google Fonts e do Tailwind.
- A página deve funcionar bem no celular (largura de 390 px) e no computador.
- Devolva somente o código completo, começando em <html> e terminando em </html>, sem markdown, sem \`\`\` e sem explicações antes ou depois.`;

export const SYSTEM_TAILWIND = `Você é um desenvolvedor front-end especialista em Tailwind CSS.
Você recebe a captura de tela de uma página web de referência e constrói uma página completa, em um único arquivo HTML, usando Tailwind e HTML puro, sem JavaScript próprio.

Regras:
- Inclua o Tailwind exatamente com esta linha no <head>: <script src="https://cdn.tailwindcss.com"></script>. Esse é o único <script> permitido.
- Use classes utilitárias do Tailwind para todo o estilo; um <style> pequeno só é aceitável para cores da marca e para a família de fonte.
${REGRAS_COMUNS}`;

export const SYSTEM_CSS = `Você é um desenvolvedor front-end especialista em HTML e CSS.
Você recebe a captura de tela de uma página web de referência e constrói uma página completa, em um único arquivo HTML, com todo o CSS escrito à mão dentro de uma única tag <style> no <head>, sem nenhuma biblioteca e sem nenhum <script>.

Regras:
- Nenhum <script> é permitido neste formato.
- Use CSS moderno (flexbox, grid, variáveis CSS) e uma media query para telas até 768 px.
${REGRAS_COMUNS}`;

/** Bloco do pedido do usuário que acompanha a imagem: marca, instruções e formato. */
export function montarPrompt(pedido: Pick<Pedido, "instrucoes" | "marca" | "stack">): string {
  const linhas = ["Gere a página a partir desta captura de referência."];
  if (pedido.marca?.nome || pedido.marca?.corPrimaria) {
    linhas.push(
      `Marca: ${pedido.marca.nome || "não informada"}. Cor principal: ${pedido.marca.corPrimaria || "escolha uma cor sóbria"}.${pedido.marca.corSecundaria ? ` Cor secundária: ${pedido.marca.corSecundaria}.` : ""} Use essas cores nos botões, destaques e blocos que substituem imagens.`
    );
  } else {
    linhas.push("Nenhuma marca foi informada: mantenha as cores da referência e use um nome de empresa fictício e neutro nos textos.");
  }
  if (pedido.instrucoes?.trim()) linhas.push(`Instruções adicionais de quem pediu a página:\n${pedido.instrucoes.trim()}`);
  linhas.push(`Formato: ${pedido.stack === "html-css" ? "HTML com CSS próprio em <style>" : "HTML com Tailwind pela CDN"}.`);
  return linhas.join("\n\n");
}

/** Recorta a resposta da IA para o trecho <html>...</html> e garante que abre e fecha. */
export function extrairHtml(texto: string): string {
  const t = String(texto).replace(/```(?:html)?/gi, "").trim();
  const inicio = t.search(/<html[\s>]/i);
  const fimIdx = t.toLowerCase().lastIndexOf("</html>");
  if (inicio < 0 || fimIdx < 0 || fimIdx < inicio) {
    throw new Error("A IA não devolveu uma página completa. Tente de novo ou envie uma captura mais nítida.");
  }
  const html = t.slice(inicio, fimIdx + "</html>".length);
  if (!/<body[\s>]/i.test(html) || !/<\/body>/i.test(html)) {
    throw new Error("A IA devolveu uma página sem corpo. Tente de novo.");
  }
  return `<!DOCTYPE html>\n${html}`;
}

const TAILWIND_CDN = /^https:\/\/cdn\.tailwindcss\.com(\/|\?|$)/i;

/** Remove todo <script> que não seja o Tailwind pela CDN (inclusive scripts inline), atributos de evento e links javascript:. */
export function sanitizarHtml(html: string, stack: Stack): string {
  let saida = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, (bloco, atributos: string) => {
    if (stack !== "html-tailwind") return "";
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(atributos)?.[1];
    return src && TAILWIND_CDN.test(src) ? `<script src="https://cdn.tailwindcss.com"></script>` : "";
  });
  saida = saida.replace(/<script\b[^>]*\/?>/gi, "");
  // Sem molduras aninhadas nem objetos embutidos: a prévia e a página publicada só carregam o que o HTML declara.
  saida = saida.replace(/<(iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<(iframe|object|embed|base)\b[^>]*\/?>/gi, "");
  saida = saida.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  saida = saida.replace(/\b(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  return saida;
}

/** Título da página: o <title> do HTML, o nome da marca ou um texto padrão. */
export function tituloDaPagina(html: string, marca?: Marca): string {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim();
  if (titulo) return titulo.slice(0, 120);
  if (marca?.nome?.trim()) return `Página de ${marca.nome.trim()}`;
  return "Página gerada";
}

/** Confere que a data URL é PNG ou JPG e cabe no limite; devolve o tamanho em bytes. */
export function validarImagem(imagem: unknown): { ok: true; tamanho: number } | { ok: false; erro: string } {
  if (typeof imagem !== "string" || !imagem) return { ok: false, erro: "Envie a captura da página de referência (PNG ou JPG)." };
  const m = /^data:(image\/png|image\/jpeg|image\/jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(imagem);
  if (!m) return { ok: false, erro: "A captura precisa ser uma imagem PNG ou JPG." };
  const base64 = m[2].replace(/\s/g, "");
  const tamanho = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (tamanho <= 0) return { ok: false, erro: "A imagem enviada está vazia." };
  if (tamanho > LIMITE_IMAGEM_BYTES) return { ok: false, erro: "A captura passa de 5 MB. Reduza a imagem e envie de novo." };
  return { ok: true, tamanho };
}

const COR_HEX = /^#[0-9a-f]{6}$/i;

/** Normaliza a marca vinda do formulário ou do assistente: sem nome e sem cor, não há marca. */
export function normalizarMarca(bruto: unknown): { marca?: Marca; erro?: string } {
  if (!bruto || typeof bruto !== "object") return {};
  const b = bruto as Record<string, unknown>;
  const nome = typeof b.nome === "string" ? b.nome.trim().slice(0, 80) : "";
  const corPrimaria = typeof b.corPrimaria === "string" ? b.corPrimaria.trim() : "";
  const corSecundaria = typeof b.corSecundaria === "string" ? b.corSecundaria.trim() : "";
  if (!nome && !corPrimaria && !corSecundaria) return {};
  if (corPrimaria && !COR_HEX.test(corPrimaria)) return { erro: "A cor principal precisa estar no formato #RRGGBB (ex.: #0f766e)." };
  if (corSecundaria && !COR_HEX.test(corSecundaria)) return { erro: "A cor secundária precisa estar no formato #RRGGBB (ex.: #f59e0b)." };
  if (!corPrimaria && corSecundaria) return { erro: "Informe a cor principal antes da secundária." };
  const marca: Marca = { nome, corPrimaria: corPrimaria || "#374151" };
  if (corSecundaria) marca.corSecundaria = corSecundaria;
  return { marca };
}

export function normalizarStack(valor: unknown): Stack {
  return valor === "html-css" ? "html-css" : "html-tailwind";
}

function entradaSalva(pedido: Pedido, tamanhoImagem: number): EntradaPagina {
  const entrada: EntradaPagina = { stack: pedido.stack, tamanhoImagem };
  if (pedido.instrucoes?.trim()) entrada.instrucoes = pedido.instrucoes.trim();
  if (pedido.marca) entrada.marca = pedido.marca;
  return entrada;
}

/** Salva a página no histórico (tipo "pagina") e devolve o id, que também vira o id da própria página. */
function salvarPagina(pedido: Pedido, tamanhoImagem: number, html: string, metaGerada: Meta): Pagina {
  const versao: Versao = { n: 1, html, instrucao: "Página gerada a partir da captura", criadoEm: new Date().toISOString() };
  const titulo = tituloDaPagina(html, pedido.marca);
  const semId: Omit<Pagina, "id"> = { titulo, versoes: [versao], ...(pedido.marca ? { marca: pedido.marca } : {}) };
  const id = salvar({ tipo: "pagina", titulo, entrada: entradaSalva(pedido, tamanhoImagem), saida: { id: "", ...semId }, meta: metaGerada });
  const pagina: Pagina = { id, ...semId };
  atualizarSaida(id, pagina);
  return pagina;
}

export const INSUMO = "uma captura da página de referência";

/** Gera a página a partir do pedido (captura + formato + marca + instruções), salva e devolve com a proveniência. */
export async function gerarPagina(pedido: Pedido): Promise<{ demo: boolean; pagina: Pagina; meta: Meta; id: string }> {
  const imagem = validarImagem(pedido.imagem);
  if (!imagem.ok) throw new Error(imagem.erro);

  if (!visionEnabled()) {
    await esperar(1400);
    const html = paginaDemo(pedido);
    const metaGerada = meta({ demo: true, insumo: INSUMO });
    const pagina = salvarPagina(pedido, imagem.tamanho, html, metaGerada);
    return { demo: true, pagina, meta: metaGerada, id: pagina.id };
  }

  const resposta = await askVision({
    system: pedido.stack === "html-css" ? SYSTEM_CSS : SYSTEM_TAILWIND,
    prompt: montarPrompt(pedido),
    imagem: pedido.imagem,
    maxTokens: 12000,
    temperature: 0.2,
  });
  const html = sanitizarHtml(extrairHtml(resposta), pedido.stack);
  const metaGerada: Meta = { ...meta({ demo: false, insumo: INSUMO }), model: visionModelName() };
  const pagina = salvarPagina(pedido, imagem.tamanho, html, metaGerada);
  return { demo: false, pagina, meta: metaGerada, id: pagina.id };
}
