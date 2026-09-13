// Integração real com o Trello (https://developer.atlassian.com/cloud/trello/rest/).
// Usada quando TRELLO_API_KEY, TRELLO_API_TOKEN e TRELLO_BOARD_ID estão configurados.
// Implementa a mesma interface de lib/quadro-demo.ts (ProvedorQuadro).
//
// Para trocar por outra ferramenta (Jira, Notion, monday.com, ou um servidor MCP dela),
// escreva um módulo com as mesmas sete funções chamando a API daquela ferramenta.
import { TRELLO_API_KEY } from "./integracoes";
import type { Cartao, DadosNovoCartao, Etiqueta, Lista, ProvedorQuadro, Quadro } from "./quadro";
import { getConfig } from "./store";

const BASE = "https://api.trello.com/1";

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
  const res = await fetch(url, { method: metodo });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Trello respondeu ${res.status} ao chamar ${caminho}: ${texto || res.statusText}`);
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
  if (!cartao) throw new Error("O Trello não retornou o cartão criado.");
  const extraido = extrairEtiqueta(cartao.desc);
  return { id: cartao.id, nome: cartao.name, descricao: extraido.descricao, responsavel: "", vencimento: cartao.due ? cartao.due.slice(0, 10) : null, atualizadoEm: cartao.dateLastActivity || new Date().toISOString(), etiqueta: extraido.etiqueta };
}

async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
  const cartao = await chamar<CartaoTrello>("PUT", `/cards/${cartaoId}`, { idList: listaId });
  if (!cartao) throw new Error("O Trello não retornou o cartão movido.");
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
  if (!membroId) throw new Error(`Não encontrei ninguém chamado "${responsavel}" entre os membros deste quadro do Trello.`);
  const cartao = await chamar<CartaoTrello>("PUT", `/cards/${cartaoId}`, { idMembers: membroId });
  if (!cartao) throw new Error("O Trello não retornou o cartão atualizado.");
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

export const trello: ProvedorQuadro = {
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
