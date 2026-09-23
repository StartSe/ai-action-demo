// Peças compartilhadas da geração e da edição de páginas: sanitização e recorte do HTML devolvido pela IA, título,
// validação da captura e da marca, gravação no histórico, edição por instrução e versões. A CONSTRUÇÃO da página
// (plano + uma seção por vez) mora em lib/construtor.ts; a orquestração por projeto em lib/projetos.ts.
// Os prompts de edição são portados e traduzidos do projeto aberto screenshot-to-code (abi/screenshot-to-code),
// adaptados para um único arquivo HTML em português e com as imagens de terceiros substituídas por blocos na cor da marca.
import { askVision, ErroIA, meta, type Meta } from "./ai";
import { gerarTexto, gerarComImagem, iaDisponivel, nomeModeloChatGPT, provedor } from "./motor";
import { LIMITE_IMAGEM_BYTES } from "./captura";
import { edicaoDemo, esperar } from "./demo";
import { atualizarSaida, obter, salvar } from "./historico";
import type { EntradaPagina, Marca, Pagina, Stack, Versao } from "./types";

// O limite mora em lib/captura.ts (dono das entradas por endereço), reexportado aqui por conveniência.
export { LIMITE_IMAGEM_BYTES };
export const STACKS: { valor: Stack; rotulo: string }[] = [
  { valor: "html-tailwind", rotulo: "HTML com Tailwind" },
  { valor: "html-css", rotulo: "HTML com CSS" },
];

/** Todo erro deste app que se resolve trocando o modelo que lê a captura aponta para o cartão próprio de /setup. */
export const ACAO_ESCOLHER_MODELO = { rotulo: "Escolher o modelo", url: "/setup#openrouter" };

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
  const ehTailwind = (atributos: string) => {
    if (stack !== "html-tailwind") return false;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(atributos)?.[1];
    return Boolean(src && TAILWIND_CDN.test(src));
  };
  let saida = html.replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, (bloco, atributos: string) => (ehTailwind(atributos) ? `<script src="https://cdn.tailwindcss.com"></script>` : ""));
  // Tags <script> soltas (sem fechamento ou autofechadas) também saem — menos a do Tailwind que a passada acima
  // acabou de deixar (a regra antiga apagava a abertura dela e a página perdia todo o estilo: bug corrigido em 20/09/2026).
  saida = saida.replace(/<script\b([^>]*)\/?>/gi, (tag: string, atributos: string) => (ehTailwind(atributos) ? tag : ""));
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
  const marca: Marca = { nome, corPrimaria };
  if (corSecundaria) marca.corSecundaria = corSecundaria;
  return { marca };
}

export function normalizarStack(valor: unknown): Stack {
  return valor === "html-css" ? "html-css" : "html-tailwind";
}

/** Salva a página construída no histórico (tipo "pagina") e devolve com o id, que também é o id da própria página. */
export function salvarPaginaConstruida(entrada: EntradaPagina, html: string, metaGerada: Meta, rotuloVersao: string, marca?: Marca): Pagina {
  const versao: Versao = { n: 1, html, instrucao: rotuloVersao, criadoEm: new Date().toISOString() };
  const titulo = tituloDaPagina(html, marca);
  const semId: Omit<Pagina, "id"> = { titulo, versoes: [versao], ...(marca ? { marca } : {}) };
  const id = salvar({ tipo: "pagina", titulo, entrada, saida: { id: "", ...semId }, meta: metaGerada });
  const pagina: Pagina = { id, ...semId };
  atualizarSaida(id, pagina);
  return pagina;
}

/** Proveniência de um texto gerado pelo motor (lib/motor.ts): o modelo exibido é o que respondeu de fato (ChatGPT ou OpenRouter). */
export function metaTexto(insumo: string): Meta {
  return meta({ demo: false, insumo, ...(provedor() === "chatgpt" ? { model: nomeModeloChatGPT() } : {}) });
}

/**
 * Toda leitura de imagem deste app passa por aqui: `askVision` avisa genericamente que "o modelo
 * configurado não lê imagens", e neste app isso é *a* falha a explicar — o app inteiro depende de visão.
 * A frase é trocada por uma que diz o que fazer, com o botão para o cartão certo de Configurações.
 */
export async function lerCaptura(opcoes: { system: string; prompt: string; imagem: string; maxTokens?: number }): Promise<string> {
  try {
    if (provedor() === "chatgpt") return await gerarComImagem(opcoes);
    return await askVision({ ...opcoes, temperature: 0.2 });
  } catch (err) {
    if (err instanceof ErroIA && err.codigo === "sem_visao") {
      throw new ErroIA("sem_visao", "O modelo escolhido não lê imagens: escolha um modelo com visão em Configurações.", 400, ACAO_ESCOLHER_MODELO);
    }
    throw err;
  }
}

/** Imagens do cliente que entram nos prompts e na demonstração (montadas por lib/assets.ts a partir do projeto). */
export type OpcoesAssets = { blocoAssets?: string; demoAssets?: { logoUrl?: string; imagens?: { url: string; descricao: string }[] } };

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
  if (!(await iaDisponivel())) {
    await esperar(900);
    html = edicaoDemo(base, n);
    metaGerada = meta({ demo: true, insumo: INSUMO_EDICAO });
  } else {
    const resposta = await gerarTexto({
      system: stack === "html-css" ? SYSTEM_EDICAO_CSS : SYSTEM_EDICAO_TAILWIND,
      prompt: montarPromptEdicao(base, instrucao, pagina.marca, blocoAssets),
      maxTokens: 12000,
      temperature: 0.2,
    });
    html = sanitizarHtml(extrairHtml(resposta), stack);
    metaGerada = metaTexto(INSUMO_EDICAO);
  }

  const { pagina: nova, versao } = novaVersao(id, html, rotulo || instrucao, atual.n);
  return { demo: metaGerada.demo, pagina: nova, meta: metaGerada, versao };
}

/** A página salva com o formato detectado — para o agente (lib/agente.ts) ler o HTML atual sem repetir a lógica de carga. */
export function paginaAtual(id: string): { pagina: Pagina; stack: Stack; atual: Versao } {
  const { pagina, stack } = carregarPagina(id);
  return { pagina, stack, atual: pagina.versoes[pagina.versoes.length - 1] };
}

/**
 * Grava uma versão nova a partir de um HTML já pronto (o agente edita por trecho e devolve o arquivo inteiro):
 * passa pela mesma extração/sanitização da geração. `instrucao` é o rótulo curto da lista de versões.
 */
export function novaVersao(id: string, html: string, instrucao: string, versaoBase?: number): { pagina: Pagina; versao: Versao } {
  const { pagina, stack } = carregarPagina(id);
  if (versaoBase !== undefined && pagina.versoes.at(-1)?.n !== versaoBase) throw new ConflitoEdicao();
  const limpo = sanitizarHtml(extrairHtml(html), stack);
  const versao: Versao = { n: proximoNumero(pagina), html: limpo, instrucao: instrucao.trim().slice(0, 300) || "Mudança feita pelo agente", criadoEm: new Date().toISOString() };
  return { pagina: gravarVersao(pagina, versao), versao };
}

export class ConflitoEdicao extends Error {
  constructor() { super("O site recebeu outra alteração enquanto você editava. Seu texto foi mantido no editor. Reabra a versão mais recente antes de salvar."); }
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
