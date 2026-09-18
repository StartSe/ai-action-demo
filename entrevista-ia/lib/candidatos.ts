// Candidato: a pessoa, cadastrada uma vez e reaproveitada em quantas vagas o RH quiser (US-002/US-008).
//
// O currículo mora aqui em três pedaços: o arquivo original (`cvArquivo`, para o gestor reabrir), o
// texto extraído dele (`cvTexto`, o que alimenta a ficha e o roteiro) e o nome/tipo do arquivo. Os
// dois primeiros são os campos mais pesados do banco e por isso **nunca entram numa listagem** — ver
// `COLUNAS_LEVES` abaixo.
import { agora, banco, gerarId } from "./banco";

export type PesquisaStatus = "nao_pedida" | "pendente" | "em_andamento" | "concluida" | "sem_resultado" | "falhou";
export type TipoFonteCandidato = "cv" | "linkedin" | "busca" | "pagina";

/** A ficha estruturada do candidato, com a origem de cada campo (US-009). Enquanto `lib/ficha.ts` não
 * existe, ela viaja como JSON opaco: este módulo só guarda e devolve; quem a interpreta é a US-009. */
export type FichaCandidato = Record<string, unknown>;

/**
 * O candidato como as telas o veem.
 *
 * `cvTexto` e `cvArquivo` **não estão aqui de propósito**: um currículo são dezenas de milhares de
 * caracteres mais até 5 MB de arquivo, e uma lista de trinta candidatos carregaria tudo isso para
 * mostrar trinta nomes. Quem precisa deles pede por `obterCvTexto()` / `obterCvArquivo()`.
 */
export type Candidato = {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  linkedinUrl?: string;
  /** Empresa atual, cargo ou cidade — o que separa a pessoa certa dos homônimos na pesquisa (D6). */
  termoBusca?: string;
  ficha?: FichaCandidato;
  cvNome?: string;
  cvTipo?: string;
  /** Houve texto legível no currículo? Um PDF só de imagem entra com `false` (US-008). */
  temCvTexto: boolean;
  pesquisaStatus: PesquisaStatus;
  pesquisaEm?: string;
  identidadeConfirmada: boolean;
  exemplo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type FonteCandidato = {
  id: string;
  candidatoId: string;
  tipo: TipoFonteCandidato;
  url?: string;
  titulo?: string;
  resumo?: string;
  conteudo: string;
  coletadoEm: string;
};

type LinhaCandidato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  linkedinUrl: string | null;
  termoBusca: string | null;
  ficha: string | null;
  cvNome: string | null;
  cvTipo: string | null;
  temCvTexto: number;
  pesquisaStatus: string;
  pesquisaEm: string | null;
  identidadeConfirmada: number;
  exemplo: number;
  criadoEm: string;
  atualizadoEm: string;
};

type LinhaFonte = {
  id: string;
  candidatoId: string;
  tipo: string;
  url: string | null;
  titulo: string | null;
  resumo: string | null;
  conteudo: string;
  coletadoEm: string;
};

const STATUS_PESQUISA: PesquisaStatus[] = ["nao_pedida", "pendente", "em_andamento", "concluida", "sem_resultado", "falhou"];
const TIPOS_FONTE: TipoFonteCandidato[] = ["cv", "linkedin", "busca", "pagina"];

/** O texto do currículo é cortado aqui, e não na rota: a regra vale igual para toda porta que grave. */
export const LIMITE_CV_TEXTO = 60_000;
/** O conteúdo de uma página coletada na web (US-011) entra cortado, pelo mesmo motivo. */
export const LIMITE_FONTE_CONTEUDO = 20_000;

/** Tudo menos `cvTexto` e `cvArquivo`; `temCvTexto` vira um booleano já no SQL. */
const COLUNAS_LEVES = `id, nome, email, telefone, cidade, linkedinUrl, termoBusca, ficha, cvNome, cvTipo,
  CASE WHEN cvTexto IS NOT NULL AND length(cvTexto) > 0 THEN 1 ELSE 0 END AS temCvTexto,
  pesquisaStatus, pesquisaEm, identidadeConfirmada, exemplo, criadoEm, atualizadoEm`;

function lerFicha(valor: string | null): FichaCandidato | undefined {
  if (!valor) return undefined;
  try {
    const ficha = JSON.parse(valor) as FichaCandidato;
    return ficha && typeof ficha === "object" ? ficha : undefined;
  } catch (err) {
    console.error("Ficha de candidato ilegível no banco; tratando como ausente.", err);
    return undefined;
  }
}

