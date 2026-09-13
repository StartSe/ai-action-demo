// Agente que opera o quadro Kanban a partir de comandos em linguagem natural.
// Com OPENROUTER_API_KEY usa tool calling (loop manual via askWithTools). Sem a chave,
// usa um interpretador por palavras-chave para o app continuar testável sem nenhuma chave.
import { aiEnabled, askWithTools, type ToolDefinition, type ToolMessage } from "./ai";
import type { Cartao, Lista, ProvedorQuadro, Quadro } from "./quadro";

export interface HistoricoItem {
  role: "user" | "assistant";
  content: string;
}

export interface Acao {
  tipo: string;
  descricao: string;
}

/** O suficiente para reverter a última ação executada, usada pelo botão "Desfazer" (US-035). */
export type Desfazer =
  | { tipo: "criar_cartao"; cartaoId: string; nome: string }
  | { tipo: "mover_cartao"; cartaoId: string; nome: string; listaOrigemId: string }
  | { tipo: "comentar_cartao"; cartaoId: string; nome: string; comentarioId: string };

export interface ResultadoAgente {
  resposta: string;
  acoes: Acao[];
  quadro: Quadro;
  alterados: string[];
  /** Só quando a própria última ação é reversível (criar, mover ou comentar); null quando não há o que desfazer. */
  desfazer: Desfazer | null;
}

/** Devolvido no lugar de `ResultadoAgente` quando o chamador pede só o plano (sem executar nada ainda). */
export interface PlanoAgente {
  plano: Acao[];
}

