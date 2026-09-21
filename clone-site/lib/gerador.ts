// Geração e edição da página a partir da captura, compartilhadas entre a rota HTTP (app/api/pagina/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
// Os prompts de sistema (geração e atualização) são portados e traduzidos do projeto aberto screenshot-to-code
// (abi/screenshot-to-code), adaptados para um único arquivo HTML em português e com as imagens de terceiros
// substituídas por blocos na cor da marca.
import { aiEnabled, askText, askVision, ErroIA, meta, visionEnabled, visionModelName, type Meta } from "./ai";
import { LIMITE_IMAGEM_BYTES } from "./captura";
import { edicaoDemo, esperar, paginaDemo } from "./demo";
import { atualizarSaida, obter, salvar } from "./historico";
import type { EntradaPagina, Marca, Pagina, Pedido, Stack, Versao } from "./types";

// O limite mora em lib/captura.ts (dono das entradas por endereço), reexportado aqui por conveniência.
export { LIMITE_IMAGEM_BYTES };
export const STACKS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

const REGRAS_COMUNS = `- Reproduza a estrutura, o alinhamento, os espaçamentos, as cores de fundo e de texto, os tamanhos de fonte e as proporções exatamente como aparecem na captura. Preste atenção em padding, margin, bordas e cantos arredondados.
- Escreva TODOS os textos em português do Brasil. Se a referência estiver em outro idioma, traduza. Se um texto for de outra empresa (nome, slogan, produto, depoimento), substitua por um texto equivalente e plausível para a marca informada, mantendo o tamanho parecido para não quebrar o layout.
- Repita os elementos quantas vezes for preciso para bater com a captura. Se há 6 cartões, escreva os 6. NUNCA escreva comentários como "<!-- repita para os outros itens -->" no lugar do código: escreva o código completo.
- Não escreva nenhum comentário no HTML.
- Fotos, ilustrações, logotipos e ícones de terceiros NÃO devem ser copiados nem carregados de outros sites: no lugar de cada imagem, coloque um bloco (<div>) com as mesmas dimensões e posição, preenchido com a cor principal da marca, com role="img" e um aria-label descrevendo em português o que a imagem mostrava (ex.: "Foto de uma equipe reunida em volta de uma mesa"). Ícones pequenos podem ser blocos arredondados na cor da marca ou caracteres simples. Exceção: quando o pedido trouxer "Imagens da empresa", use essas imagens (com <img> e os endereços exatos) no lugar dos blocos correspondentes — o logo no lugar do logotipo da referência, as fotos onde a referência tinha fotos.
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
export function montarPrompt(pedido: Pick<Pedido, "instrucoes" | "marca" | "stack">, blocoAssets?: string): string {
  const linhas = ["Gere a página a partir desta captura de referência."];
  if (pedido.marca?.nome || pedido.marca?.corPrimaria) {
    linhas.push(
      `Marca: ${pedido.marca.nome || "não informada"}. Cor principal: ${pedido.marca.corPrimaria || "escolha uma cor sóbria"}.${pedido.marca.corSecundaria ? ` Cor secundária: ${pedido.marca.corSecundaria}.` : ""} Use essas cores nos botões, destaques e blocos que substituem imagens.`
    );
  } else {
    linhas.push("Nenhuma marca foi informada: mantenha as cores da referência e use um nome de empresa fictício e neutro nos textos.");
  }
  if (blocoAssets?.trim()) linhas.push(blocoAssets.trim());
  if (pedido.instrucoes?.trim()) linhas.push(`Instruções adicionais de quem pediu a página:\n${pedido.instrucoes.trim()}`);
  linhas.push(`Formato: ${pedido.stack === "html-css" ? "HTML com CSS próprio em <style>" : "HTML com Tailwind pela CDN"}.`);
  return linhas.join("\n\n");
}

/** Todo erro deste app que se resolve trocando o modelo que lê a captura aponta para o cartão próprio de /setup. */
export const ACAO_ESCOLHER_MODELO = { rotulo: "Escolher o modelo", url: "/setup#qualidade-da-pagina" };

/** Recorta a resposta da IA para o trecho <html>...</html> e garante que abre e fecha. */
export function extrairHtml(texto: string): string {
  const t = String(texto).replace(/```(?:html)?/gi, "").trim();
  const inicio = t.search(/<html[\s>]/i);
  const fimIdx = t.toLowerCase().lastIndexOf("</html>");
  if (inicio < 0 || fimIdx < 0 || fimIdx < inicio) {
    // Quase sempre a resposta foi cortada por chegar ao limite de tamanho do modelo: a referência tem mais
    // conteúdo do que cabe em uma resposta só. Nitidez da captura não tem nada a ver com esse caso.
    throw new ErroIA("resposta_invalida", "A página veio pela metade: essa referência tem mais conteúdo do que cabe em uma resposta. Envie a captura de um trecho menor ou escolha um modelo mais forte.", 502, ACAO_ESCOLHER_MODELO);
  }
  const html = t.slice(inicio, fimIdx + "</html>".length);
  if (!/<body[\s>]/i.test(html) || !/<\/body>/i.test(html)) {
    throw new ErroIA("resposta_invalida", "A página veio incompleta desta vez. Tente de novo; se repetir, escolha outro modelo.", 502, ACAO_ESCOLHER_MODELO);
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
function salvarPagina(pedido: Pedido, tamanhoImagem: number, html: string, metaGerada: Meta, briefing?: string): Pagina {
  const versao: Versao = { n: 1, html, instrucao: briefing ? "Site criado a partir do briefing" : "Página gerada a partir da captura", criadoEm: new Date().toISOString() };
  const titulo = tituloDaPagina(html, pedido.marca);
  const semId: Omit<Pagina, "id"> = { titulo, versoes: [versao], ...(pedido.marca ? { marca: pedido.marca } : {}) };
  const entrada: EntradaPagina = { ...entradaSalva(pedido, tamanhoImagem), ...(briefing ? { briefing } : {}) };
  const id = salvar({ tipo: "pagina", titulo, entrada, saida: { id: "", ...semId }, meta: metaGerada });
  const pagina: Pagina = { id, ...semId };
  atualizarSaida(id, pagina);
  return pagina;
}

// Sem artigo inicial: o texto de `Origem` (components/ui.tsx) é "a partir de ${insumo}".
export const INSUMO = "captura de referência e cores da marca";

/**
 * Toda leitura de imagem deste app passa por aqui: `askVision` avisa genericamente que "o modelo
 * configurado não lê imagens", e neste app isso é *a* falha a explicar — o app inteiro depende de visão.
 * A frase é trocada por uma que diz o que fazer, com o botão para o cartão certo de Configurações.
 */
export async function lerCaptura(opcoes: { system: string; prompt: string; imagem: string; maxTokens?: number }): Promise<string> {
  try {
    return await askVision({ ...opcoes, temperature: 0.2 });
  } catch (err) {
    if (err instanceof ErroIA && err.codigo === "sem_visao") {
      throw new ErroIA("sem_visao", "O modelo escolhido não lê imagens: escolha um modelo com visão em Configurações.", 400, ACAO_ESCOLHER_MODELO);
    }
    throw err;
  }
}

/** Gera a página a partir do pedido (captura + formato + marca + instruções), salva e devolve com a proveniência. */
/** Imagens do cliente que entram nos prompts e na demonstração (montadas por lib/assets.ts a partir do projeto). */
export type OpcoesAssets = { blocoAssets?: string; demoAssets?: { logoUrl?: string; imagens?: { url: string; descricao: string }[] } };

export async function gerarPagina(pedido: Pedido, opcoes: OpcoesAssets = {}): Promise<{ demo: boolean; pagina: Pagina; meta: Meta; id: string }> {
  const imagem = validarImagem(pedido.imagem);
  if (!imagem.ok) throw new Error(imagem.erro);

  if (!visionEnabled()) {
    await esperar(1400);
    const html = paginaDemo({ ...pedido, ...opcoes.demoAssets });
    const metaGerada = meta({ demo: true, insumo: INSUMO });
    const pagina = salvarPagina(pedido, imagem.tamanho, html, metaGerada);
    return { demo: true, pagina, meta: metaGerada, id: pagina.id };
  }

  const resposta = await lerCaptura({
    system: pedido.stack === "html-css" ? SYSTEM_CSS : SYSTEM_TAILWIND,
    prompt: montarPrompt(pedido, opcoes.blocoAssets),
    imagem: pedido.imagem,
    maxTokens: 12000,
  });
  const html = sanitizarHtml(extrairHtml(resposta), pedido.stack);
  const metaGerada: Meta = { ...meta({ demo: false, insumo: INSUMO }), model: visionModelName() };
  const pagina = salvarPagina(pedido, imagem.tamanho, html, metaGerada);
  return { demo: false, pagina, meta: metaGerada, id: pagina.id };
}

// ---------------------------------------------------------------------------------------------------------
// Criar do zero a partir de um briefing (sem captura): a estrutura padrão de uma landing, textos da empresa.
// Portado da ideia do "create/text" do screenshot-to-code, com as mesmas regras de arquivo único da suíte.
// ---------------------------------------------------------------------------------------------------------

export const INSUMO_BRIEFING = "briefing da empresa e cores da marca";

const ESTRUTURA_BRIEFING = `Estrutura da página (nesta ordem, cada bloco em uma <section> ou tag semântica própria):
1. Cabeçalho (<header>) com o nome ou logo da marca à esquerda e um menu curto com âncoras para as seções.
2. Herói com um título forte de até 12 palavras, uma frase de apoio e um botão principal (a chamada mais importante para esse negócio) e um secundário.
3. Três a seis benefícios ou serviços, cada um com título curto, uma frase e um ícone simples (bloco arredondado na cor da marca ou caractere).
4. "Como funciona" em três passos numerados.
5. Prova social: dois ou três depoimentos plausíveis (nomes e cargos fictícios, sem citar empresas reais) ou números de resultado.
6. Chamada final com o botão principal repetido.
7. Rodapé (<footer>) com nome da marca, contato e direitos autorais.
Escreva textos concretos para o negócio descrito no briefing, em português do Brasil, sem frases genéricas de "soluções inovadoras".`;

const REGRAS_BRIEFING = `- Não invente dados que o briefing não deu (endereço, telefone, preços): use rótulos neutros como "Fale com a gente" e, no rodapé, o nome da marca com um texto de contato curto.
- Use as cores da marca nos botões, destaques e blocos que substituem imagens. Onde caberia uma foto, coloque um bloco (<div>) preenchido com a cor principal, com role="img" e aria-label descrevendo em português a foto que caberia ali — a menos que o pedido traga imagens da empresa, que devem ser usadas com <img> nesses lugares.
- Repita os elementos quantas vezes for preciso (se são 6 benefícios, escreva os 6). Não escreva comentários no HTML.
- Use fontes do Google Fonts (<link> em https://fonts.googleapis.com). Não carregue nada de outras origens além do Google Fonts e do Tailwind.
- Não inclua nenhum <script> além do permitido para o formato. Não use onclick nem outros atributos de evento.
- A página deve funcionar bem no celular (largura de 390 px) e no computador.
- Devolva somente o código completo, começando em <html> e terminando em </html>, sem markdown, sem \`\`\` e sem explicações antes ou depois.`;

export const SYSTEM_BRIEFING_TAILWIND = `Você é um desenvolvedor front-end e redator especialista em páginas de empresas, com Tailwind CSS.
Você recebe um briefing (o que a empresa faz, para quem, o que o site precisa ter) e constrói uma página completa, em um único arquivo HTML, usando Tailwind e HTML puro, sem JavaScript próprio.

Regras:
- Inclua o Tailwind exatamente com esta linha no <head>: <script src="https://cdn.tailwindcss.com"></script>. Esse é o único <script> permitido.
- Use classes utilitárias do Tailwind para todo o estilo; um <style> pequeno só é aceitável para cores da marca e para a família de fonte.
${REGRAS_BRIEFING}

${ESTRUTURA_BRIEFING}`;

export const SYSTEM_BRIEFING_CSS = `Você é um desenvolvedor front-end e redator especialista em páginas de empresas, com HTML e CSS.
Você recebe um briefing (o que a empresa faz, para quem, o que o site precisa ter) e constrói uma página completa, em um único arquivo HTML, com todo o CSS escrito à mão dentro de uma única tag <style> no <head>, sem nenhuma biblioteca e sem nenhum <script>.

Regras:
- Nenhum <script> é permitido neste formato.
- Use CSS moderno (flexbox, grid, variáveis CSS) e uma media query para telas até 768 px.
${REGRAS_BRIEFING}

${ESTRUTURA_BRIEFING}`;

export type PedidoBriefing = { briefing: string; stack: Stack; marca?: Marca; instrucoes?: string; /** Bloco "Imagens da empresa" já montado (US-004); vazio quando não há assets. */ blocoAssets?: string };

/** Bloco do usuário para a criação pelo briefing: a empresa, a marca, as imagens e o formato. */
export function montarPromptBriefing(pedido: PedidoBriefing): string {
  const linhas = [`Crie a página da empresa a partir deste briefing:\n${pedido.briefing.trim()}`];
  if (pedido.marca?.nome || pedido.marca?.corPrimaria) {
    linhas.push(`Marca: ${pedido.marca.nome || "não informada"}. Cor principal: ${pedido.marca.corPrimaria || "escolha uma cor sóbria"}.${pedido.marca.corSecundaria ? ` Cor secundária: ${pedido.marca.corSecundaria}.` : ""}`);
  } else {
    linhas.push("Nenhuma marca foi informada: escolha uma cor sóbria e use o nome da empresa citado no briefing (ou um nome neutro).");
  }
  if (pedido.blocoAssets?.trim()) linhas.push(pedido.blocoAssets.trim());
  if (pedido.instrucoes?.trim()) linhas.push(`Instruções adicionais de quem pediu a página:\n${pedido.instrucoes.trim()}`);
  linhas.push(`Formato: ${pedido.stack === "html-css" ? "HTML com CSS próprio em <style>" : "HTML com Tailwind pela CDN"}.`);
  return linhas.join("\n\n");
}

/**
 * Cria o site do zero a partir do briefing (texto), salva no histórico e devolve com a proveniência.
 * Passa pelo motor de texto (OpenRouter ou ChatGPT, lib/motor.ts) — não precisa de visão. Em demonstração,
 * a landing fixa ganha o título com a primeira frase do briefing.
 */
export async function gerarDoBriefing(pedido: PedidoBriefing, opcoes: OpcoesAssets = {}): Promise<{ demo: boolean; pagina: Pagina; meta: Meta; id: string }> {
  const briefing = pedido.briefing.trim();
  if (briefing.length < 20) throw new ErroDePedido("Conte em pelo menos uma frase o que a empresa faz e o que o site precisa ter.");
  const base: Pedido = { imagem: "", stack: pedido.stack, ...(pedido.instrucoes?.trim() ? { instrucoes: pedido.instrucoes.trim() } : {}), ...(pedido.marca ? { marca: pedido.marca } : {}) };

  if (!aiEnabled()) {
    await esperar(1400);
    const html = paginaDemo({ ...base, briefing, ...opcoes.demoAssets });
    const metaGerada = meta({ demo: true, insumo: INSUMO_BRIEFING });
    const pagina = salvarPagina(base, 0, html, metaGerada, briefing);
    return { demo: true, pagina, meta: metaGerada, id: pagina.id };
  }

  const resposta = await askText({
    system: pedido.stack === "html-css" ? SYSTEM_BRIEFING_CSS : SYSTEM_BRIEFING_TAILWIND,
    prompt: montarPromptBriefing({ ...pedido, briefing, blocoAssets: pedido.blocoAssets ?? opcoes.blocoAssets }),
    maxTokens: 12000,
    temperature: 0.4,
  });
  const html = sanitizarHtml(extrairHtml(resposta), pedido.stack);
  const metaGerada = meta({ demo: false, insumo: INSUMO_BRIEFING });
  const pagina = salvarPagina(base, 0, html, metaGerada, briefing);
  return { demo: false, pagina, meta: metaGerada, id: pagina.id };
}

// ---------------------------------------------------------------------------------------------------------
// Edição por instrução e versões
// ---------------------------------------------------------------------------------------------------------

export const LIMITE_INSTRUCAO = 4000;
export const INSUMO_EDICAO = "versão anterior da página e instrução de mudança";

const REGRAS_EDICAO = `- Aplique SOMENTE o que foi pedido. Tudo o que não foi citado (estrutura, classes, textos, cores, ordem das seções, fontes) deve continuar exatamente como está.
- Devolva o arquivo INTEIRO atualizado, começando em <html> e terminando em </html>, sem markdown, sem \`\`\` e sem explicações antes ou depois. Nunca devolva só o trecho alterado nem escreva comentários como "<!-- resto igual -->".
- Escreva os textos novos em português do Brasil, com tamanho parecido com o dos textos que substituem, para o layout não quebrar.
- Continue sem copiar fotos, logotipos ou textos de outras empresas: imagens seguem como blocos na cor da marca com role="img" e aria-label em português.
- Não inclua nenhum <script> além do permitido para o formato, nem atributos de evento, nem conteúdo de outras origens além do Google Fonts e do Tailwind.`;

export const SYSTEM_EDICAO_TAILWIND = `Você é um desenvolvedor front-end especialista em Tailwind CSS.
Você recebe o código HTML completo de uma página (um único arquivo, estilizado com Tailwind pela CDN) e uma instrução de mudança escrita por alguém que não programa. Sua tarefa é atualizar a página conforme a instrução.

Regras:
- Mantenha a linha <script src="https://cdn.tailwindcss.com"></script> no <head>; esse continua sendo o único <script> permitido.
${REGRAS_EDICAO}`;

export const SYSTEM_EDICAO_CSS = `Você é um desenvolvedor front-end especialista em HTML e CSS.
Você recebe o código HTML completo de uma página (um único arquivo, com todo o CSS em uma tag <style> no <head>, sem nenhum <script>) e uma instrução de mudança escrita por alguém que não programa. Sua tarefa é atualizar a página conforme a instrução.

Regras:
- Nenhum <script> é permitido neste formato.
${REGRAS_EDICAO}`;

/** Bloco do usuário para a edição: a instrução, a marca (para as cores certas) e o HTML atual. */
export function montarPromptEdicao(html: string, instrucao: string, marca?: Marca, blocoAssets?: string): string {
  const linhas = [`Instrução de mudança:\n${instrucao.trim()}`];
  if (marca?.nome || marca?.corPrimaria) {
    linhas.push(`Marca da página: ${marca.nome || "não informada"}. Cor principal: ${marca.corPrimaria}.${marca.corSecundaria ? ` Cor secundária: ${marca.corSecundaria}.` : ""}`);
  }
  if (blocoAssets?.trim()) linhas.push(blocoAssets.trim());
  linhas.push(`Código atual da página:\n${html}`);
  return linhas.join("\n\n");
}

/** Instrução pré-montada do botão "Trocar os textos pelos da minha empresa". */
export function instrucaoTrocarTextos(oQueAEmpresaFaz: string): string {
  return `Troque todos os textos da página pelos de uma empresa que faz o seguinte: ${oQueAEmpresaFaz.trim()}

Reescreva títulos, subtítulos, chamadas dos botões, descrições de benefícios, passos, depoimentos, planos e perguntas frequentes para essa empresa, em português do Brasil, com tamanhos parecidos com os textos atuais. Mantenha a estrutura, as classes, as cores, as imagens e a ordem das seções exatamente como estão.`;
}

/** Valida a instrução vinda do formulário ou do assistente. */
export function normalizarInstrucao(valor: unknown, vazio = "Escreva o que mudar na página."): string {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErroDePedido(vazio);
  return texto.slice(0, LIMITE_INSTRUCAO);
}

/** Erro de entrada inválida (vira 400 na rota HTTP). */
export class ErroDePedido extends Error {}
/** Página inexistente (vira 404 na rota HTTP). */
export class PaginaNaoEncontrada extends Error {
  constructor() {
    super("Essa página não existe mais. Gere uma nova.");
  }
}

/** Formato do HTML quando o registro não guarda o formato (páginas antigas): detecta pela CDN do Tailwind. */
export function stackDoHtml(html: string): Stack {
  return /cdn\.tailwindcss\.com/i.test(html) ? "html-tailwind" : "html-css";
}

function carregarPagina(id: string): { pagina: Pagina; stack: Stack } {
  const registro = obter<EntradaPagina, Pagina, Meta>(id);
  if (!registro || registro.tipo !== "pagina" || !Array.isArray(registro.saida?.versoes) || registro.saida.versoes.length === 0) {
    throw new PaginaNaoEncontrada();
  }
  const pagina: Pagina = { ...registro.saida, id: registro.id };
  const atual = pagina.versoes[pagina.versoes.length - 1];
  const stack = registro.entrada?.stack === "html-css" || registro.entrada?.stack === "html-tailwind" ? registro.entrada.stack : stackDoHtml(atual.html);
  return { pagina, stack };
}

function proximoNumero(pagina: Pagina): number {
  return pagina.versoes.reduce((maior, v) => Math.max(maior, v.n), 0) + 1;
}

function gravarVersao(pagina: Pagina, versao: Versao): Pagina {
  const nova: Pagina = { ...pagina, titulo: tituloDaPagina(versao.html, pagina.marca), versoes: [...pagina.versoes, versao] };
  atualizarSaida(pagina.id, nova);
  return nova;
}

/**
 * Aplica uma instrução de mudança sobre a versão atual (ou sobre o HTML enviado, quando a tela está mostrando
 * outra versão) e grava uma versão nova. Em modo demonstração, aplica mudanças fixas visíveis (ver lib/demo.ts).
 * `rotulo` é o texto curto que fica na lista "Versões" quando a instrução enviada à IA é longa (ex.: troca de textos).
 */
export async function editarPagina(id: string, instrucao: string, htmlBase?: string, rotulo?: string, blocoAssets?: string): Promise<{ demo: boolean; pagina: Pagina; meta: Meta; versao: Versao }> {
  const { pagina, stack } = carregarPagina(id);
  const atual = pagina.versoes[pagina.versoes.length - 1];
  const base = htmlBase?.trim() ? sanitizarHtml(extrairHtml(htmlBase), stack) : atual.html;
  const n = proximoNumero(pagina);

  let html: string;
  let metaGerada: Meta;
  if (!aiEnabled()) {
    await esperar(900);
    html = edicaoDemo(base, n);
    metaGerada = meta({ demo: true, insumo: INSUMO_EDICAO });
  } else {
    const resposta = await askText({
      system: stack === "html-css" ? SYSTEM_EDICAO_CSS : SYSTEM_EDICAO_TAILWIND,
      prompt: montarPromptEdicao(base, instrucao, pagina.marca, blocoAssets),
      maxTokens: 12000,
      temperature: 0.2,
    });
    html = sanitizarHtml(extrairHtml(resposta), stack);
    metaGerada = meta({ demo: false, insumo: INSUMO_EDICAO });
  }

  const versao: Versao = { n, html, instrucao: (rotulo || instrucao).trim().slice(0, 300), criadoEm: new Date().toISOString() };
  const nova = gravarVersao(pagina, versao);
  return { demo: metaGerada.demo, pagina: nova, meta: metaGerada, versao };
}

/** "Voltar para esta": copia o HTML da versão n como uma versão nova, sem apagar as intermediárias. */
export function voltarParaVersao(id: string, n: unknown): { pagina: Pagina; versao: Versao } {
  const { pagina } = carregarPagina(id);
  const alvo = pagina.versoes.find((v) => v.n === Number(n));
  if (!alvo) throw new ErroDePedido("Essa versão não existe.");
  const atual = pagina.versoes[pagina.versoes.length - 1];
  if (alvo.n === atual.n) return { pagina, versao: atual };
  const versao: Versao = { n: proximoNumero(pagina), html: alvo.html, instrucao: `Voltou para a versão ${alvo.n}`, criadoEm: new Date().toISOString() };
  return { pagina: gravarVersao(pagina, versao), versao };
}

/** A versão atual de uma página salva, para a página publicada (/s/[id]); lança PaginaNaoEncontrada quando o id não existe. */
export function versaoAtual(id: string): { titulo: string; versao: Versao } {
  const { pagina } = carregarPagina(id);
  return { titulo: pagina.titulo, versao: pagina.versoes[pagina.versoes.length - 1] };
}