function linhaParaCandidato(l: LinhaCandidato): Candidato {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email ?? undefined,
    telefone: l.telefone ?? undefined,
    cidade: l.cidade ?? undefined,
    linkedinUrl: l.linkedinUrl ?? undefined,
    termoBusca: l.termoBusca ?? undefined,
    ficha: lerFicha(l.ficha),
    cvNome: l.cvNome ?? undefined,
    cvTipo: l.cvTipo ?? undefined,
    temCvTexto: l.temCvTexto === 1,
    pesquisaStatus: STATUS_PESQUISA.includes(l.pesquisaStatus as PesquisaStatus) ? (l.pesquisaStatus as PesquisaStatus) : "nao_pedida",
    pesquisaEm: l.pesquisaEm ?? undefined,
    identidadeConfirmada: l.identidadeConfirmada === 1,
    exemplo: l.exemplo === 1,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
  };
}

function linhaParaFonte(l: LinhaFonte): FonteCandidato {
  return {
    id: l.id,
    candidatoId: l.candidatoId,
    tipo: TIPOS_FONTE.includes(l.tipo as TipoFonteCandidato) ? (l.tipo as TipoFonteCandidato) : "pagina",
    url: l.url ?? undefined,
    titulo: l.titulo ?? undefined,
    resumo: l.resumo ?? undefined,
    conteudo: l.conteudo,
    coletadoEm: l.coletadoEm,
  };
}

export type CamposCandidato = Partial<
  Pick<Candidato, "nome" | "email" | "telefone" | "cidade" | "linkedinUrl" | "termoBusca" | "ficha" | "cvNome" | "cvTipo" | "pesquisaStatus" | "pesquisaEm" | "identidadeConfirmada">
> & {
  cvTexto?: string | null;
  cvArquivo?: Uint8Array | null;
};

