// Quadro Kanban em memória, usado quando TRELLO_API_KEY / TRELLO_API_TOKEN / TRELLO_BOARD_ID
// não estão configurados. Implementa a mesma interface de lib/trello.ts (ProvedorQuadro).
// Cada visitante (identificado por lib/visitante.ts) tem seu próprio quadro, para que a
// demonstração de uma pessoa não apareça alterada para outra.
import { randomUUID } from "node:crypto";
import type { Cartao, DadosNovoCartao, Lista, ProvedorQuadro, Quadro } from "./quadro";

interface CartaoInterno extends Cartao {
  listaId: string;
  arquivado: boolean;
  comentarios: { id: string; texto: string; data: string }[];
}

interface EstadoVisitante {
  listas: Lista[];
  cartoes: CartaoInterno[];
}

const LISTAS_INICIAIS: Lista[] = [
  { id: "lista-a-fazer", nome: "A fazer" },
  { id: "lista-em-andamento", nome: "Em andamento" },
  { id: "lista-concluido", nome: "Concluído" },
];

/** ISO de N dias atrás, usado para o cartão de exemplo já nascer com uma antiguidade plausível (relativo a "agora", nunca uma data fixa que envelheceria). */
function diasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function cartoesIniciais(): CartaoInterno[] {
  return [
    {
      id: randomUUID(),
      nome: "Abrir vaga de Analista de RH Pleno",
      descricao: "Publicar a vaga no site e no LinkedIn, alinhar perfil com a diretoria.",
      listaId: "lista-a-fazer",
      responsavel: "Camila Duarte",
      vencimento: "2026-09-18",
      atualizadoEm: diasAtras(2),
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
      atualizadoEm: diasAtras(1),
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
      atualizadoEm: diasAtras(7),
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
      atualizadoEm: diasAtras(6),
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
      atualizadoEm: diasAtras(3),
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
      atualizadoEm: diasAtras(1),
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
      atualizadoEm: diasAtras(10),
      arquivado: false,
      comentarios: [],
    },
  ];
}

function estadoInicial(): EstadoVisitante {
  return { listas: LISTAS_INICIAIS.map((l) => ({ ...l })), cartoes: cartoesIniciais() };
}

const quadrosPorVisitante = new Map<string, EstadoVisitante>();

function estadoDe(visitanteId: string): EstadoVisitante {
  let estado = quadrosPorVisitante.get(visitanteId);
  if (!estado) {
    estado = estadoInicial();
    quadrosPorVisitante.set(visitanteId, estado);
  }
  return estado;
}

/** Descarta o quadro de exemplo deste visitante; a próxima leitura recria os cartões iniciais. */
export function reiniciarQuadroDemo(visitanteId: string): void {
  quadrosPorVisitante.delete(visitanteId);
}

function cartaoPublico(c: CartaoInterno): Cartao {
  return { id: c.id, nome: c.nome, descricao: c.descricao || "", responsavel: c.responsavel || "", vencimento: c.vencimento || null, atualizadoEm: c.atualizadoEm };
}

/** Quadro de exemplo fixo (mesmos cartões iniciais), sem vínculo com nenhum visitante — usado por tarefas
 * em segundo plano sem cookies de sessão (ex.: a rotina "resumo-quadro" quando o Trello não está conectado). */
export function quadroExemploFixo(): Quadro {
  const cartoes = cartoesIniciais();
  return {
    listas: LISTAS_INICIAIS.map((l) => ({ ...l, cartoes: cartoes.filter((c) => c.listaId === l.id).map(cartaoPublico) })),
  };
}

/** Um ProvedorQuadro que opera só o quadro em memória deste visitante. */
export function quadroDemoPara(visitanteId: string): ProvedorQuadro {
  async function listarListas(): Promise<Lista[]> {
    return estadoDe(visitanteId).listas.map((l) => ({ ...l }));
  }

  async function listarCartoes(): Promise<Cartao[]> {
    return estadoDe(visitanteId).cartoes.filter((c) => !c.arquivado).map(cartaoPublico);
  }

  async function obterQuadro(): Promise<Quadro> {
    const estado = estadoDe(visitanteId);
    return {
      listas: estado.listas.map((l) => ({
        id: l.id,
        nome: l.nome,
        cartoes: estado.cartoes.filter((c) => c.listaId === l.id && !c.arquivado).map(cartaoPublico),
      })),
    };
  }

  async function criarCartao({ nome, descricao = "", listaId, vencimento = null }: DadosNovoCartao): Promise<Cartao> {
    const estado = estadoDe(visitanteId);
    const lista = estado.listas.find((l) => l.id === listaId) || estado.listas[0];
    const cartao: CartaoInterno = {
      id: randomUUID(),
      nome,
      descricao,
      listaId: lista.id,
      responsavel: "",
      vencimento: vencimento || null,
      atualizadoEm: new Date().toISOString(),
      arquivado: false,
      comentarios: [],
    };
    estado.cartoes.push(cartao);
    return cartaoPublico(cartao);
  }

  async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
    const estado = estadoDe(visitanteId);
    const cartao = estado.cartoes.find((c) => c.id === cartaoId);
    if (!cartao) throw new Error("Cartão não encontrado.");
    const lista = estado.listas.find((l) => l.id === listaId);
    if (!lista) throw new Error("Lista não encontrada.");
    cartao.listaId = lista.id;
    cartao.atualizadoEm = new Date().toISOString();
    return cartaoPublico(cartao);
  }

  async function atribuir({ cartaoId, responsavel }: { cartaoId: string; responsavel: string }): Promise<Cartao> {
    const estado = estadoDe(visitanteId);
    const cartao = estado.cartoes.find((c) => c.id === cartaoId);
    if (!cartao) throw new Error("Cartão não encontrado.");
    cartao.responsavel = responsavel;
    return cartaoPublico(cartao);
  }

  async function comentar({ cartaoId, texto }: { cartaoId: string; texto: string }): Promise<{ ok: true; comentarioId: string }> {
    const estado = estadoDe(visitanteId);
    const cartao = estado.cartoes.find((c) => c.id === cartaoId);
    if (!cartao) throw new Error("Cartão não encontrado.");
    const comentario = { id: randomUUID(), texto, data: new Date().toISOString() };
    cartao.comentarios.push(comentario);
    return { ok: true, comentarioId: comentario.id };
  }

  async function removerComentario({ cartaoId, comentarioId }: { cartaoId: string; comentarioId: string }): Promise<{ ok: true }> {
    const estado = estadoDe(visitanteId);
    const cartao = estado.cartoes.find((c) => c.id === cartaoId);
    if (!cartao) throw new Error("Cartão não encontrado.");
    cartao.comentarios = cartao.comentarios.filter((c) => c.id !== comentarioId);
    return { ok: true };
  }

  async function arquivarCartao({ cartaoId }: { cartaoId: string }): Promise<{ ok: true }> {
    const estado = estadoDe(visitanteId);
    const cartao = estado.cartoes.find((c) => c.id === cartaoId);
    if (!cartao) throw new Error("Cartão não encontrado.");
    cartao.arquivado = true;
    return { ok: true };
  }

  return { listarListas, listarCartoes, obterQuadro, criarCartao, moverCartao, atribuir, comentar, removerComentario, arquivarCartao };
}
