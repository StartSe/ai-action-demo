// Link único de coleta de respostas (US-012): gera um formulário público (lib/formularios.ts) a
// partir de um questionário salvo (lib/questionarios.ts) e grava cada resposta recebida em
// lib/respostas.ts, sem chamar a IA. lib/bussola.ts importa este módulo por efeito colateral para
// registrar o callback "bussola" antes de app/api/f/[token]/route.ts atender qualquer requisição.
// A análise das respostas reais (nível geral, resumo) é a US-013.
import { contarRespostas, criar, encerrar, expirou, listarPorTipo, obter as obterFormulario, registrarCallback, type CampoFormulario, type ParametrosPublicos } from "./formularios";
import { obter as obterQuestionario } from "./questionarios";
import { listarPorCodigo, salvar as salvarResposta } from "./respostas";
import { ESCALA_MODELO } from "./modelo";
import type { Questionario, Resposta } from "./types";

export const TIPO_LINK_AVALIACAO = "bussola";

const SECAO_SOBRE_VOCE = "Sobre você (opcional)";

export type ParametrosLinkAvaliacao = ParametrosPublicos & { questionarioId: string; empresa: string };

/** Converte as perguntas do questionário em campos do formulário público, agrupados por dimensão (secao);
 * "Área" e "Cargo" entram como campos opcionais numa seção extra ao final. */
export function camposDoQuestionario(questionario: Questionario): CampoFormulario[] {
  const campos: CampoFormulario[] = questionario.perguntas.map((p) => {
    if (p.tipo === "escala") {
      return { chave: p.id, rotulo: p.texto, tipo: "escala", obrigatorio: true, secao: p.dimensao, min: ESCALA_MODELO.min, max: ESCALA_MODELO.max, rotuloMin: ESCALA_MODELO.rotuloMin, rotuloMax: ESCALA_MODELO.rotuloMax };
    }
    if (p.tipo === "escolha") {
      return { chave: p.id, rotulo: p.texto, tipo: "escolha", obrigatorio: true, secao: p.dimensao, opcoes: p.opcoes ?? [] };
    }
    return { chave: p.id, rotulo: p.texto, tipo: "textarea", obrigatorio: false, secao: p.dimensao };
  });
  campos.push({ chave: "area", rotulo: "Área", tipo: "texto", secao: SECAO_SOBRE_VOCE });
  campos.push({ chave: "cargo", rotulo: "Cargo", tipo: "texto", secao: SECAO_SOBRE_VOCE });
  return campos;
}

const PRAZOS_VALIDOS = [7, 30, 90];
const LIMITES_VALIDOS = [10, 50, 200];

export function criarLinkAvaliacao({ questionarioId, titulo, empresa, expiraEmDias, limite }: { questionarioId: string; titulo: string; empresa: string; expiraEmDias?: number; limite?: number }): string {
  const salvo = obterQuestionario(questionarioId);
  if (!salvo) throw new Error("Questionário não encontrado.");
  const prazo = PRAZOS_VALIDOS.includes(expiraEmDias ?? 30) ? (expiraEmDias ?? 30) : 30;
  const teto = limite === undefined ? undefined : LIMITES_VALIDOS.includes(limite) ? limite : 50;
  const parametros: ParametrosLinkAvaliacao = {
    marca: "B",
    nome: "Bússola de IA",
    titulo: titulo || salvo.titulo,
    descricao: `${empresa}. Você pode responder sem se identificar.`,
    agradecimento: `Sua resposta entrou na avaliação de ${empresa}.`,
    questionarioId,
    empresa,
  };
  return criar({ tipo: TIPO_LINK_AVALIACAO, campos: camposDoQuestionario(salvo.questionario), parametros, expiraEmDias: prazo, limite: teto });
}

export type AvaliacaoEmAndamento = { codigo: string; titulo: string; empresa: string; totalRespostas: number; criadoEm: string; encerrada: boolean };

/** "Avaliações em andamento" no painel: todo link criado por este app, mais recente primeiro. */
export function listarAvaliacoesEmAndamento(limite = 50): AvaliacaoEmAndamento[] {
  return listarPorTipo<ParametrosLinkAvaliacao>(TIPO_LINK_AVALIACAO, limite).map((f) => ({
    codigo: f.token,
    titulo: f.parametros.titulo,
    empresa: f.parametros.empresa,
    totalRespostas: contarRespostas(f.token),
    criadoEm: f.criadoEm,
    encerrada: expirou(f),
  }));
}

/** Encerra o link (para de aceitar respostas); devolve false se o código não for de uma avaliação deste app. */
export function encerrarAvaliacao(codigo: string): boolean {
  const formulario = obterFormulario(codigo);
  if (!formulario || formulario.tipo !== TIPO_LINK_AVALIACAO) return false;
  encerrar(codigo);
  return true;
}

/** Respostas já recebidas por um link ("Ver resultado"); null quando o código não é de uma avaliação deste app. */
export function respostasDoLink(codigo: string): Resposta[] | null {
  const formulario = obterFormulario(codigo);
  if (!formulario || formulario.tipo !== TIPO_LINK_AVALIACAO) return null;
  return listarPorCodigo(codigo);
}

// app/api/f/[token]/route.ts chama o callback ANTES de checar expiração/limite (esse checagem só
// acontece depois, dentro de responder()); sem repetir aqui a mesma checagem, uma resposta recusada
// por limite atingido ou link expirado ainda seria gravada em lib/respostas.ts, ficando fora de
// sincronia com a contagem oficial (contarRespostas) exibida em "Avaliações em andamento".
registrarCallback(TIPO_LINK_AVALIACAO, ({ token, dados, parametros }) => {
  const formulario = obterFormulario(token);
  if (!formulario || expirou(formulario)) return;
  if (formulario.limite !== null && contarRespostas(token) >= formulario.limite) return;
  const { questionarioId } = parametros as ParametrosLinkAvaliacao;
  const { area, cargo, ...valores } = dados;
  salvarResposta({ codigo: token, questionarioId, area: area || undefined, cargo: cargo || undefined, valores });
});
