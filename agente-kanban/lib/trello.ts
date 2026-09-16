// Integração real com o Trello (https://developer.atlassian.com/cloud/trello/rest/).
// Usada quando TRELLO_API_KEY, TRELLO_API_TOKEN e TRELLO_BOARD_ID estão configurados.
// Implementa a mesma interface de lib/quadro-demo.ts (ProvedorQuadro).
//
// Para trocar por outra ferramenta (Jira, Notion, monday.com, ou um servidor MCP dela),
// escreva um módulo com as mesmas sete funções chamando a API daquela ferramenta.
import { ACAO_AUTORIZAR_TRELLO, ACAO_TRELLO } from "./acoes";
import { TRELLO_API_KEY } from "./integracoes";
import { ErroQuadro, type Cartao, type DadosNovoCartao, type Etiqueta, type Lista, type ProvedorQuadro, type Quadro } from "./quadro";
import { getConfig } from "./store";

const BASE = "https://api.trello.com/1";

/** Traduz uma resposta do Trello para a frase que a pessoa lê. O detalhe técnico fica no log. */
export function interpretarFalhaTrello(status: number, detalhe: string): ErroQuadro {
  console.error("Trello", status, detalhe.slice(0, 200));
  if (status === 401 || status === 403) {
    return new ErroQuadro("autorizacao", "A autorização do Trello expirou ou foi revogada. Clique em Autorizar no Trello de novo.", 401, ACAO_AUTORIZAR_TRELLO);
  }
  if (status === 429) {
    return new ErroQuadro("limite", "O Trello está limitando as chamadas; espere um minuto e peça de novo.", 429, undefined);
  }
  if (status === 404) {
    return new ErroQuadro("nao_encontrado", "O quadro ou a lista não existe mais; escolha outro quadro em Configurações.", 404, ACAO_TRELLO);
  }
  return new ErroQuadro("indisponivel", "O Trello não respondeu agora. Tente de novo em um minuto.", 502, undefined);
}

// Lidas a cada chamada (nunca em módulo): a configuração pode mudar em /setup sem reiniciar o app.
// Sem chave própria salva, usa a chave pública embutida no app (ver lib/integracoes.ts).
function chaveToken() {
  return { key: getConfig("TRELLO_API_KEY") || TRELLO_API_KEY, token: getConfig("TRELLO_API_TOKEN") };
}

function boardId(): string {
  return getConfig("TRELLO_BOARD_ID") || "";
}

type ParametrosChamada = Record<string, string | undefined>;

