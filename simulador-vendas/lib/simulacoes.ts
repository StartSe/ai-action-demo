// Simulação: o desafio que o gestor monta em cima de um produto, mais o link único que ele manda para
// o time (US-002/US-009). **O link pertence à simulação, nunca à sessão** (D1 do PRD): um link, trinta
// vendedores, trinta sessões independentes.
//
// O endereço público continua sendo /simular/<código> e /api/salas/<código>/* (D13): `proxy.ts` é
// infraestrutura comparada byte a byte nos 17 apps e já lista esses dois prefixos como públicos.
// A entidade se chama Simulação em todo lugar; só o prefixo da URL continua dizendo "salas".
import { agora, banco, gerarCodigo } from "./banco";

export type Metodologia = "spin" | "consultiva" | "personalizada";
export type Dificuldade = "facil" | "realista" | "dificil";
export type ModoPersona = "aleatoria" | "escolhidas";
export type StatusSimulacao = "ativa" | "pausada" | "encerrada";

export type Simulacao = {
  codigo: string;
  produtoId: string;
  nome: string;
  objetivo?: string;
  metodologia: Metodologia;
  /** Só quando `metodologia === "personalizada"`: os critérios escritos pelo gestor (3 a 10). */
  criteriosPersonalizados?: string[];
  dificuldade: Dificuldade;
  modoPersona: ModoPersona;
  /** Ids das personas habilitadas (lib/personas.ts, US-007). */
  personas: string[];
  /** null = sem limite de tentativas. */
  maxTentativas: number | null;
  mostrarFeedback: boolean;
  permiteTexto: boolean;
  permiteVoz: boolean;
  duracaoMin: number;
  status: StatusSimulacao;
  exemplo: boolean;
  criadoEm: string;
};

export type DadosSimulacao = Omit<Simulacao, "codigo" | "criadoEm" | "status" | "exemplo"> & {
  status?: StatusSimulacao;
  exemplo?: boolean;
};

type Linha = {
  codigo: string;
  produtoId: string;
  nome: string;
  objetivo: string | null;
  metodologia: string;
  criteriosPersonalizados: string | null;
  dificuldade: string;
  modoPersona: string;
  personas: string;
  maxTentativas: number | null;
  mostrarFeedback: number;
  permiteTexto: number;
  permiteVoz: number;
  duracaoMin: number;
  status: string;
  exemplo: number;
  criadoEm: string;
};

/** JSON gravado torto nunca derruba a tela: vira lista vazia e a simulação continua abrindo. */
function lerLista(valor: string | null): string[] {
  if (!valor) return [];
  try {
    const lido: unknown = JSON.parse(valor);
    return Array.isArray(lido) ? lido.filter((i): i is string => typeof i === "string") : [];
  } catch (err) {
    console.error("Lista mal formada em uma simulação; tratando como vazia.", err);
    return [];
  }
}