const SYSTEM = `Você é um agente de gestão que opera um quadro Kanban de Recursos Humanos por conta de um gestor.
Regras:
- Sempre que for mover, atribuir, comentar ou arquivar um cartão, chame antes a ferramenta listar_quadro para descobrir os IDs corretos de listas e cartões. Nunca invente um ID.
- Nunca invente cartões: se o gestor mencionar um cartão que não existe no quadro, avise e pergunte o que ele quer dizer, em vez de criar ou mover algo incorreto.
- Se o pedido for ambíguo (por exemplo, mais de um cartão parecido, ou a lista de destino não estiver clara), pergunte antes de agir.
- Depois de agir, responda em português do Brasil, em 1 a 2 frases, confirmando exatamente o que foi feito.
- Seja direto e opere com precisão. Não descreva o quadro inteiro a menos que seja pedido.`;

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "listar_quadro",
      description:
        "Lista as colunas (listas) e os cartões atuais do quadro, com seus IDs. Chame sempre antes de criar, mover, comentar ou arquivar um cartão, para obter os IDs corretos.",
      parameters: { type: "object", properties: {}, additionalProperties: false, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_cartao",
      description: "Cria um novo cartão em uma lista do quadro.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome/título do cartão." },
          descricao: { type: "string", description: "Descrição opcional do cartão." },
          lista_id: { type: "string", description: "ID da lista de destino, obtido em listar_quadro." },
          vencimento: { type: "string", description: "Data de vencimento no formato AAAA-MM-DD, se houver." },
        },
        additionalProperties: false,
        required: ["nome", "lista_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mover_cartao",
      description: "Move um cartão existente para outra lista.",
      parameters: {
        type: "object",
        properties: {
          cartao_id: { type: "string", description: "ID do cartão, obtido em listar_quadro." },
          lista_id: { type: "string", description: "ID da lista de destino, obtido em listar_quadro." },
        },
        additionalProperties: false,
        required: ["cartao_id", "lista_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "atribuir_cartao",
      description: "Define quem é o responsável por um cartão existente.",
      parameters: {
        type: "object",
        properties: {
          cartao_id: { type: "string", description: "ID do cartão, obtido em listar_quadro." },
          responsavel: { type: "string", description: "Nome da pessoa responsável pelo cartão." },
        },
        additionalProperties: false,
        required: ["cartao_id", "responsavel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comentar_cartao",
      description: "Adiciona um comentário a um cartão existente.",
      parameters: {
        type: "object",
        properties: {
          cartao_id: { type: "string", description: "ID do cartão, obtido em listar_quadro." },
          texto: { type: "string", description: "Texto do comentário." },
        },
        additionalProperties: false,
        required: ["cartao_id", "texto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "arquivar_cartao",
      description: "Arquiva (remove do quadro ativo) um cartão existente.",
      parameters: {
        type: "object",
        properties: { cartao_id: { type: "string", description: "ID do cartão, obtido em listar_quadro." } },
        additionalProperties: false,
        required: ["cartao_id"],
      },
    },
  },
];

// --- utilidades comuns aos dois modos ---

function normalizar(s: string | undefined | null): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

interface Rastro {
  acoes: Acao[];
  alterados: string[];
  /** Última ação executada que pode ser desfeita (sobrescrita a cada ação; null quando a mais recente não é reversível). */
  desfazer: Desfazer | null;
}

/** Nome de uma lista pelo id (usado para descrever um plano sem executar nada). */
async function nomeDaLista(provedor: ProvedorQuadro, listaId: string): Promise<string> {
  const listas = await provedor.listarListas();
  return listas.find((l) => l.id === listaId)?.nome || listaId;
}

/** Nome de um cartão pelo id (usado para descrever um plano sem executar nada). */
async function nomeDoCartao(provedor: ProvedorQuadro, cartaoId: string): Promise<string> {
  const cartoes = await provedor.listarCartoes();
  return cartoes.find((c) => c.id === cartaoId)?.nome || cartaoId;
}

/** Id da lista que hoje contém o cartão, para poder "mover de volta" no Desfazer. */
async function listaAtualDoCartao(provedor: ProvedorQuadro, cartaoId: string): Promise<string | null> {
  const quadro = await provedor.obterQuadro();
  for (const lista of quadro.listas) {
    if (lista.cartoes.some((c) => c.id === cartaoId)) return lista.id;
  }
  return null;
}

async function executarFerramenta(nome: string, input: Record<string, unknown>, provedor: ProvedorQuadro, rastro: Rastro, planejar: boolean): Promise<unknown> {
  if (nome === "listar_quadro") {
    return provedor.obterQuadro();
  }
  if (nome === "criar_cartao") {
    const nomeCartao = String(input.nome || "");
    const listaId = String(input.lista_id || "");
    if (planejar) {
      const listaNome = await nomeDaLista(provedor, listaId);
      rastro.acoes.push({ tipo: "criar_cartao", descricao: `Criar o cartão "${nomeCartao}" em "${listaNome}"` });
      return { id: "(planejado)", nome: nomeCartao, descricao: input.descricao ? String(input.descricao) : "", responsavel: "", vencimento: input.vencimento ? String(input.vencimento) : null };
    }
    const cartao = await provedor.criarCartao({
      nome: nomeCartao,
      descricao: input.descricao ? String(input.descricao) : "",
      listaId,
      vencimento: input.vencimento ? String(input.vencimento) : null,
    });
    rastro.acoes.push({ tipo: "criar_cartao", descricao: `Criou o cartão "${cartao.nome}"` });
    rastro.alterados.push(cartao.id);
    rastro.desfazer = { tipo: "criar_cartao", cartaoId: cartao.id, nome: cartao.nome };
    return cartao;
  }
  if (nome === "mover_cartao") {
    const cartaoId = String(input.cartao_id || "");
    const listaId = String(input.lista_id || "");
    if (planejar) {
      const [nomeCartao, nomeLista] = await Promise.all([nomeDoCartao(provedor, cartaoId), nomeDaLista(provedor, listaId)]);
      rastro.acoes.push({ tipo: "mover_cartao", descricao: `Mover o cartão "${nomeCartao}" para "${nomeLista}"` });
      return { id: cartaoId, nome: nomeCartao };
    }
    const listaOrigemId = await listaAtualDoCartao(provedor, cartaoId);
    const cartao = await provedor.moverCartao({ cartaoId, listaId });
    rastro.acoes.push({ tipo: "mover_cartao", descricao: `Moveu o cartão "${cartao.nome}"` });
    rastro.alterados.push(cartao.id);
    rastro.desfazer = listaOrigemId ? { tipo: "mover_cartao", cartaoId: cartao.id, nome: cartao.nome, listaOrigemId } : null;
    return cartao;
  }
  if (nome === "atribuir_cartao") {
    const cartaoId = String(input.cartao_id || "");
    const responsavel = String(input.responsavel || "");
    if (planejar) {
      const nomeCartao = await nomeDoCartao(provedor, cartaoId);
      rastro.acoes.push({ tipo: "atribuir_cartao", descricao: `Atribuir o cartão "${nomeCartao}" a ${responsavel}` });
      return { id: cartaoId, nome: nomeCartao, responsavel };
    }
    const cartao = await provedor.atribuir({ cartaoId, responsavel });
    rastro.acoes.push({ tipo: "atribuir_cartao", descricao: `Atribuiu o cartão "${cartao.nome}" a ${cartao.responsavel}` });
    rastro.alterados.push(cartao.id);
    rastro.desfazer = null;
    return cartao;
  }
  if (nome === "comentar_cartao") {
    const cartaoId = String(input.cartao_id || "");
    const texto = String(input.texto || "");
    if (planejar) {
      const nomeCartao = await nomeDoCartao(provedor, cartaoId);
      rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentar em "${nomeCartao}": "${texto}"` });
      return { ok: true };
    }
    const nomeCartao = await nomeDoCartao(provedor, cartaoId);
    const resultado = await provedor.comentar({ cartaoId, texto });
    rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentou em um cartão: "${texto}"` });
    rastro.alterados.push(cartaoId);
    rastro.desfazer = { tipo: "comentar_cartao", cartaoId, nome: nomeCartao, comentarioId: resultado.comentarioId };
    return resultado;
  }
  if (nome === "arquivar_cartao") {
    const cartaoId = String(input.cartao_id || "");
    if (planejar) {
      const nomeCartao = await nomeDoCartao(provedor, cartaoId);
      rastro.acoes.push({ tipo: "arquivar_cartao", descricao: `Arquivar o cartão "${nomeCartao}"` });
      return { ok: true };
    }
    const resultado = await provedor.arquivarCartao({ cartaoId });
    rastro.acoes.push({ tipo: "arquivar_cartao", descricao: "Arquivou um cartão" });
    rastro.alterados.push(cartaoId);
    rastro.desfazer = null;
    return resultado;
  }
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

// --- modo com IA (tool calling) ---

const SYSTEM_PLANEJAR = `${SYSTEM}
Importante: esta chamada é só um planejamento. As ferramentas que você chamar ainda NÃO acontecem de verdade (nenhuma mudança é salva); você está apenas descobrindo o que faria. Não invente cartões ou listas além do que o quadro e o pedido já trazem.`;

async function processarComIA({
  mensagem,
  historico,
  provedor,
  planejar,
}: {
  mensagem: string;
  historico?: HistoricoItem[];
  provedor: ProvedorQuadro;
  planejar: boolean;
}): Promise<ResultadoAgente | PlanoAgente> {
  const rastro: Rastro = { acoes: [], alterados: [], desfazer: null };
  const mensagens: ToolMessage[] = (historico || [])
    .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content }));
  mensagens.push({ role: "user", content: mensagem });

  if (planejar) {
    await askWithTools({
      system: SYSTEM_PLANEJAR,
      messages: mensagens,
      tools: TOOLS,
      executeTool: (nome, args) => executarFerramenta(nome, args, provedor, rastro, true),
    });
    return { plano: rastro.acoes };
  }

  const resposta = await askWithTools({
    system: SYSTEM,
    messages: mensagens,
    tools: TOOLS,
    executeTool: (nome, args) => executarFerramenta(nome, args, provedor, rastro, false),
  });

  const quadro = await provedor.obterQuadro();
  return { resposta: resposta.trim() || "Ação concluída.", acoes: rastro.acoes, quadro, alterados: rastro.alterados, desfazer: rastro.desfazer };
}

// --- modo sem IA: interpretador por palavras-chave ---

const DIAS_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

function proximaData(diaSemana: string): string | null {
  const alvo = DIAS_SEMANA.indexOf(diaSemana);
  if (alvo < 0) return null;
  const hoje = new Date();
  for (let i = 1; i <= 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (d.getDay() === alvo) return d.toISOString().slice(0, 10);
  }
  return null;
}

function extrairVencimento(texto: string): { data: string | null; textoRemover: RegExp | null } {
  const norm = normalizar(texto);
  if (/\bamanha\b/.test(norm)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return { data: d.toISOString().slice(0, 10), textoRemover: /amanh[aã]/i };
  }
  if (/\bhoje\b/.test(norm)) {
    return { data: new Date().toISOString().slice(0, 10), textoRemover: /hoje/i };
  }
  for (const dia of DIAS_SEMANA) {
    if (norm.includes(dia)) {
      const data = proximaData(dia);
      const regex = new RegExp(`\\b(na|no)\\s+(feira\\s+de\\s+)?${dia}(-feira)?\\b`, "i");
      return { data, textoRemover: regex };
    }
  }
  const isoMatch = texto.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) return { data: isoMatch[1], textoRemover: new RegExp(isoMatch[1]) };
  return { data: null, textoRemover: null };
}

