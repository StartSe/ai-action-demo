// Integração real com o Trello (https://developer.atlassian.com/cloud/trello/rest/).
// Usada quando TRELLO_API_KEY, TRELLO_API_TOKEN e TRELLO_BOARD_ID estão configurados.
// Implementa a mesma interface de lib/quadro-demo.ts (ProvedorQuadro).
//
// Para trocar por outra ferramenta (Jira, Notion, monday.com, ou um servidor MCP dela),
// escreva um módulo com as mesmas sete funções chamando a API daquela ferramenta.
import { TRELLO_API_KEY } from "./integracoes";
import type { Cartao, DadosNovoCartao, Lista, ProvedorQuadro, Quadro } from "./quadro";
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
}

interface MembroTrello {
  id: string;
  fullName?: string;
  username?: string;
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
    chamar<CartaoTrello[]>("GET", `/boards/${boardId()}/cards`, { fields: "name,desc,idList,due,idMembers", filter: "open" }),
    mapaMembros(),
  ]);
  return (cartoes || []).map((c) => ({
    id: c.id,
    nome: c.name,
    descricao: c.desc || "",
    listaId: c.idList,
    responsavel: (c.idMembers || []).map((id) => membros[id]).filter(Boolean).join(", "),
    vencimento: c.due ? c.due.slice(0, 10) : null,
  }));
}

function semLista(c: Cartao & { listaId: string }): Cartao {
  return { id: c.id, nome: c.nome, descricao: c.descricao, responsavel: c.responsavel, vencimento: c.vencimento };
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

async function criarCartao({ nome, descricao = "", listaId, vencimento = null }: DadosNovoCartao): Promise<Cartao> {
  const cartao = await chamar<CartaoTrello>("POST", `/cards`, {
    idList: listaId,
    name: nome,
    desc: descricao,
    due: vencimento || undefined,
  });
  if (!cartao) throw new Error("O Trello não retornou o cartão criado.");
  return { id: cartao.id, nome: cartao.name, descricao: cartao.desc || "", responsavel: "", vencimento: cartao.due ? cartao.due.slice(0, 10) : null };
}

async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
  const cartao = await chamar<CartaoTrello>("PUT", `/cards/${cartaoId}`, { idList: listaId });
  if (!cartao) throw new Error("O Trello não retornou o cartão movido.");
  return { id: cartao.id, nome: cartao.name, descricao: cartao.desc || "", responsavel: "", vencimento: cartao.due ? cartao.due.slice(0, 10) : null };
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
  return { id: cartao.id, nome: cartao.name, descricao: cartao.desc || "", responsavel: nomesResponsaveis, vencimento: cartao.due ? cartao.due.slice(0, 10) : null };
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