function umDe<T extends string>(valor: string, aceitos: readonly T[], padrao: T): T {
  return (aceitos as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

function linhaParaSimulacao(l: Linha): Simulacao {
  const criterios = lerLista(l.criteriosPersonalizados);
  return {
    codigo: l.codigo,
    produtoId: l.produtoId,
    nome: l.nome,
    objetivo: l.objetivo ?? undefined,
    metodologia: umDe(l.metodologia, ["spin", "consultiva", "personalizada"] as const, "consultiva"),
    criteriosPersonalizados: criterios.length ? criterios : undefined,
    dificuldade: umDe(l.dificuldade, ["facil", "realista", "dificil"] as const, "realista"),
    modoPersona: umDe(l.modoPersona, ["aleatoria", "escolhidas"] as const, "aleatoria"),
    personas: lerLista(l.personas),
    maxTentativas: l.maxTentativas ?? null,
    mostrarFeedback: l.mostrarFeedback === 1,
    permiteTexto: l.permiteTexto === 1,
    permiteVoz: l.permiteVoz === 1,
    duracaoMin: l.duracaoMin,
    status: umDe(l.status, ["ativa", "pausada", "encerrada"] as const, "ativa"),
    exemplo: l.exemplo === 1,
    criadoEm: l.criadoEm,
  };
}

/** Cria a simulação e devolve o código do link (/simular/<código>). O link não expira (US-011). */
export function criar(dados: DadosSimulacao): Simulacao {
  const codigo = gerarCodigo();
  const criadoEm = agora();
  banco()
    .prepare(
      `INSERT INTO simulacoes
         (codigo, produtoId, nome, objetivo, metodologia, criteriosPersonalizados, dificuldade, modoPersona,
          personas, maxTentativas, mostrarFeedback, permiteTexto, permiteVoz, duracaoMin, status, exemplo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      codigo,
      dados.produtoId,
      dados.nome.trim(),
      dados.objetivo?.trim() || null,
      dados.metodologia,
      dados.criteriosPersonalizados?.length ? JSON.stringify(dados.criteriosPersonalizados) : null,
      dados.dificuldade,
      dados.modoPersona,
      JSON.stringify(dados.personas),
      dados.maxTentativas,
      dados.mostrarFeedback ? 1 : 0,
      dados.permiteTexto ? 1 : 0,
      dados.permiteVoz ? 1 : 0,
      dados.duracaoMin,
      dados.status ?? "ativa",
      dados.exemplo ? 1 : 0,
      criadoEm,
    );
  return { ...dados, codigo, status: dados.status ?? "ativa", exemplo: dados.exemplo ?? false, criadoEm };
}

export function listar({ produtoId, limite = 200 }: { produtoId?: string; limite?: number } = {}): Simulacao[] {
  const d = banco();
  const linhas = (
    produtoId
      ? d.prepare("SELECT * FROM simulacoes WHERE produtoId = ? ORDER BY exemplo ASC, criadoEm DESC LIMIT ?").all(produtoId, limite)
      : d.prepare("SELECT * FROM simulacoes ORDER BY exemplo ASC, criadoEm DESC LIMIT ?").all(limite)
  ) as Linha[];
  return linhas.map(linhaParaSimulacao);
}

export function obter(codigo: string): Simulacao | null {
  const linha = banco().prepare("SELECT * FROM simulacoes WHERE codigo = ?").get(codigo) as Linha | undefined;
  return linha ? linhaParaSimulacao(linha) : null;
}

export function atualizar(codigo: string, campos: Partial<DadosSimulacao>): Simulacao | null {
  const atual = obter(codigo);
  if (!atual) return null;

  const partes: string[] = [];
  const valores: (string | number | null)[] = [];
  const definir = (coluna: string, valor: string | number | null) => {
    partes.push(`${coluna} = ?`);
    valores.push(valor);
  };

  if (campos.produtoId !== undefined) definir("produtoId", campos.produtoId);
  if (campos.nome !== undefined) definir("nome", campos.nome.trim());
  if (campos.objetivo !== undefined) definir("objetivo", campos.objetivo?.trim() || null);
  if (campos.metodologia !== undefined) definir("metodologia", campos.metodologia);
  if (campos.criteriosPersonalizados !== undefined)
    definir("criteriosPersonalizados", campos.criteriosPersonalizados?.length ? JSON.stringify(campos.criteriosPersonalizados) : null);
  if (campos.dificuldade !== undefined) definir("dificuldade", campos.dificuldade);
  if (campos.modoPersona !== undefined) definir("modoPersona", campos.modoPersona);
  if (campos.personas !== undefined) definir("personas", JSON.stringify(campos.personas));
  if (campos.maxTentativas !== undefined) definir("maxTentativas", campos.maxTentativas);
  if (campos.mostrarFeedback !== undefined) definir("mostrarFeedback", campos.mostrarFeedback ? 1 : 0);
  if (campos.permiteTexto !== undefined) definir("permiteTexto", campos.permiteTexto ? 1 : 0);
  if (campos.permiteVoz !== undefined) definir("permiteVoz", campos.permiteVoz ? 1 : 0);
  if (campos.duracaoMin !== undefined) definir("duracaoMin", campos.duracaoMin);
  if (campos.status !== undefined) definir("status", campos.status);
  if (!partes.length) return atual;

  valores.push(codigo);
  banco().prepare(`UPDATE simulacoes SET ${partes.join(", ")} WHERE codigo = ?`).run(...valores);
  return obter(codigo);
}

export function mudarStatus(codigo: string, status: StatusSimulacao): Simulacao | null {
  return atualizar(codigo, { status });
}

/** Apaga a simulação e as sessões dela (com as mensagens). Os resultados no histórico continuam. */
export function apagar(codigo: string): void {
  const d = banco();
  d.prepare("DELETE FROM mensagens_sessao WHERE sessaoId IN (SELECT id FROM sessoes WHERE simulacaoCodigo = ?)").run(codigo);
  d.prepare("DELETE FROM sessoes WHERE simulacaoCodigo = ?").run(codigo);
  d.prepare("DELETE FROM simulacoes WHERE codigo = ?").run(codigo);
}

/** Quantas simulações dependem de cada produto — o aviso antes de apagar um produto (US-003). */
export function contarPorProduto(produtoId: string): { total: number; ativas: number } {
  const linha = banco()
    .prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ativa' THEN 1 ELSE 0 END) AS ativas FROM simulacoes WHERE produtoId = ?")
    .get(produtoId) as { total: number; ativas: number | null } | undefined;
  return { total: linha?.total ?? 0, ativas: linha?.ativas ?? 0 };
}