// Procura, dentro do texto, o nome de uma lista existente (por aproximação, ignorando acentos/caixa).
function encontrarLista(texto: string, listas: Lista[]): Lista | null {
  const norm = normalizar(texto);
  let melhor: Lista | null = null;
  for (const lista of listas) {
    const nomeNorm = normalizar(lista.nome);
    if (norm.includes(nomeNorm) && (!melhor || nomeNorm.length > normalizar(melhor.nome).length)) {
      melhor = lista;
    }
  }
  return melhor;
}

// Monta um regex que casa com o nome (acentuado) de uma lista/cartão mesmo que o
// usuário tenha digitado sem acento (ex.: "concluido" também casa com "Concluído").
const CLASSES_ACENTO: Record<string, string> = { a: "[aàáâã]", e: "[eéê]", i: "[iíî]", o: "[oóôõ]", u: "[uúü]", c: "[cç]" };
function regexTolerante(nome: string): string {
  return nome
    .split("")
    .map((ch) => CLASSES_ACENTO[ch.toLowerCase()] || ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("");
}

const PALAVRAS_VAZIAS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das",
  "para", "pra", "no", "na", "nos", "nas", "e", "que",
]);

function limparConsulta(texto: string): string {
  return normalizar(texto)
    .split(/\s+/)
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .join(" ")
    .trim();
}

