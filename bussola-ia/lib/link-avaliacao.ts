import { randomBytes } from "node:crypto";
import { abrirBanco } from "./store";
import type { ResultadoResposta } from "./formularios";
// Link único de coleta de respostas (US-012): gera um formulário público (lib/formularios.ts) a
// partir de um questionário salvo (lib/questionarios.ts) e grava cada resposta recebida em
// lib/respostas.ts, sem chamar a IA. lib/bussola.ts importa este módulo por efeito colateral para
// registrar o callback "bussola" antes de app/api/f/[token]/route.ts atender qualquer requisição.
// A análise das respostas reais (nível geral, resumo) mora em lib/bussola.ts:analisarLink.
import {
  contarRespostas,
  criar,
  encerrar,
  expirou,
  listarPorTipo,
  obter as obterFormulario,
  registrarCallback,
  type CampoFormulario,
  type ParametrosPublicos,
} from "./formularios";
import {
  atualizar as atualizarQuestionario,
  obter as obterQuestionario,
  obterPorTitulo,
  salvar as salvarQuestionario,
} from "./questionarios";
import { listarPorCodigo, salvar as salvarResposta } from "./respostas";
import { ESCALA_MODELO } from "./modelo";
import type { ContextoAssessment, Questionario, Resposta } from "./types";

export const TIPO_LINK_AVALIACAO = "bussola";

const SECAO_SOBRE_VOCE = "Sobre você (opcional)";

export type ParametrosLinkAvaliacao = ParametrosPublicos &
  Partial<ContextoAssessment> & { questionarioId: string; empresa: string };

/** Converte as perguntas do questionário em campos do formulário público, agrupados por dimensão (secao);
 * "Área" e "Cargo" entram como campos opcionais numa seção extra ao final. */
export function camposDoQuestionario(
  questionario: Questionario,
): CampoFormulario[] {
  const campos: CampoFormulario[] = questionario.perguntas.map((p) => {
    if (p.tipo === "escala") {
      return {
        chave: p.id,
        rotulo: p.texto,
        tipo: "escala",
        obrigatorio: true,
        secao: p.dimensao,
        min: ESCALA_MODELO.min,
        max: ESCALA_MODELO.max,
        rotuloMin: ESCALA_MODELO.rotuloMin,
        rotuloMax: ESCALA_MODELO.rotuloMax,
      };
    }
    if (p.tipo === "escolha") {
      return {
        chave: p.id,
        rotulo: p.texto,
        tipo: "escolha",
        obrigatorio: true,
        secao: p.dimensao,
        opcoes: p.opcoes ?? [],
      };
    }
    return {
      chave: p.id,
      rotulo: p.texto,
      tipo: "textarea",
      obrigatorio: false,
      secao: p.dimensao,
    };
  });
  campos.push({
    chave: "area",
    rotulo: "Área",
    tipo: "texto",
    secao: SECAO_SOBRE_VOCE,
  });
  campos.push({
    chave: "cargo",
    rotulo: "Cargo",
    tipo: "texto",
    secao: SECAO_SOBRE_VOCE,
  });
  return campos;
}

const PRAZOS_VALIDOS = [7, 30, 90];
const LIMITES_VALIDOS = [10, 50, 200];

