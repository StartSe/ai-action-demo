// Quadro Kanban em memória, usado quando TRELLO_API_KEY / TRELLO_API_TOKEN / TRELLO_BOARD_ID
// não estão configurados. Implementa a mesma interface de lib/trello.ts (ProvedorQuadro).
import { randomUUID } from "node:crypto";
import type { Cartao, DadosNovoCartao, Lista, ProvedorQuadro, Quadro } from "./quadro";

interface CartaoInterno extends Cartao {
  listaId: string;
  arquivado: boolean;
  comentarios: { texto: string; data: string }[];
}

const listas: Lista[] = [
  { id: "lista-a-fazer", nome: "A fazer" },
  { id: "lista-em-andamento", nome: "Em andamento" },
  { id: "lista-concluido", nome: "Concluído" },
];

const cartoes: CartaoInterno[] = [
  {
    id: randomUUID(),
    nome: "Abrir vaga de Analista de RH Pleno",
    descricao: "Publicar a vaga no site e no LinkedIn, alinhar perfil com a diretoria.",
    listaId: "lista-a-fazer",
    responsavel: "Camila Duarte",
    vencimento: "2026-09-18",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Divulgar vaga de Desenvolvedor Backend",
    descricao: "Compartilhar com comunidades técnicas e agências parceiras.",
    listaId: "lista-a-fazer",
    responsavel: "Camila Duarte",
    vencimento: "2026-09-22",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Aplicar pesquisa de clima organizacional",
    descricao: "Disparar o formulário trimestral para todas as áreas.",
    listaId: "lista-a-fazer",
    responsavel: "Juliana Alves",
    vencimento: "2026-09-25",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Entrevistar candidata Paula para Customer Success",
    descricao: "Segunda entrevista, foco em experiência com clientes enterprise.",
    listaId: "lista-em-andamento",
    responsavel: "Rafael Ribeiro",
    vencimento: "2026-09-15",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Onboarding do Pedro (Analista Financeiro)",
    descricao: "Acompanhar integração na primeira semana, apresentar o time.",
    listaId: "lista-em-andamento",
    responsavel: "Juliana Alves",
    vencimento: "2026-09-20",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Elaborar PDI do time de vendas",
    descricao: "Reunir entregas do trimestre e objetivos da diretoria comercial.",
    listaId: "lista-em-andamento",
    responsavel: "Camila Duarte",
    vencimento: "2026-09-30",
    arquivado: false,
    comentarios: [],
  },
  {
    id: randomUUID(),
    nome: "Consolidar resultados da pesquisa de clima do trimestre passado",
    descricao: "Relatório final apresentado à liderança, com plano de ação.",
    listaId: "lista-concluido",
    responsavel: "Juliana Alves",
    vencimento: "2026-09-01",
    arquivado: false,
    comentarios: [],
  },
];

function cartaoPublico(c: CartaoInterno): Cartao {
  return { id: c.id, nome: c.nome, descricao: c.descricao || "", responsavel: c.responsavel || "", vencimento: c.vencimento || null };
}

async function listarListas(): Promise<Lista[]> {
  return listas.map((l) => ({ ...l }));
}

async function listarCartoes(): Promise<Cartao[]> {
  return cartoes.filter((c) => !c.arquivado).map(cartaoPublico);
}

async function obterQuadro(): Promise<Quadro> {
  return {
    listas: listas.map((l) => ({
      id: l.id,
      nome: l.nome,
      cartoes: cartoes.filter((c) => c.listaId === l.id && !c.arquivado).map(cartaoPublico),
    })),
  };
}

async function criarCartao({ nome, descricao = "", listaId, vencimento = null }: DadosNovoCartao): Promise<Cartao> {
  const lista = listas.find((l) => l.id === listaId) || listas[0];
  const cartao: CartaoInterno = {
    id: randomUUID(),
    nome,
    descricao,
    listaId: lista.id,
    responsavel: "",
    vencimento: vencimento || null,
    arquivado: false,
    comentarios: [],
  };
  cartoes.push(cartao);
  return cartaoPublico(cartao);
}

async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
  const cartao = cartoes.find((c) => c.id === cartaoId);
  if (!cartao) throw new Error("Cartão não encontrado.");
  const lista = listas.find((l) => l.id === listaId);
  if (!lista) throw new Error("Lista não encontrada.");
  cartao.listaId = lista.id;
  return cartaoPublico(cartao);
}

async function comentar({ cartaoId, texto }: { cartaoId: string; texto: string }): Promise<{ ok: true }> {
  const cartao = cartoes.find((c) => c.id === cartaoId);
  if (!cartao) throw new Error("Cartão não encontrado.");
  cartao.comentarios.push({ texto, data: new Date().toISOString() });
  return { ok: true };
}

async function arquivarCartao({ cartaoId }: { cartaoId: string }): Promise<{ ok: true }> {
  const cartao = cartoes.find((c) => c.id === cartaoId);
  if (!cartao) throw new Error("Cartão não encontrado.");
  cartao.arquivado = true;
  return { ok: true };
}

export const quadroDemo: ProvedorQuadro = {
  listarListas,
  listarCartoes,
  obterQuadro,
  criarCartao,
  moverCartao,
  comentar,
  arquivarCartao,
};