async function chamar<T>(metodo: string, caminho: string, params: ParametrosChamada = {}): Promise<T | null> {
  const url = new URL(`${BASE}${caminho}`);
  const qs = { ...chaveToken(), ...params };
  for (const [k, v] of Object.entries(qs)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: metodo });
  } catch (err) {
    // Sem este try/catch, a falha de rede chega à tela como "fetch failed".
    console.error("Trello", caminho, err);
    throw new ErroQuadro("indisponivel", "O Trello não respondeu agora. Tente de novo em um minuto.", 502, undefined);
  }
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw interpretarFalhaTrello(res.status, `${caminho}: ${texto || res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return (await res.json()) as T;
  return null;
}

interface ListaTrello {
  id: string;
  name: string;
}

interface CartaoTrello {
  id: string;
  name: string;
  desc?: string;
  idList: string;
  due?: string | null;
  idMembers?: string[];
  dateLastActivity?: string;
}

interface MembroTrello {
  id: string;
  fullName?: string;
  username?: string;
}

// O Trello não tem um conceito de "etiqueta de urgência" pronto sem mapear cores de label por
// quadro (fora do escopo desta integração); a aproximação usada é guardar a urgência como a
// primeira linha da descrição do cartão e extrair de volta ao ler, igual à aproximação já
// existente para atualizadoEm (dateLastActivity).
const RÓTULO_ETIQUETA: Record<Etiqueta, string> = { alta: "alta", media: "média", baixa: "baixa" };
const PREFIXO_ETIQUETA = /^Urgência:\s*(alta|média|media|baixa)\s*\n\n?/i;

function comEtiqueta(descricao: string, etiqueta?: Etiqueta | null): string {
  if (!etiqueta) return descricao;
  return `Urgência: ${RÓTULO_ETIQUETA[etiqueta]}\n\n${descricao}`;
}

function extrairEtiqueta(desc: string | undefined): { etiqueta: Etiqueta | null; descricao: string } {
  const texto = desc || "";
  const m = PREFIXO_ETIQUETA.exec(texto);
  if (!m) return { etiqueta: null, descricao: texto };
  const semAcento = m[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return { etiqueta: semAcento as Etiqueta, descricao: texto.slice(m[0].length) };
}

let membrosCache: Record<string, string> | null = null;
let membrosCacheEm = 0;

async function mapaMembros(): Promise<Record<string, string>> {
  const agora = Date.now();
  if (membrosCache && agora - membrosCacheEm < 60_000) return membrosCache;
  const membros = await chamar<MembroTrello[]>("GET", `/boards/${boardId()}/members`, { fields: "fullName,username" });
  membrosCache = Object.fromEntries((membros || []).map((m) => [m.id, m.fullName || m.username || ""]));
  membrosCacheEm = agora;
  return membrosCache;
}

async function listarListas(): Promise<Lista[]> {
  const listas = await chamar<ListaTrello[]>("GET", `/boards/${boardId()}/lists`, { fields: "name", filter: "open" });
  return (listas || []).map((l) => ({ id: l.id, nome: l.name }));
}

async function listarCartoesComLista(): Promise<(Cartao & { listaId: string })[]> {
  const [cartoes, membros] = await Promise.all([
    chamar<CartaoTrello[]>("GET", `/boards/${boardId()}/cards`, { fields: "name,desc,idList,due,idMembers,dateLastActivity", filter: "open" }),
    mapaMembros(),
  ]);
  return (cartoes || []).map((c) => {
    const { etiqueta, descricao } = extrairEtiqueta(c.desc);
    return {
      id: c.id,
      nome: c.name,
      descricao,
      listaId: c.idList,
      responsavel: (c.idMembers || []).map((id) => membros[id]).filter(Boolean).join(", "),
      vencimento: c.due ? c.due.slice(0, 10) : null,
      // Trello não expõe "quando o cartão entrou na lista atual" sem consultar o histórico de ações
      // (chamada extra por cartão); dateLastActivity (qualquer atividade: edição, comentário, mover...)
      // é a aproximação usada aqui para "cartão parado" (ver lib/rotinas-do-app.ts).
      atualizadoEm: c.dateLastActivity || new Date().toISOString(),
      etiqueta,
    };
  });
}

function semLista(c: Cartao & { listaId: string }): Cartao {
  return { id: c.id, nome: c.nome, descricao: c.descricao, responsavel: c.responsavel, vencimento: c.vencimento, atualizadoEm: c.atualizadoEm, etiqueta: c.etiqueta };
}

async function listarCartoes(): Promise<Cartao[]> {
  return (await listarCartoesComLista()).map(semLista);
}

async function obterQuadro(): Promise<Quadro> {
  const [listas, cartoes] = await Promise.all([listarListas(), listarCartoesComLista()]);
  return {
    listas: listas.map((l) => ({
      id: l.id,
      nome: l.nome,
      cartoes: cartoes.filter((c) => c.listaId === l.id).map(semLista),
    })),
  };
}

async function criarCartao({ nome, descricao = "", listaId, vencimento = null, etiqueta = null }: DadosNovoCartao): Promise<Cartao> {
  const cartao = await chamar<CartaoTrello>("POST", `/cards`, {
    idList: listaId,
    name: nome,
    desc: comEtiqueta(descricao, etiqueta),
    due: vencimento || undefined,
  });
  if (!cartao) throw new ErroQuadro("indisponivel", "O Trello não confirmou o cartão criado. Abra o quadro e confira antes de pedir de novo.", 502, ACAO_TRELLO);
  const extraido = extrairEtiqueta(cartao.desc);
  return { id: cartao.id, nome: cartao.name, descricao: extraido.descricao, responsavel: "", vencimento: cartao.due ? cartao.due.slice(0, 10) : null, atualizadoEm: cartao.dateLastActivity || new Date().toISOString(), etiqueta: extraido.etiqueta };
}

async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
  const cartao = await chamar<CartaoTrello>("PUT", `/cards/${cartaoId}`, { idList: listaId });
  if (!cartao) throw new ErroQuadro("indisponivel", "O Trello não confirmou o cartão movido. Abra o quadro e confira antes de pedir de novo.", 502, ACAO_TRELLO);
  const extraido = extrairEtiqueta(cartao.desc);
  return { id: cartao.id, nome: cartao.name, descricao: extraido.descricao, responsavel: "", vencimento: cartao.due ? cartao.due.slice(0, 10) : null, atualizadoEm: cartao.dateLastActivity || new Date().toISOString(), etiqueta: extraido.etiqueta };
}

// Encontra o membro do quadro cujo nome (completo ou de usuário) mais se aproxima do texto informado.
async function encontrarMembroId(nome: string): Promise<string | null> {
  const membros = await mapaMembros();
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return null;
  for (const [id, nomeMembro] of Object.entries(membros)) {
    if (nomeMembro.toLowerCase() === alvo) return id;
  }
  for (const [id, nomeMembro] of Object.entries(membros)) {
    const nomeMembroNorm = nomeMembro.toLowerCase();
    if (nomeMembroNorm.includes(alvo) || alvo.includes(nomeMembroNorm)) return id;
  }
  return null;
}

async function atribuir({ cartaoId, responsavel }: { cartaoId: string; responsavel: string }): Promise<Cartao> {
  const membroId = await encontrarMembroId(responsavel);
  if (!membroId) throw new ErroQuadro("membro", `Ninguém com o nome "${responsavel}" participa deste quadro. Confira o nome ou convide a pessoa no Trello.`, 400, undefined);
  const cartao = await chamar<CartaoTrello>("PUT", `/cards/${cartaoId}`, { idMembers: membroId });
  if (!cartao) throw new ErroQuadro("indisponivel", "O Trello não confirmou a mudança no cartão. Abra o quadro e confira antes de pedir de novo.", 502, ACAO_TRELLO);
  const membros = await mapaMembros();
  const nomesResponsaveis = (cartao.idMembers || []).map((id) => membros[id]).filter(Boolean).join(", ");
  const extraido = extrairEtiqueta(cartao.desc);
  return { id: cartao.id, nome: cartao.name, descricao: extraido.descricao, responsavel: nomesResponsaveis, vencimento: cartao.due ? cartao.due.slice(0, 10) : null, atualizadoEm: cartao.dateLastActivity || new Date().toISOString(), etiqueta: extraido.etiqueta };
}

async function comentar({ cartaoId, texto }: { cartaoId: string; texto: string }): Promise<{ ok: true; comentarioId: string }> {
  const acao = await chamar<{ id: string }>("POST", `/cards/${cartaoId}/actions/comments`, { text: texto });
  return { ok: true, comentarioId: acao?.id || "" };
}

async function removerComentario({ comentarioId }: { cartaoId: string; comentarioId: string }): Promise<{ ok: true }> {
  await chamar("DELETE", `/actions/${comentarioId}/comments`);
  return { ok: true };
}

async function arquivarCartao({ cartaoId }: { cartaoId: string }): Promise<{ ok: true }> {
  await chamar("PUT", `/cards/${cartaoId}`, { closed: "true" });
  return { ok: true };
}

let nomeCache: { boardId: string; nome: string } | null = null;

/** Nome do quadro conectado, para o cabeçalho do resultado ("Quadro: Recrutamento 2026"). Nunca lança: um nome ausente só some do cabeçalho. */
async function nomeDoQuadro(): Promise<string | null> {
  const id = boardId();
  if (!id) return null;
  if (nomeCache?.boardId === id) return nomeCache.nome;
  try {
    const quadro = await chamar<{ name?: string }>("GET", `/boards/${id}`, { fields: "name" });
    const nome = quadro?.name || null;
    if (nome) nomeCache = { boardId: id, nome };
    return nome;
  } catch (err) {
    console.error("Trello nomeDoQuadro", err);
    return null;
  }
}

export const trello: ProvedorQuadro = {
  nomeDoQuadro,
  listarListas,
  listarCartoes,
  obterQuadro,
  criarCartao,
  moverCartao,
  atribuir,
  comentar,
  removerComentario,
  arquivarCartao,
};