interface BuscaCartao {
  cartao: Cartao | null;
  ambiguo: boolean;
  opcoes?: Cartao[];
}

// Encontra o cartão cujo nome melhor corresponde à consulta em linguagem natural.
function encontrarCartao(consulta: string, cartoes: Cartao[]): BuscaCartao {
  const alvo = limparConsulta(consulta);
  if (!alvo) return { cartao: null, ambiguo: false };
  const porSubstring = cartoes.filter((c) => normalizar(c.nome).includes(alvo));
  if (porSubstring.length === 1) return { cartao: porSubstring[0], ambiguo: false };
  if (porSubstring.length > 1) return { cartao: porSubstring[0], ambiguo: false };

  const palavrasAlvo = alvo.split(" ").filter(Boolean);
  let melhores: Cartao[] = [];
  let melhorPontuacao = 0;
  for (const c of cartoes) {
    const nomeNorm = normalizar(c.nome);
    const pontuacao = palavrasAlvo.filter((p) => nomeNorm.includes(p)).length;
    if (pontuacao > 0 && pontuacao >= melhorPontuacao) {
      if (pontuacao > melhorPontuacao) melhores = [];
      melhores.push(c);
      melhorPontuacao = pontuacao;
    }
  }
  if (melhores.length === 0) return { cartao: null, ambiguo: false };
  if (melhores.length === 1) return { cartao: melhores[0], ambiguo: false };
  // Exige que ao menos metade das palavras da consulta batam para considerar ambíguo;
  // caso contrário, o melhor palpite já é bom o suficiente.
  if (melhorPontuacao >= Math.ceil(palavrasAlvo.length / 2)) {
    return { cartao: melhores[0], ambiguo: melhores.length > 1, opcoes: melhores };
  }
  return { cartao: melhores[0], ambiguo: false };
}