export function criarLinkAvaliacao({
  questionarioId,
  titulo,
  empresa,
  expiraEmDias,
  limite,
  contexto,
}: {
  contexto?: ContextoAssessment;
  questionarioId: string;
  titulo: string;
  empresa: string;
  expiraEmDias?: number;
  limite?: number;
}): string {
  const salvo = obterQuestionario(questionarioId);
  if (!salvo) throw new Error("Questionário não encontrado.");
  const prazo = PRAZOS_VALIDOS.includes(expiraEmDias ?? 30)
    ? (expiraEmDias ?? 30)
    : 30;
  const teto =
    limite === undefined
      ? undefined
      : LIMITES_VALIDOS.includes(limite)
        ? limite
        : 50;
  const parametros: ParametrosLinkAvaliacao = {
    ...contexto,
    marca: "B",
    nome: "Bússola de IA",
    titulo: titulo || salvo.titulo,
    descricao: `${empresa}${contexto?.grupoNome ? ` · ${contexto.grupoNome}` : ""}. Compartilhe sua percepção sobre inovação e IA. Área e cargo são opcionais; as respostas ficam disponíveis ao gestor.`,
    agradecimento: `Sua resposta entrou na avaliação de ${empresa}.`,
    questionarioId,
    empresa,
  };
  return criar({
    tipo: TIPO_LINK_AVALIACAO,
    campos: camposDoQuestionario(salvo.questionario),
    parametros,
    expiraEmDias: prazo,
    limite: teto,
  });
}

export type AvaliacaoEmAndamento = Partial<ContextoAssessment> & {
  codigo: string;
  titulo: string;
  empresa: string;
  questionarioId: string;
  totalRespostas: number;
  /** Teto de respostas do link (null = sem limite). */
  limite: number | null;
  /** Quando o link deixa de aceitar respostas (null = sem prazo). */
  expiraEm: string | null;
  criadoEm: string;
  encerrada: boolean;
};

/** "Avaliações em andamento" no painel: todo link criado por este app, mais recente primeiro. */
export function listarAvaliacoesEmAndamento(
  limite = 50,
): AvaliacaoEmAndamento[] {
  return listarPorTipo<ParametrosLinkAvaliacao>(
    TIPO_LINK_AVALIACAO,
    limite,
  ).map((f) => ({
    codigo: f.token,
    grupoTipo: f.parametros.grupoTipo ?? "empresa",
    grupoNome: f.parametros.grupoNome,
    participantes: f.parametros.participantes,
    objetivo: f.parametros.objetivo,
    setor: f.parametros.setor,
    titulo: f.parametros.titulo,
    empresa: f.parametros.empresa,
    questionarioId: f.parametros.questionarioId,
    totalRespostas: contarRespostas(f.token),
    limite: f.limite,
    expiraEm: f.expiraEm,
    criadoEm: f.criadoEm,
    encerrada: expirou(f),
  }));
}

/** Avaliação que usa este questionário, aberta ou arquivada. Impede apagar ou reescrever
 * as perguntas que dão significado às respostas já coletadas. */
export function questionarioEmUso(
  questionarioId: string,
): AvaliacaoEmAndamento | null {
  return (
    listarAvaliacoesEmAndamento(-1).find(
      (a) => a.questionarioId === questionarioId,
    ) ?? null
  );
}

function mesmoConteudo(a: Questionario, b: Questionario): boolean {
  return (
    JSON.stringify({ d: a.dimensoes, p: a.perguntas }) ===
    JSON.stringify({ d: b.dimensoes, p: b.perguntas })
  );
}

/** "Salvar questionário" e "Criar link" passam por aqui: o mesmo título atualiza o salvo em vez de duplicar (US-029).
 * Exceção: se o salvo está vinculado a qualquer avaliação e o conteúdo mudou, a versão nova entra como cópia
 * (as respostas já recebidas apontam para as perguntas antigas pelo id). */
export function guardarQuestionario({
  titulo,
  questionario,
}: {
  titulo: string;
  questionario: Questionario;
}): { id: string; atualizado: boolean } {
  const tituloLimpo = titulo.trim();
  const existente = obterPorTitulo(tituloLimpo);
  if (!existente)
    return {
      id: salvarQuestionario({ titulo: tituloLimpo, questionario }),
      atualizado: false,
    };
  if (mesmoConteudo(existente.questionario, questionario))
    return { id: existente.id, atualizado: true };
  if (questionarioEmUso(existente.id))
    return {
      id: salvarQuestionario({ titulo: tituloLimpo, questionario }),
      atualizado: false,
    };
  atualizarQuestionario(existente.id, { titulo: tituloLimpo, questionario });
  return { id: existente.id, atualizado: true };
}

