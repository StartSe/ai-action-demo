// Vaga: o que o gestor abre uma vez e para onde manda quantos candidatos quiser (US-002/US-005).
//
// Antes desta história uma "vaga" era só o título digitado no formulário, e agrupar candidatos
// dependia de todo mundo escrever o mesmo texto. Agora ela tem id, e é dela que a entrevistadora tira
// o que perguntar (requisitos, desafios, competências culturais) e o que avaliar.
import { agora, banco, gerarId } from "./banco";
import { moeda, numero } from "./formato";
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

/**
 * Os campos que tela e rota podem escrever. `id`, datas e `exemplo` ficam de fora de propósito.
 *
 * Senioridade, modelo e a faixa salarial aceitam `null` além de `undefined`, e a diferença importa em
 * `atualizar`: `undefined` é "não mexa nisso", `null` é "apague o que estava lá". Sem os dois, uma
 * vaga que nasceu "pleno" nunca mais poderia voltar a não dizer a senioridade.
 */
export type CamposVaga = Partial<Omit<Vaga, "id" | "criadoEm" | "atualizadoEm" | "exemplo" | "status" | "senioridade" | "modelo" | "salarioMin" | "salarioMax">> & {
  senioridade?: Senioridade | null;
  modelo?: ModeloTrabalho | null;
  salarioMin?: number | null;
  salarioMax?: number | null;
};

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

/** Os status de quem foi convidado e ainda não começou a conversar: é o que encerrar a vaga cancela. */
const CONVITES_PENDENTES = "status IN ('convidada', 'aberta')";

/** Quantos convites desta vaga ainda esperam o candidato. A tela pergunta antes de encerrar ("2
 * convites ainda não respondidos serão cancelados"), então o número precisa vir do mesmo lugar que
 * o cancelamento usa — senão a confirmação promete um número e o banco faz outro. */
export function contarConvitesPendentes(id: string): number {
  const linha = banco()
    .prepare(`SELECT COUNT(*) AS total FROM entrevistas WHERE vagaId = ? AND ${CONVITES_PENDENTES}`)
    .get(id) as { total: number };
  return Number(linha.total);
}

/**
 * Encerra a vaga e cancela os convites que ainda esperavam o candidato (US-007).
 *
 * Quem já está conversando, já concluiu ou já foi avaliado fica como está: encerrar a vaga é parar de
 * receber gente nova, não apagar o que aconteceu. A regra mora aqui, e não na rota, para valer igual
 * para a tela, para o assistente (MCP) e para qualquer porta que venha depois.
 */