export function criar(campos: CamposCandidato & { nome: string; exemplo?: boolean }): Candidato {
  const id = gerarId();
  const momento = agora();
  banco()
    .prepare(
      `INSERT INTO candidatos (id, nome, email, telefone, cidade, linkedinUrl, termoBusca, ficha, cvNome, cvTipo,
                               cvTexto, cvArquivo, pesquisaStatus, pesquisaEm, identidadeConfirmada, exemplo,
                               criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      campos.nome.trim(),
      campos.email?.trim().toLowerCase() || null,
      campos.telefone?.trim() || null,
      campos.cidade?.trim() || null,
      campos.linkedinUrl?.trim() || null,
      campos.termoBusca?.trim() || null,
      campos.ficha ? JSON.stringify(campos.ficha) : null,
      campos.cvNome?.trim() || null,
      campos.cvTipo?.trim() || null,
      campos.cvTexto ? campos.cvTexto.slice(0, LIMITE_CV_TEXTO) : null,
      campos.cvArquivo ?? null,
      campos.pesquisaStatus ?? "nao_pedida",
      campos.pesquisaEm ?? null,
      campos.identidadeConfirmada ? 1 : 0,
      campos.exemplo ? 1 : 0,
      momento,
      momento,
    );
  const candidato = obter(id);
  if (!candidato) throw new Error("O candidato recém-criado não foi encontrado no banco.");
  return candidato;
}

export function obter(id: string): Candidato | null {
  const linha = banco().prepare(`SELECT ${COLUNAS_LEVES} FROM candidatos WHERE id = ?`).get(id) as LinhaCandidato | undefined;
  return linha ? linhaParaCandidato(linha) : null;
}

/** Busca por parte do nome (sem distinção de caixa), mais recentes primeiro. */
export function listar({ busca, limite = 100 }: { busca?: string; limite?: number } = {}): Candidato[] {
  const termo = busca?.trim();
  const d = banco();
  const linhas = termo
    ? (d
        .prepare(`SELECT ${COLUNAS_LEVES} FROM candidatos WHERE nome LIKE ? COLLATE NOCASE ORDER BY criadoEm DESC LIMIT ?`)
        .all(`%${termo}%`, limite) as LinhaCandidato[])
    : (d.prepare(`SELECT ${COLUNAS_LEVES} FROM candidatos ORDER BY criadoEm DESC LIMIT ?`).all(limite) as LinhaCandidato[]);
  return linhas.map(linhaParaCandidato);
}

/** O texto extraído do currículo, para gerar a ficha de novo ou montar o roteiro. */
export function obterCvTexto(id: string): string | null {
  const linha = banco().prepare("SELECT cvTexto FROM candidatos WHERE id = ?").get(id) as { cvTexto: string | null } | undefined;
  return linha?.cvTexto ?? null;
}

/** O arquivo original do currículo, para o gestor abrir (`GET /api/candidatos/[id]/cv`, US-008). */
export function obterCvArquivo(id: string): { nome: string; tipo: string; dados: Uint8Array } | null {
  const linha = banco().prepare("SELECT cvNome, cvTipo, cvArquivo FROM candidatos WHERE id = ?").get(id) as
    | { cvNome: string | null; cvTipo: string | null; cvArquivo: Uint8Array | null }
    | undefined;
  if (!linha?.cvArquivo) return null;
  return { nome: linha.cvNome || "curriculo", tipo: linha.cvTipo || "application/octet-stream", dados: linha.cvArquivo };
}

/** Atualiza só os campos passados; `ficha: null`/`cvTexto: null` limpam o valor. */
export function atualizar(id: string, campos: CamposCandidato & { ficha?: FichaCandidato | null }): Candidato | null {
  const atual = obter(id);
  if (!atual) return null;

  const partes: string[] = [];
  const valores: (string | number | Uint8Array | null)[] = [];
  const definir = (coluna: string, valor: string | number | Uint8Array | null) => {
    partes.push(`${coluna} = ?`);
    valores.push(valor);
  };

  if (campos.nome !== undefined) definir("nome", campos.nome.trim());
  if (campos.email !== undefined) definir("email", campos.email?.trim().toLowerCase() || null);
  if (campos.telefone !== undefined) definir("telefone", campos.telefone?.trim() || null);
  if (campos.cidade !== undefined) definir("cidade", campos.cidade?.trim() || null);
  if (campos.linkedinUrl !== undefined) definir("linkedinUrl", campos.linkedinUrl?.trim() || null);
  if (campos.termoBusca !== undefined) definir("termoBusca", campos.termoBusca?.trim() || null);
  if (campos.ficha !== undefined) definir("ficha", campos.ficha ? JSON.stringify(campos.ficha) : null);
  if (campos.cvNome !== undefined) definir("cvNome", campos.cvNome?.trim() || null);
  if (campos.cvTipo !== undefined) definir("cvTipo", campos.cvTipo?.trim() || null);
  if (campos.cvTexto !== undefined) definir("cvTexto", campos.cvTexto ? campos.cvTexto.slice(0, LIMITE_CV_TEXTO) : null);
  if (campos.cvArquivo !== undefined) definir("cvArquivo", campos.cvArquivo ?? null);
  if (campos.pesquisaStatus !== undefined) definir("pesquisaStatus", campos.pesquisaStatus);
  if (campos.pesquisaEm !== undefined) definir("pesquisaEm", campos.pesquisaEm ?? null);
  if (campos.identidadeConfirmada !== undefined) definir("identidadeConfirmada", campos.identidadeConfirmada ? 1 : 0);
  if (!partes.length) return atual;

  definir("atualizadoEm", agora());
  valores.push(id);
  banco().prepare(`UPDATE candidatos SET ${partes.join(", ")} WHERE id = ?`).run(...valores);
  return obter(id);
}

/**
 * Apaga o candidato e tudo que é dele — fontes, entrevistas e as falas dessas entrevistas — numa
 * transação só. É o pedido de apagamento da D12 do PRD, e por isso não sobra nada pela metade.
 *
 * O parecer de cada entrevista continua em `resultados` (lib/historico.ts), que tem conexão própria
 * para o mesmo arquivo: chamá-lo de dentro desta transação encontraria o banco ocupado. Quem quiser
 * apagar os pareceres junto faz isso **depois**, com os ids devolvidos aqui.
 */
export function apagar(id: string): { resultadosOrfaos: string[] } {
  const d = banco();
  const resultados = d
    .prepare("SELECT resultadoId FROM entrevistas WHERE candidatoId = ? AND resultadoId IS NOT NULL")
    .all(id) as { resultadoId: string }[];
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM mensagens_entrevista WHERE entrevistaId IN (SELECT id FROM entrevistas WHERE candidatoId = ?)").run(id);
    d.prepare("DELETE FROM entrevistas WHERE candidatoId = ?").run(id);
    d.prepare("DELETE FROM fontes_candidato WHERE candidatoId = ?").run(id);
    d.prepare("DELETE FROM candidatos WHERE id = ?").run(id);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  return { resultadosOrfaos: resultados.map((r) => r.resultadoId) };
}

export function adicionarFonte({
  candidatoId,
  tipo,
  url,
  titulo,
  resumo,
  conteudo = "",
}: {
  candidatoId: string;
  tipo: TipoFonteCandidato;
  url?: string;
  titulo?: string;
  resumo?: string;
  conteudo?: string;
}): FonteCandidato {
  const id = gerarId();
  const coletadoEm = agora();
  const cortado = conteudo.slice(0, LIMITE_FONTE_CONTEUDO);
  banco()
    .prepare("INSERT INTO fontes_candidato (id, candidatoId, tipo, url, titulo, resumo, conteudo, coletadoEm) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, candidatoId, tipo, url?.trim() || null, titulo?.trim() || null, resumo?.trim() || null, cortado, coletadoEm);
  return { id, candidatoId, tipo, url, titulo, resumo, conteudo: cortado, coletadoEm };
}

export function listarFontes(candidatoId: string): FonteCandidato[] {
  const linhas = banco()
    .prepare("SELECT * FROM fontes_candidato WHERE candidatoId = ? ORDER BY coletadoEm DESC")
    .all(candidatoId) as LinhaFonte[];
  return linhas.map(linhaParaFonte);
}