/** Dias inteiros até o link expirar (0 quando expira hoje; negativo quando já expirou; null sem prazo). */
export function diasAteExpirar(
  expiraEm: string | null,
  agora = new Date(),
): number | null {
  if (!expiraEm) return null;
  return Math.ceil(
    (new Date(expiraEm).getTime() - agora.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/** Uma linha por avaliação aberta: "N respostas, faltam X, prazo em Y dias" — usada pela rotina "Resumo da coleta". */
export function resumoDaColeta(agora = new Date()): {
  abertas: AvaliacaoEmAndamento[];
  linhas: string[];
} {
  const abertas = listarAvaliacoesEmAndamento(-1).filter((a) => !a.encerrada);
  const linhas = abertas.map((a) => {
    const respostas = `${a.totalRespostas} ${a.totalRespostas === 1 ? "resposta" : "respostas"}`;
    const faltam =
      a.limite !== null
        ? `, faltam ${Math.max(0, a.limite - a.totalRespostas)} para o limite`
        : "";
    const dias = diasAteExpirar(a.expiraEm, agora);
    const prazo =
      dias === null
        ? "sem prazo"
        : dias <= 0
          ? "o prazo termina hoje"
          : `prazo em ${dias} ${dias === 1 ? "dia" : "dias"}`;
    return `${a.titulo} (${a.empresa}): ${respostas}${faltam}, ${prazo}.`;
  });
  return { abertas, linhas };
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
  if (formulario.limite !== null && contarRespostas(token) >= formulario.limite)
    return;
  const { questionarioId } = parametros as ParametrosLinkAvaliacao;
  const { area, cargo, ...valores } = dados;
  salvarResposta({
    codigo: token,
    questionarioId,
    area: area || undefined,
    cargo: cargo || undefined,
    valores,
  });
});

/** Grava as duas representações da resposta na mesma transação, inclusive sob envios simultâneos. */
export function registrarRespostaAvaliacao(
  codigo: string,
  dados: Record<string, string>,
): ResultadoResposta {
  // Inicializa tabelas das duas coleções antes de adquirir a transação na conexão comum.
  contarRespostas(codigo);
  listarPorCodigo(codigo, 0);
  const db = abrirBanco();
  db.exec("BEGIN IMMEDIATE");
  try {
    const f = db
      .prepare(
        "SELECT parametros, expiraEm, limite FROM formularios WHERE token = ? AND tipo = ?",
      )
      .get(codigo, TIPO_LINK_AVALIACAO) as
      | { parametros: string; expiraEm: string | null; limite: number | null }
      | undefined;
    let motivo: "invalido" | "expirado" | "limite" | undefined;
    if (!f) motivo = "invalido";
    else if (expirou(f)) motivo = "expirado";
    else if (
      f.limite !== null &&
      Number(
        (
          db
            .prepare("SELECT COUNT(*) AS n FROM respostas WHERE token = ?")
            .get(codigo) as { n: number }
        ).n,
      ) >= f.limite
    )
      motivo = "limite";
    if (motivo || !f) {
      db.exec("ROLLBACK");
      return { ok: false, motivo: motivo ?? "invalido" };
    }
    const { questionarioId } = JSON.parse(
      f.parametros,
    ) as ParametrosLinkAvaliacao;
    const id = randomBytes(9).toString("base64url");
    const criadoEm = new Date().toISOString();
    const { area, cargo, ...valores } = dados;
    db.prepare(
      "INSERT INTO respostas (id, token, dados, resultadoId, criadoEm) VALUES (?, ?, ?, NULL, ?)",
    ).run(id, codigo, JSON.stringify(dados), criadoEm);
    db.prepare(
      "INSERT INTO respostas_avaliacao (id, codigo, questionarioId, area, cargo, valores, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      codigo,
      questionarioId,
      area || null,
      cargo || null,
      JSON.stringify(valores),
      criadoEm,
    );
    db.exec("COMMIT");
    return { ok: true, id };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
