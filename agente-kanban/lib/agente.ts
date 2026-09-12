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

export interface ResultadoAgente {
  resposta: string;
  acoes: Acao[];
  quadro: Quadro;
  alterados: string[];
}

const SYSTEM = `Você é um agente de gestão que opera um quadro Kanban de Recursos Humanos por conta de um gestor.
Regras:
- Sempre que for mover, comentar ou arquivar um cartão, chame antes a ferramenta listar_quadro para descobrir os IDs corretos de listas e cartões. Nunca invente um ID.
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
}

async function executarFerramenta(nome: string, input: Record<string, unknown>, provedor: ProvedorQuadro, rastro: Rastro): Promise<unknown> {
  if (nome === "listar_quadro") {
    return provedor.obterQuadro();
  }
  if (nome === "criar_cartao") {
    const cartao = await provedor.criarCartao({
      nome: String(input.nome || ""),
      descricao: input.descricao ? String(input.descricao) : "",
      listaId: String(input.lista_id || ""),
      vencimento: input.vencimento ? String(input.vencimento) : null,
    });
    rastro.acoes.push({ tipo: "criar_cartao", descricao: `Criou o cartão "${cartao.nome}"` });
    rastro.alterados.push(cartao.id);
    return cartao;
  }
  if (nome === "mover_cartao") {
    const cartao = await provedor.moverCartao({ cartaoId: String(input.cartao_id || ""), listaId: String(input.lista_id || "") });
    rastro.acoes.push({ tipo: "mover_cartao", descricao: `Moveu o cartão "${cartao.nome}"` });
    rastro.alterados.push(cartao.id);
    return cartao;
  }
  if (nome === "comentar_cartao") {
    const cartaoId = String(input.cartao_id || "");
    const resultado = await provedor.comentar({ cartaoId, texto: String(input.texto || "") });
    rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentou em um cartão: "${String(input.texto || "")}"` });
    rastro.alterados.push(cartaoId);
    return resultado;
  }
  if (nome === "arquivar_cartao") {
    const cartaoId = String(input.cartao_id || "");
    const resultado = await provedor.arquivarCartao({ cartaoId });
    rastro.acoes.push({ tipo: "arquivar_cartao", descricao: "Arquivou um cartão" });
    rastro.alterados.push(cartaoId);
    return resultado;
  }
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

// --- modo com IA (tool calling) ---

async function processarComIA({ mensagem, historico, provedor }: { mensagem: string; historico?: HistoricoItem[]; provedor: ProvedorQuadro }): Promise<ResultadoAgente> {
  const rastro: Rastro = { acoes: [], alterados: [] };
  const mensagens: ToolMessage[] = (historico || [])
    .filter((m) => m && m.content && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content }));
  mensagens.push({ role: "user", content: mensagem });

  const resposta = await askWithTools({
    system: SYSTEM,
    messages: mensagens,
    tools: TOOLS,
    executeTool: (nome, args) => executarFerramenta(nome, args, provedor, rastro),
  });

  const quadro = await provedor.obterQuadro();
  return { resposta: resposta.trim() || "Ação concluída.", acoes: rastro.acoes, quadro, alterados: rastro.alterados };
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

type TipoBloco = "criar" | "mover" | "comentar" | "arquivar" | "listar" | null;

// Divide a mensagem em blocos de ação, com base nos verbos-gatilho encontrados.
const GATILHOS: { tipo: TipoBloco; regex: RegExp }[] = [
  { tipo: "criar", regex: /\b(crie|criar|cria|adicione|adicionar|adiciona|novo cart[aã]o|nova tarefa|nova carta)\b/i },
  { tipo: "mover", regex: /\b(mova|mover|move|mude|mudar|mude-o|passe|passar|passa)\b/i },
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

async function processarSemIA({ mensagem, provedor }: { mensagem: string; provedor: ProvedorQuadro }): Promise<ResultadoAgente> {
  const rastro: Rastro = { acoes: [], alterados: [] };
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
      const cartao = await provedor.criarCartao({ nome, listaId: lista.id, vencimento });
      rastro.acoes.push({ tipo: "criar_cartao", descricao: `Criou o cartão "${cartao.nome}" em "${lista.nome}"` });
      rastro.alterados.push(cartao.id);
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
      const atualizado = await provedor.moverCartao({ cartaoId: cartao.id, listaId: listaDestino.id });
      rastro.acoes.push({ tipo: "mover_cartao", descricao: `Moveu o cartão "${atualizado.nome}" para "${listaDestino.nome}"` });
      rastro.alterados.push(atualizado.id);
      respostas.push(`Movi o cartão "${atualizado.nome}" para "${listaDestino.nome}".`);
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
      await provedor.comentar({ cartaoId: cartao.id, texto: comentarioTexto });
      rastro.acoes.push({ tipo: "comentar_cartao", descricao: `Comentou em "${cartao.nome}": "${comentarioTexto}"` });
      rastro.alterados.push(cartao.id);
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
      await provedor.arquivarCartao({ cartaoId: cartao.id });
      rastro.acoes.push({ tipo: "arquivar_cartao", descricao: `Arquivou "${cartao.nome}"` });
      rastro.alterados.push(cartao.id);
      respostas.push(`Arquivei o cartão "${cartao.nome}".`);
      continue;
    }

    if (bloco.tipo === "listar" || bloco.tipo === null) {
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

  const quadro = await provedor.obterQuadro();
  return { resposta: respostas.join(" "), acoes: rastro.acoes, quadro, alterados: rastro.alterados };
}

export async function processarMensagem({ mensagem, historico, provedor }: { mensagem: string; historico?: HistoricoItem[]; provedor: ProvedorQuadro }): Promise<ResultadoAgente> {
  if (aiEnabled()) return processarComIA({ mensagem, historico, provedor });
  return processarSemIA({ mensagem, provedor });
}