function capitalizar(texto: string): string {
  const t = texto.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

function formatarDataPtBr(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

type TipoBloco = "criar" | "mover" | "atribuir" | "comentar" | "arquivar" | "listar" | null;

// Divide a mensagem em blocos de ação, com base nos verbos-gatilho encontrados.
const GATILHOS: { tipo: TipoBloco; regex: RegExp }[] = [
  { tipo: "criar", regex: /\b(crie|criar|cria|adicione|adicionar|adiciona|novo cart[aã]o|nova tarefa|nova carta)\b/i },
  { tipo: "mover", regex: /\b(mova|mover|move|mude|mudar|mude-o|passe|passar|passa)\b/i },
  { tipo: "atribuir", regex: /\b(atribua|atribuir|designe|designar|responsabilize)\b/i },
  { tipo: "comentar", regex: /\b(comente|coment(e|ar|ando|a))\b/i },
  { tipo: "arquivar", regex: /\b(arquive|arquivar|remova|remover|exclua|excluir)\b/i },
  { tipo: "listar", regex: /\b(liste|listar|mostre|mostrar|quais cart[oõ]es|como est[aá] o quadro)\b/i },
];

interface Bloco {
  tipo: TipoBloco;
  texto: string;
}

function segmentar(mensagem: string): Bloco[] {
  const pontos: { tipo: TipoBloco; indice: number }[] = [];
  for (const g of GATILHOS) {
    const m = g.regex.exec(mensagem);
    if (m) pontos.push({ tipo: g.tipo, indice: m.index });
  }
  if (pontos.length === 0) return [{ tipo: null, texto: mensagem }];
  pontos.sort((a, b) => a.indice - b.indice);
  const blocos: Bloco[] = [];
  for (let i = 0; i < pontos.length; i++) {
    const inicio = pontos[i].indice;
    const fim = i + 1 < pontos.length ? pontos[i + 1].indice : mensagem.length;
    blocos.push({ tipo: pontos[i].tipo, texto: mensagem.slice(inicio, fim) });
  }
  return blocos;
}

async function processarSemIA({
  mensagem,
  provedor,
  planejar,
}: {
  mensagem: string;
  provedor: ProvedorQuadro;
  planejar: boolean;
}): Promise<ResultadoAgente | PlanoAgente> {
  const rastro: Rastro = { acoes: [], alterados: [], desfazer: null };
  const respostas: string[] = [];
  const blocos = segmentar(mensagem);
  const listas = await provedor.listarListas();

  for (const bloco of blocos) {
    const texto = bloco.texto;

    if (bloco.tipo === "criar") {
      const { data: vencimento, textoRemover } = extrairVencimento(texto);
      let livre = texto
        .replace(/\b(crie|criar|cria|adicione|adicionar|adiciona|novo|nova)\b/gi, "")
        .replace(/\b(cart[aã]o|tarefa|carta)\b/gi, "");
      if (textoRemover) livre = livre.replace(textoRemover, "");
      const listaEncontrada = encontrarLista(livre, listas);
      if (listaEncontrada) {
        livre = livre.replace(new RegExp(`\\b(em|na|para)\\s+(a\\s+lista\\s+)?${regexTolerante(listaEncontrada.nome)}\\b`, "i"), "");
      }
      livre = livre
        .replace(/^\s*(um|uma|uns|umas)\s+/i, "")
        .replace(/\s+(um|uma)\s+cart[aã]o\b/i, "")
        .replace(/^\s*para\s+/i, "")
        .replace(/\s+e\s*$/i, "");
      const nome = capitalizar(livre.replace(/\s+/g, " ").trim()) || "Novo cartão";
      const lista = listaEncontrada || listas[0];
      if (planejar) {
        rastro.acoes.push({
          tipo: "criar_cartao",
          descricao: `Criar o cartão "${nome}" em "${lista.nome}"${vencimento ? ` para ${formatarDataPtBr(vencimento)}` : ""}`,
        });
        continue;
      }
      const cartao = await provedor.criarCartao({ nome, listaId: lista.id, vencimento });
      rastro.acoes.push({ tipo: "criar_cartao", descricao: `Criou o cartão "${cartao.nome}" em "${lista.nome}"` });
      rastro.alterados.push(cartao.id);
      rastro.desfazer = { tipo: "criar_cartao", cartaoId: cartao.id, nome: cartao.nome };
      respostas.push(
        `Criei o cartão "${cartao.nome}" em "${lista.nome}"${vencimento ? ` para ${formatarDataPtBr(vencimento)}` : ""}.`
      );
      continue;
    }

    if (bloco.tipo === "mover") {
      const cartoesAtuais = await provedor.listarCartoes();
      const listaDestino = encontrarLista(texto, listas);
      let livre = texto.replace(/\b(mova|mover|move|mude|mudar|passe|passar|passa)\b/gi, "");
      if (listaDestino) {
        livre = livre.replace(new RegExp(`\\b(para|em|na)\\s+(a\\s+lista\\s+)?${regexTolerante(listaDestino.nome)}\\b`, "i"), "");
      }
      const { cartao, ambiguo, opcoes } = encontrarCartao(livre, cartoesAtuais);
      if (!cartao) {
        respostas.push(`Não encontrei nenhum cartão parecido com "${limparConsulta(livre)}" no quadro. Pode confirmar o nome?`);
        continue;
      }
      if (!listaDestino) {
        respostas.push(`Encontrei o cartão "${cartao.nome}", mas não identifiquei para qual lista movê-lo. Pode dizer o nome da lista de destino?`);
        continue;
      }
      if (ambiguo) {
        respostas.push(`Há mais de um cartão parecido com "${limparConsulta(livre)}" (${(opcoes || []).map((o) => `"${o.nome}"`).join(", ")}). Qual deles devo mover?`);
        continue;
      }
      if (planejar) {
        rastro.acoes.push({ tipo: "mover_cartao", descricao: `Mover o cartão "${cartao.nome}" para "${listaDestino.nome}"` });
        continue;
      }
      const listaOrigemId = await listaAtualDoCartao(provedor, cartao.id);
      const atualizado = await provedor.moverCartao({ cartaoId: cartao.id, listaId: listaDestino.id });
      rastro.acoes.push({ tipo: "mover_cartao", descricao: `Moveu o cartão "${atualizado.nome}" para "${listaDestino.nome}"` });
      rastro.alterados.push(atualizado.id);
      rastro.desfazer = listaOrigemId ? { tipo: "mover_cartao", cartaoId: atualizado.id, nome: atualizado.nome, listaOrigemId } : null;
      respostas.push(`Movi o cartão "${atualizado.nome}" para "${listaDestino.nome}".`);
      continue;
    }

    if (bloco.tipo === "atribuir") {
      const cartoesAtuais = await provedor.listarCartoes();
      const semVerbo = texto.replace(/\b(atribua|atribuir|designe|designar|responsabilize)\b/gi, "");
      const respMatch = semVerbo.match(/\b(?:a|para)\s+([^"]+)$/i);
      const responsavel = respMatch ? respMatch[1].trim().replace(/[.,;]+$/, "") : "";
      let livre = respMatch ? semVerbo.slice(0, respMatch.index) : semVerbo;
      livre = livre.replace(/^\s*o\s+cart[aã]o\s+/i, "").replace(/"/g, "").trim();
      const { cartao, ambiguo, opcoes } = encontrarCartao(livre, cartoesAtuais);
      if (!cartao) {
        respostas.push(`Não encontrei nenhum cartão parecido com "${limparConsulta(livre)}" para atribuir. Pode confirmar o nome?`);
        continue;
      }
      if (ambiguo) {
        respostas.push(`Há mais de um cartão parecido com "${limparConsulta(livre)}" (${(opcoes || []).map((o) => `"${o.nome}"`).join(", ")}). Qual deles devo atribuir?`);
        continue;
      }
      if (!responsavel) {
        respostas.push(`Encontrei o cartão "${cartao.nome}", mas não entendi para quem atribuir. Pode dizer o nome da pessoa?`);
        continue;
      }
      if (planejar) {
        rastro.acoes.push({ tipo: "atribuir_cartao", descricao: `Atribuir o cartão "${cartao.nome}" a ${responsavel}` });
        continue;
      }
      const atualizado = await provedor.atribuir({ cartaoId: cartao.id, responsavel });
      rastro.acoes.push({ tipo: "atribuir_cartao", descricao: `Atribuiu o cartão "${atualizado.nome}" a ${atualizado.responsavel}` });
      rastro.alterados.push(atualizado.id);
      rastro.desfazer = null;
      respostas.push(`Atribuí o cartão "${atualizado.nome}" a ${atualizado.responsavel}.`);
      continue;
    }

    if (bloco.tipo === "comentar") {
      const cartoesAtuais = await provedor.listarCartoes();
      let comentarioTexto: string | null = null;
      const separador = texto.match(/(?::|dizendo|com o (?:seguinte )?coment[aá]rio)\s*(.+)$/i);
      let livre = texto.replace(/\b(coment(e|ar|ando))\b/gi, "");
      if (separador) {
        comentarioTexto = separador[1].trim().replace(/^["“]|["”]$/g, "");
        livre = texto.slice(0, separador.index);
      }
      const { cartao, ambiguo, opcoes } = encontrarCartao(livre, cartoesAtuais);
      if (!cartao) {
        respostas.push(`Não encontrei nenhum cartão parecido com "${limparConsulta(livre)}" para comentar. Pode confirmar o nome?`);
        continue;
      }
      if (ambiguo) {
        respostas.push(`Há mais de um cartão parecido (${(opcoes || []).map((o) => `"${o.nome}"`).join(", ")}). Em qual devo comentar?`);
        continue;
      }
      if (!comentarioTexto) {
        respostas.push(`Encontrei o cartão "${cartao.nome}", mas não entendi o que devo escrever no comentário.`);
        continue;
      }
      if (planejar) {
        rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentar em "${cartao.nome}": "${comentarioTexto}"` });
        continue;
      }
      const resultadoComentario = await provedor.comentar({ cartaoId: cartao.id, texto: comentarioTexto });
      rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentou em "${cartao.nome}": "${comentarioTexto}"` });
      rastro.alterados.push(cartao.id);
      rastro.desfazer = { tipo: "comentar_cartao", cartaoId: cartao.id, nome: cartao.nome, comentarioId: resultadoComentario.comentarioId };
      respostas.push(`Comentei em "${cartao.nome}".`);
      continue;
    }

    if (bloco.tipo === "arquivar") {
      const cartoesAtuais = await provedor.listarCartoes();
      const livre = texto.replace(/\b(arquive|arquivar|remova|remover|exclua|excluir)\b/gi, "");
      const { cartao, ambiguo, opcoes } = encontrarCartao(livre, cartoesAtuais);
      if (!cartao) {
        respostas.push(`Não encontrei nenhum cartão parecido com "${limparConsulta(livre)}" para arquivar. Pode confirmar o nome?`);
        continue;
      }
      if (ambiguo) {
        respostas.push(`Há mais de um cartão parecido (${(opcoes || []).map((o) => `"${o.nome}"`).join(", ")}). Qual devo arquivar?`);
        continue;
      }
      if (planejar) {
        rastro.acoes.push({ tipo: "arquivar_cartao", descricao: `Arquivar o cartão "${cartao.nome}"` });
        continue;
      }
      await provedor.arquivarCartao({ cartaoId: cartao.id });
      rastro.acoes.push({ tipo: "arquivar_cartao", descricao: `Arquivou "${cartao.nome}"` });
      rastro.alterados.push(cartao.id);
      rastro.desfazer = null;
      respostas.push(`Arquivei o cartão "${cartao.nome}".`);
      continue;
    }

    if (bloco.tipo === "listar" || bloco.tipo === null) {
      // Consulta só de leitura: não entra no plano (nada a confirmar), só na resposta em modo execução.
      if (planejar) continue;
      const quadroAtual = await provedor.obterQuadro();
      const resumo = quadroAtual.listas.map((l) => `${l.nome} (${l.cartoes.length})`).join(", ");
      respostas.push(
        bloco.tipo === "listar"
          ? `O quadro tem ${quadroAtual.listas.length} listas: ${resumo}.`
          : `Não entendi um comando de ação na mensagem. Você pode pedir para criar, mover, comentar ou arquivar um cartão. Quadro atual: ${resumo}.`
      );
      continue;
    }
  }

  if (planejar) return { plano: rastro.acoes };

  const quadro = await provedor.obterQuadro();
  return { resposta: respostas.join(" "), acoes: rastro.acoes, quadro, alterados: rastro.alterados, desfazer: rastro.desfazer };
}

export async function processarMensagem(args: { mensagem: string; historico?: HistoricoItem[]; provedor: ProvedorQuadro; planejar: true }): Promise<PlanoAgente>;
export async function processarMensagem(args: { mensagem: string; historico?: HistoricoItem[]; provedor: ProvedorQuadro; planejar?: false }): Promise<ResultadoAgente>;
export async function processarMensagem({
  mensagem,
  historico,
  provedor,
  planejar = false,
}: {
  mensagem: string;
  historico?: HistoricoItem[];
  provedor: ProvedorQuadro;
  planejar?: boolean;
}): Promise<ResultadoAgente | PlanoAgente> {
  if (aiEnabled()) return processarComIA({ mensagem, historico, provedor, planejar });
  return processarSemIA({ mensagem, provedor, planejar });
}