export function encerrar(id: string): { vaga: Vaga | null; convitesCancelados: number } {
  const d = banco();
  const convitesCancelados = contarConvitesPendentes(id);
  d.exec("BEGIN");
  try {
    d.prepare(`UPDATE entrevistas SET status = 'cancelada' WHERE vagaId = ? AND ${CONVITES_PENDENTES}`).run(id);
    d.prepare("UPDATE vagas SET status = 'encerrada', atualizadoEm = ? WHERE id = ?").run(agora(), id);
    d.exec("COMMIT");
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
  return { vaga: obter(id), convitesCancelados };
}

/** Reabre a vaga. Os convites cancelados ao encerrar **não** voltam: o candidato precisa de um link
 * novo, e ressuscitar um convite que já foi dado como cancelado seria pior que reconvidar. */
export function reabrir(id: string): Vaga | null {
  return mudarStatus(id, "aberta");
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

// ---------------------------------------------------------------------------------------------
// Validação do que uma PESSOA digitou (US-005)
// ---------------------------------------------------------------------------------------------
//
// Mesma separação já adotada na cultura da empresa (lib/cultura.ts): `validarVaga` fala com quem
// preencheu o formulário e RECUSA o que está fora (`{ ok: false, erro }` → 400 com a frase pronta),
// enquanto `criar`/`atualizar` CORTAM em silêncio o que vem da IA ou do assistente (`limitar`). Uma
// pessoa que digitou 40 perguntas precisa saber que o limite é 12; um modelo que devolveu 40 só
// precisa que o número entre certo no banco.

export const LIMITE_CARGO = 80;
export const LIMITE_AREA = 60;
export const LIMITE_LOCAL = 80;
export const LIMITE_DESAFIOS = 1500;
export const LIMITE_REQUISITOS = 3000;
export const LIMITE_NOME_COMPETENCIA = 40;
export const LIMITE_DESCRICAO_COMPETENCIA = 200;
export const MAX_COMPETENCIAS = 10;
/** Teto de sanidade da faixa salarial: acima disso é dedo escorregado no zero, não proposta. */
export const SALARIO_TETO = 1_000_000;

export type ValidacaoVaga = { ok: true; campos: CamposVaga & { cargo: string } } | { ok: false; erro: string };

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Uma linha só: quebras viram espaço, para um cargo colado de um anúncio não virar parágrafo. */
function umaLinha(valor: unknown): string {
  return texto(valor).replace(/\s+/g, " ");
}

function encurtar(valor: string, limite: number): string {
  return valor.length > limite ? `${valor.slice(0, limite - 1).trimEnd()}…` : valor;
}

/** Id derivado do nome, sem acento: é o que faz "Cliente no centro" ser a MESMA competência vinda da
 * tela, do assistente ou de uma descrição lida pela IA. Vazio quando não sobra nenhuma letra. */
function chave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Aceita o número (do assistente) e o texto com máscara de milhar (da tela). Vazio é "não informado". */
function lerSalario(valor: unknown): number | null | "invalido" {
  if (valor === null || valor === undefined || valor === "") return null;
  const bruto = typeof valor === "number" ? valor : Number(texto(valor).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(bruto) || bruto < 0) return "invalido";
  return Math.round(bruto);
}

function lerCompetenciasDigitadas(bruto: unknown): CompetenciaCultural[] | { erro: string } {
  if (!Array.isArray(bruto)) return [];
  const lista: CompetenciaCultural[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const registro = item as Record<string, unknown>;
    const nome = umaLinha(registro.nome);
    const descricao = umaLinha(registro.descricao);
    if (!nome && !descricao) continue;
    if (!nome) return { erro: "Dê um nome curto a cada competência, ou apague a linha em branco." };
    if (nome.length > LIMITE_NOME_COMPETENCIA) {
      return { erro: `O nome de uma competência pode ter até ${LIMITE_NOME_COMPETENCIA} caracteres. Encurte "${encurtar(nome, 24)}".` };
    }
    if (descricao.length > LIMITE_DESCRICAO_COMPETENCIA) {
      return { erro: `A frase de "${nome}" pode ter até ${LIMITE_DESCRICAO_COMPETENCIA} caracteres. Deixe uma frase só.` };
    }
    const id = texto(registro.id) || chave(nome);
    lista.push({ id: id || `competencia-${lista.length + 1}`, nome, descricao, origem: registro.origem === "vaga" ? "vaga" : "empresa" });
  }
  if (lista.length > MAX_COMPETENCIAS) {
    return { erro: `São ${MAX_COMPETENCIAS} competências no máximo: mais do que isso e nenhuma delas pesa na avaliação.` };
  }
  return lista;
}

/**
 * Lê o corpo que a tela (ou o assistente) mandou e devolve os campos prontos para `criar`/`atualizar`,
 * ou a primeira frase que a pessoa precisa ler para corrigir. Nunca lança.
 */
export function validarVaga(bruto: unknown): ValidacaoVaga {
  const dados = (bruto ?? {}) as Record<string, unknown>;

  const cargo = umaLinha(dados.cargo);
  if (!cargo) return { ok: false, erro: "Diga qual é o cargo da vaga para continuar." };
  if (cargo.length > LIMITE_CARGO) return { ok: false, erro: `O cargo pode ter até ${LIMITE_CARGO} caracteres. Encurte "${encurtar(cargo, 24)}".` };

  const area = umaLinha(dados.area);
  if (area.length > LIMITE_AREA) return { ok: false, erro: `A área pode ter até ${LIMITE_AREA} caracteres.` };
  const local = umaLinha(dados.local);
  if (local.length > LIMITE_LOCAL) return { ok: false, erro: `O local pode ter até ${LIMITE_LOCAL} caracteres.` };

  // Um requisito por linha, como o gestor digita: as linhas em branco do meio do texto somem aqui, e
  // não na tela, para o assistente e o formulário gravarem a mesma coisa.
  const requisitos = texto(dados.requisitos)
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean)
    .join("\n");
  if (!requisitos) return { ok: false, erro: "Liste ao menos um requisito da vaga, um por linha." };
  if (requisitos.length > LIMITE_REQUISITOS) {
    return { ok: false, erro: `Os requisitos podem ter até ${numero(LIMITE_REQUISITOS)} caracteres ao todo. Deixe só o que é eliminatório.` };
  }

  const desafios = texto(dados.desafios);
  if (desafios.length > LIMITE_DESAFIOS) {
    return { ok: false, erro: `Os desafios dos primeiros meses podem ter até ${numero(LIMITE_DESAFIOS)} caracteres.` };
  }

  const salarioACombinar = Boolean(dados.salarioACombinar);
  const min = lerSalario(dados.salarioMin);
  const max = lerSalario(dados.salarioMax);
  if (min === "invalido" || max === "invalido") return { ok: false, erro: "Escreva a faixa salarial só com números, sem centavos." };
  if (!salarioACombinar) {
    if ((min ?? 0) > SALARIO_TETO || (max ?? 0) > SALARIO_TETO) {
      return { ok: false, erro: `A faixa salarial vai até ${moeda(SALARIO_TETO)}. Confira os zeros.` };
    }
    if (min !== null && max !== null && min > max) {
      return { ok: false, erro: "O salário mínimo não pode ser maior que o máximo." };
    }
  }

  const perguntas = dados.numeroPerguntas === undefined ? undefined : Number(dados.numeroPerguntas);
  if (perguntas !== undefined && (!Number.isFinite(perguntas) || perguntas < PERGUNTAS_MIN || perguntas > PERGUNTAS_MAX)) {
    return { ok: false, erro: `A entrevista pode ter de ${PERGUNTAS_MIN} a ${PERGUNTAS_MAX} perguntas.` };
  }
  const duracao = dados.duracaoMin === undefined ? undefined : Number(dados.duracaoMin);
  if (duracao !== undefined && (!Number.isFinite(duracao) || duracao < DURACAO_MIN || duracao > DURACAO_MAX)) {
    return { ok: false, erro: `A duração estimada pode ser de ${DURACAO_MIN} a ${DURACAO_MAX} minutos.` };
  }

  const competencias = lerCompetenciasDigitadas(dados.competenciasCulturais);
  if (!Array.isArray(competencias)) return { ok: false, erro: competencias.erro };

  return {
    ok: true,
    campos: {
      cargo,
      // Texto em branco e `null` são "apague o que estava aqui", nunca "mantenha": quem edita uma vaga
      // para tirar a área precisa conseguir tirá-la.
      area,
      senioridade: SENIORIDADES.includes(dados.senioridade as Senioridade) ? (dados.senioridade as Senioridade) : null,
      modelo: MODELOS.includes(dados.modelo as ModeloTrabalho) ? (dados.modelo as ModeloTrabalho) : null,
      local,
      salarioACombinar,
      salarioMin: salarioACombinar ? null : min,
      salarioMax: salarioACombinar ? null : max,
      desafios,
      requisitos,
      competenciasCulturais: competencias,
      tom: dados.tom === "objetivo" ? "objetivo" : "acolhedor",
      numeroPerguntas: perguntas ?? 8,
      duracaoMin: duracao ?? 15,
      perguntaPretensao: dados.perguntaPretensao !== false,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// A vaga inferida de uma descrição colada (US-006)
// ---------------------------------------------------------------------------------------------
//
// Aqui o excesso é CORTADO e o que falta vira `null`, nunca um erro: o outro lado desta função é um
// modelo lendo um anúncio de vaga, e o resultado só preenche o formulário — quem salva (e passa por
// `validarVaga`) é o gestor, depois de revisar. Um campo que a descrição não trazia tem de voltar
// vazio: uma senioridade inventada é pior que uma senioridade em branco, porque ninguém revisa o que
// parece certo.

/** Tudo opcional: `null` é "não estava na descrição". */
export type VagaEstruturada = {
  cargo: string | null;
  area: string | null;
  senioridade: Senioridade | null;
  modelo: ModeloTrabalho | null;
  local: string | null;
  salarioMin: number | null;
  salarioMax: number | null;
  salarioACombinar: boolean;
  desafios: string | null;
  requisitos: string | null;
  competenciasCulturais: CompetenciaCultural[];
};

/** Só o que `normalizarVagaEstruturada` precisa saber sobre a cultura da empresa (lib/cultura.ts). */
export type ValorDaEmpresa = { id: string; nome: string; descricao: string };

function ouNulo(valor: string, limite: number): string | null {
  return valor ? encurtar(valor, limite) : null;
}

/** Faixa vinda da IA: o que não é um número plausível volta vazio, em vez de virar erro na tela. */
function salarioDaIA(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const bruto = typeof valor === "number" ? valor : Number(texto(valor).replace(/[^\d]/g, ""));
  if (!Number.isFinite(bruto) || bruto <= 0 || bruto > SALARIO_TETO) return null;
  return Math.round(bruto);
}

/** Lista que o modelo tanto manda como array quanto como um texto de várias linhas; marcador de lista some. */
function linhasDaIA(valor: unknown, limite: number, separador = "\n"): string | null {
  const itens = Array.isArray(valor) ? valor.map((v) => umaLinha(v)) : texto(valor).split("\n");
  const junto = itens
    .map((linha) => linha.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .join(separador);
  return ouNulo(junto, limite);
}

/**
 * As competências sugeridas, cruzadas com a cultura da empresa: o que o modelo reconheceu como um
 * valor da casa volta com o id, o nome e a frase DA EMPRESA (o texto da cultura é o que vale, não a
 * paráfrase do modelo); o que só existe nesta descrição volta como competência da vaga.
 */
function competenciasSugeridas(bruto: unknown, daEmpresa: ValorDaEmpresa[]): CompetenciaCultural[] {
  if (!Array.isArray(bruto)) return [];
  const porId = new Map(daEmpresa.map((v) => [v.id, v]));
  const porNome = new Map(daEmpresa.map((v) => [chave(v.nome), v]));
  const lista: CompetenciaCultural[] = [];
  for (const item of bruto) {
    const registro = (item && typeof item === "object" ? item : { nome: item }) as Record<string, unknown>;
    const nome = umaLinha(registro.nome);
    const daCasa = porId.get(texto(registro.id)) ?? porNome.get(chave(nome));
    const id = daCasa ? daCasa.id : chave(nome);
    if (!id || lista.some((c) => c.id === id)) continue;
    lista.push(
      daCasa
        ? { id: daCasa.id, nome: daCasa.nome, descricao: daCasa.descricao, origem: "empresa" }
        : {
            id,
            nome: encurtar(nome, LIMITE_NOME_COMPETENCIA),
            descricao: encurtar(umaLinha(registro.descricao), LIMITE_DESCRICAO_COMPETENCIA),
            origem: "vaga",
          },
    );
    if (lista.length === MAX_COMPETENCIAS) break;
  }
  return lista;
}

export function normalizarVagaEstruturada(bruto: unknown, daEmpresa: ValorDaEmpresa[] = []): VagaEstruturada {
  const dados = (bruto ?? {}) as Record<string, unknown>;

  const salarioACombinar = dados.salarioACombinar === true;
  const min = salarioACombinar ? null : salarioDaIA(dados.salarioMin);
  const max = salarioACombinar ? null : salarioDaIA(dados.salarioMax);
  // Anúncio escrito ao contrário ("até R$ 7.000, a partir de R$ 5.500") faz o modelo trocar a ordem.
  // Inverter aproveita os dois números que ele leu certo; descartar jogaria fora a faixa inteira.
  const inverter = min !== null && max !== null && min > max;

  return {
    cargo: ouNulo(umaLinha(dados.cargo), LIMITE_CARGO),
    area: ouNulo(umaLinha(dados.area), LIMITE_AREA),
    senioridade: SENIORIDADES.includes(dados.senioridade as Senioridade) ? (dados.senioridade as Senioridade) : null,
    modelo: MODELOS.includes(dados.modelo as ModeloTrabalho) ? (dados.modelo as ModeloTrabalho) : null,
    local: ouNulo(umaLinha(dados.local), LIMITE_LOCAL),
    salarioMin: inverter ? max : min,
    salarioMax: inverter ? min : max,
    salarioACombinar,
    desafios: linhasDaIA(dados.desafios, LIMITE_DESAFIOS, " "),
    requisitos: linhasDaIA(dados.requisitos, LIMITE_REQUISITOS),
    competenciasCulturais: competenciasSugeridas(dados.competenciasCulturais, daEmpresa),
  };
}

/**
 * Quantas vagas já estavam abertas num instante — o primeiro número do Início (US-022 da PRD).
 *
 * O encerramento de uma vaga não tem carimbo próprio (só `status` e `atualizadoEm`), então uma vaga
 * encerrada hoje não conta nem hoje nem na fotografia de trinta dias atrás. O erro é sempre para
 * menos e some assim que a vaga some da tela — inventar uma data de encerramento a partir de
 * `atualizadoEm` seria pior: qualquer edição de texto mudaria o número do mês passado.
 */
export function contarAbertasAte(instante: string): number {
  semearDemonstracao();
  const linha = banco()
    .prepare("SELECT COUNT(*) AS total FROM vagas WHERE status = 'aberta' AND criadoEm <= ?")
    .get(instante) as { total: number };
  return Number(linha.total);
}
