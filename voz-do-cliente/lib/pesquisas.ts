// Pesquisa NPS pública (US-068): link único e reaproveitável (sem limite de respostas) que qualquer
// cliente preenche sem login. Próprio deste app (ao contrário de lib/formularios.ts, não é copiado sem
// alterar), porque decide os campos e como as respostas viram Comentario[] para lib/analise.ts.
import { contarRespostas, criar, encerrar, expirou, listarPorTipo, listarRespostasPorTipo, obter, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import type { Comentario } from "./types";

export const TIPO_PESQUISA = "voz-do-cliente-nps";

const CAMPOS_PESQUISA: CampoFormulario[] = [
  { chave: "nota", rotulo: "De 0 a 10, o quanto você nos recomendaria a um amigo ou colega?", tipo: "nota", obrigatorio: true },
  { chave: "comentario", rotulo: "Quer contar o motivo da nota?", tipo: "textarea" },
  { chave: "segmento", rotulo: "Segmento", tipo: "texto" },
  { chave: "produto", rotulo: "Produto", tipo: "texto" },
];

type DadosPesquisa = { nota: string; comentario: string; segmento: string; produto: string };

/** Cria o link público (/f/<código>) da pesquisa; sem limite de respostas, encerrado só via encerrarPesquisa. */
export function criarPesquisa(titulo: string): string {
  const parametros: ParametrosPublicos = {
    marca: "V",
    nome: "Voz do Cliente",
    titulo: titulo || "O quanto você nos recomendaria?",
    descricao: "Leva menos de 1 minuto e ajuda a gente a melhorar.",
  };
  return criar({ tipo: TIPO_PESQUISA, campos: CAMPOS_PESQUISA, parametros });
}

export type PesquisaAtiva = { token: string; titulo: string; total: number; criadoEm: string };

/** "Pesquisas ativas": as que ainda não foram encerradas, com o total de respostas já recebidas. */
export function listarPesquisasAtivas(): PesquisaAtiva[] {
  return listarPorTipo<ParametrosPublicos>(TIPO_PESQUISA)
    .filter((f) => !expirou(f))
    .map((f) => ({ token: f.token, titulo: f.parametros.titulo, total: contarRespostas(f.token), criadoEm: f.criadoEm }));
}

/** Encerra a pesquisa (deixa de aceitar respostas); devolve false se o código não for de uma pesquisa deste app. */
export function encerrarPesquisa(token: string): boolean {
  const formulario = obter(token);
  if (!formulario || formulario.tipo !== TIPO_PESQUISA) return false;
  encerrar(token);
  return true;
}

/** Respostas de todas as pesquisas, filtradas por período, já no formato usado por lib/analise.ts. */
export function comentariosDoPeriodo(diasAtras: number | null): { comentarios: Comentario[]; total: number } {
  const respostas = listarRespostasPorTipo<DadosPesquisa>(TIPO_PESQUISA, 5000);
  const desde = diasAtras ? Date.now() - diasAtras * 24 * 60 * 60 * 1000 : null;
  const doPeriodo = desde === null ? respostas : respostas.filter((r) => new Date(r.criadoEm).getTime() >= desde);

  const comentarios: Comentario[] = doPeriodo.map((r) => {
    const partes = [r.dados.comentario?.trim()].filter(Boolean) as string[];
    if (r.dados.segmento?.trim()) partes.push(`Segmento: ${r.dados.segmento.trim()}`);
    if (r.dados.produto?.trim()) partes.push(`Produto: ${r.dados.produto.trim()}`);
    return { texto: partes.join(" — ") || "(sem comentário, só a nota)", nota: Number(r.dados.nota) };
  });

  return { comentarios, total: comentarios.length };
}
