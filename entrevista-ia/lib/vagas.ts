// Vaga: o que o gestor abre uma vez e para onde manda quantos candidatos quiser (US-002/US-005).
//
// Antes desta história uma "vaga" era só o título digitado no formulário, e agrupar candidatos
// dependia de todo mundo escrever o mesmo texto. Agora ela tem id, e é dela que a entrevistadora tira
// o que perguntar (requisitos, desafios, competências culturais) e o que avaliar.
import { agora, banco, gerarId } from "./banco";
import { removerVagasDeExemplo } from "./exemplos";
import { semearDemonstracao } from "./semear-demo";

export type Senioridade = "estagio" | "junior" | "pleno" | "senior" | "lideranca";
export type ModeloTrabalho = "presencial" | "hibrido" | "remoto";
export type StatusVaga = "aberta" | "encerrada";
export type TomVaga = "acolhedor" | "objetivo";

/** Uma competência cultural avaliada nesta vaga. `origem` diz se ela veio da cultura da empresa
 * (US-003, marcada por padrão em toda vaga) ou se foi acrescentada só para esta vaga. */
export type CompetenciaCultural = {
  id: string;
  nome: string;
  descricao: string;
  origem: "empresa" | "vaga";
};

export type Vaga = {
  id: string;
  cargo: string;
  area?: string;
  senioridade?: Senioridade;
  modelo?: ModeloTrabalho;
  local?: string;
  /** Inteiros em reais; ausentes quando a faixa é "a combinar". */
  salarioMin?: number;
  salarioMax?: number;
  salarioACombinar: boolean;
  /** O que essa pessoa precisa resolver nos primeiros meses. */
  desafios?: string;
  /** Um requisito por linha, como o gestor digita. */
  requisitos: string;
  competenciasCulturais: CompetenciaCultural[];
  tom: TomVaga;
  numeroPerguntas: number;
  duracaoMin: number;
  perguntaPretensao: boolean;
  status: StatusVaga;
  exemplo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

type LinhaVaga = {
  id: string;
  cargo: string;
  area: string | null;
  senioridade: string | null;
  modelo: string | null;
  local: string | null;
  salarioMin: number | null;
  salarioMax: number | null;
  salarioACombinar: number;
  desafios: string | null;
  requisitos: string;
  competenciasCulturais: string;
  tom: string;
  numeroPerguntas: number;
  duracaoMin: number;
  perguntaPretensao: number;
  status: string;
  exemplo: number;
  criadoEm: string;
  atualizadoEm: string;
};

const SENIORIDADES: Senioridade[] = ["estagio", "junior", "pleno", "senior", "lideranca"];
const MODELOS: ModeloTrabalho[] = ["presencial", "hibrido", "remoto"];

export const PERGUNTAS_MIN = 6;
export const PERGUNTAS_MAX = 12;
export const DURACAO_MIN = 10;
export const DURACAO_MAX = 30;

function limitar(valor: number, min: number, max: number, padrao: number): number {
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Uma lista gravada com um formato antigo nunca derruba a tela: vira lista vazia. */
function lerCompetencias(valor: string): CompetenciaCultural[] {
  try {
    const lista = JSON.parse(valor) as CompetenciaCultural[];
    return Array.isArray(lista) ? lista : [];
  } catch (err) {
    console.error("Competências culturais ilegíveis no banco; tratando como vazias.", err);
    return [];
  }
}

function linhaParaVaga(l: LinhaVaga): Vaga {
  return {
    id: l.id,
    cargo: l.cargo,
    area: l.area ?? undefined,
    senioridade: SENIORIDADES.includes(l.senioridade as Senioridade) ? (l.senioridade as Senioridade) : undefined,
    modelo: MODELOS.includes(l.modelo as ModeloTrabalho) ? (l.modelo as ModeloTrabalho) : undefined,
    local: l.local ?? undefined,
    salarioMin: l.salarioMin ?? undefined,
    salarioMax: l.salarioMax ?? undefined,
    salarioACombinar: l.salarioACombinar === 1,
    desafios: l.desafios ?? undefined,
    requisitos: l.requisitos,
    competenciasCulturais: lerCompetencias(l.competenciasCulturais),
    tom: l.tom === "objetivo" ? "objetivo" : "acolhedor",
    numeroPerguntas: l.numeroPerguntas,
    duracaoMin: l.duracaoMin,
    perguntaPretensao: l.perguntaPretensao === 1,
    status: l.status === "encerrada" ? "encerrada" : "aberta",
    exemplo: l.exemplo === 1,
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
  };
}

/** Os campos que tela e rota podem escrever. `id`, datas e `exemplo` ficam de fora de propósito. */
export type CamposVaga = Partial<Omit<Vaga, "id" | "criadoEm" | "atualizadoEm" | "exemplo" | "status">>;

export function criar(campos: CamposVaga & { cargo: string; exemplo?: boolean }): Vaga {
  // A primeira vaga de verdade tira o exemplo de cena, aqui e não na rota: a regra vale igual para a
  // tela, para o assistente (MCP) e para qualquer porta que venha depois.
  if (!campos.exemplo) removerVagasDeExemplo();

  const id = gerarId();
  const momento = agora();
  const salarioACombinar = campos.salarioACombinar ?? false;
  banco()
    .prepare(
      `INSERT INTO vagas (id, cargo, area, senioridade, modelo, local, salarioMin, salarioMax, salarioACombinar,
                          desafios, requisitos, competenciasCulturais, tom, numeroPerguntas, duracaoMin,
                          perguntaPretensao, status, exemplo, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta', ?, ?, ?)`,
    )
    .run(
      id,
      campos.cargo.trim(),
      campos.area?.trim() || null,
      campos.senioridade ?? null,
      campos.modelo ?? null,
      campos.local?.trim() || null,
      salarioACombinar ? null : (campos.salarioMin ?? null),
      salarioACombinar ? null : (campos.salarioMax ?? null),
      salarioACombinar ? 1 : 0,
      campos.desafios?.trim() || null,
      (campos.requisitos ?? "").trim(),
      JSON.stringify(campos.competenciasCulturais ?? []),
      campos.tom === "objetivo" ? "objetivo" : "acolhedor",
      limitar(campos.numeroPerguntas ?? 8, PERGUNTAS_MIN, PERGUNTAS_MAX, 8),
      limitar(campos.duracaoMin ?? 15, DURACAO_MIN, DURACAO_MAX, 15),
      campos.perguntaPretensao === false ? 0 : 1,
      campos.exemplo ? 1 : 0,
      momento,
      momento,
    );
  const vaga = obter(id);
  if (!vaga) throw new Error("A vaga recém-criada não foi encontrada no banco.");
  return vaga;
}

export function obter(id: string): Vaga | null {
  const linha = banco().prepare("SELECT * FROM vagas WHERE id = ?").get(id) as LinhaVaga | undefined;
  return linha ? linhaParaVaga(linha) : null;
}

/** Vagas mais recentes primeiro; `status` filtra abertas ou encerradas. */
export function listar({ status, limite = 100 }: { status?: StatusVaga; limite?: number } = {}): Vaga[] {
  semearDemonstracao();
  const d = banco();
  const linhas = status
    ? (d.prepare("SELECT * FROM vagas WHERE status = ? ORDER BY criadoEm DESC LIMIT ?").all(status, limite) as LinhaVaga[])
    : (d.prepare("SELECT * FROM vagas ORDER BY criadoEm DESC LIMIT ?").all(limite) as LinhaVaga[]);
  return linhas.map(linhaParaVaga);
}

/** Atualiza só os campos passados; devolve null quando a vaga não existe. */
export function atualizar(id: string, campos: CamposVaga): Vaga | null {
  const atual = obter(id);
  if (!atual) return null;

  const partes: string[] = [];
  const valores: (string | number | null)[] = [];
  const definir = (coluna: string, valor: string | number | null) => {
    partes.push(`${coluna} = ?`);
    valores.push(valor);
  };

  if (campos.cargo !== undefined) definir("cargo", campos.cargo.trim());
  if (campos.area !== undefined) definir("area", campos.area?.trim() || null);
  if (campos.senioridade !== undefined) definir("senioridade", campos.senioridade ?? null);
  if (campos.modelo !== undefined) definir("modelo", campos.modelo ?? null);
  if (campos.local !== undefined) definir("local", campos.local?.trim() || null);
  if (campos.desafios !== undefined) definir("desafios", campos.desafios?.trim() || null);
  if (campos.requisitos !== undefined) definir("requisitos", campos.requisitos.trim());
  if (campos.competenciasCulturais !== undefined) definir("competenciasCulturais", JSON.stringify(campos.competenciasCulturais));
  if (campos.tom !== undefined) definir("tom", campos.tom === "objetivo" ? "objetivo" : "acolhedor");
  if (campos.numeroPerguntas !== undefined) definir("numeroPerguntas", limitar(campos.numeroPerguntas, PERGUNTAS_MIN, PERGUNTAS_MAX, 8));
  if (campos.duracaoMin !== undefined) definir("duracaoMin", limitar(campos.duracaoMin, DURACAO_MIN, DURACAO_MAX, 15));
  if (campos.perguntaPretensao !== undefined) definir("perguntaPretensao", campos.perguntaPretensao ? 1 : 0);
  // "A combinar" e a faixa são o mesmo campo visto de dois jeitos: quem liga um apaga o outro, aqui,
  // e não na tela — senão uma vaga fica "a combinar" com faixa escrita embaixo.
  if (campos.salarioACombinar !== undefined) {
    definir("salarioACombinar", campos.salarioACombinar ? 1 : 0);
    if (campos.salarioACombinar) {
      definir("salarioMin", null);
      definir("salarioMax", null);
    }
  }
  const aCombinar = campos.salarioACombinar ?? atual.salarioACombinar;
  if (!aCombinar) {
    if (campos.salarioMin !== undefined) definir("salarioMin", campos.salarioMin ?? null);
    if (campos.salarioMax !== undefined) definir("salarioMax", campos.salarioMax ?? null);
  }
  if (!partes.length) return atual;

  definir("atualizadoEm", agora());
  valores.push(id);
  banco().prepare(`UPDATE vagas SET ${partes.join(", ")} WHERE id = ?`).run(...valores);
  return obter(id);
}

export function mudarStatus(id: string, status: StatusVaga): Vaga | null {
  const { changes } = banco().prepare("UPDATE vagas SET status = ?, atualizadoEm = ? WHERE id = ?").run(status, agora(), id);
  return Number(changes) > 0 ? obter(id) : null;
}

/** Apaga a vaga, as entrevistas dela e as falas dessas entrevistas, na mesma transação. O parecer de
 * cada entrevista continua em `resultados` (lib/historico.ts): ele tem conexão própria e nunca é
 * tocado de dentro de uma transação daqui. */
export function apagar(id: string): void {
  const d = banco();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM mensagens_entrevista WHERE entrevistaId IN (SELECT id FROM entrevistas WHERE vagaId = ?)").run(id);
    d.prepare("DELETE FROM entrevistas WHERE vagaId = ?").run(id);
    d.prepare("DELETE FROM vagas WHERE id = ?").run(id);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}
