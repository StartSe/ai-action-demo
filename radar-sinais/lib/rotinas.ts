// Rotinas locais: executam e salvam análises sem entrega externa, inclusive agendas legadas.
import { monitoramentoDevido, TIPO_MONITORAMENTO, type Monitoramento } from "./monitoramento";
import { obterRadar, atualizarPesquisa } from "./radares";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
type Canal = "interno" | "email" | "slack"; // valores legados continuam legíveis; nenhuma entrega externa.
import { getAllConfig, getConfig, mascarar, setConfig } from "./store";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS rotinas (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    frequencia TEXT NOT NULL,
    hora TEXT NOT NULL,
    diaSemana INTEGER NULL,
    diaMes INTEGER NULL,
    dataUnica TEXT NULL,
    canal TEXT NOT NULL,
    destino TEXT NULL,
    parametros TEXT NOT NULL,
    ativa INTEGER NOT NULL DEFAULT 1,
    ultimaExecucao TEXT NULL,
    criadoEm TEXT NOT NULL
  )`);
  // Bancos criados antes da US-023 não têm estas colunas; ALTER TABLE falha silenciosamente quando já existem.
  try { db.exec(`ALTER TABLE rotinas ADD COLUMN ultimaFalha TEXT NULL`); } catch { /* coluna já existe */ }
  try { db.exec(`ALTER TABLE rotinas ADD COLUMN falhasSeguidas INTEGER NOT NULL DEFAULT 0`); } catch { /* coluna já existe */ }
  db.exec(`CREATE TABLE IF NOT EXISTS rotina_locks (id TEXT PRIMARY KEY, ate INTEGER NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS radar_execucoes (
    id TEXT PRIMARY KEY, rotinaId TEXT NOT NULL, radarId TEXT, origem TEXT NOT NULL,
    estado TEXT NOT NULL, iniciadaEm TEXT NOT NULL, encerradaEm TEXT, resultadoId TEXT, mensagem TEXT
  ); CREATE INDEX IF NOT EXISTS execucoes_radar ON radar_execucoes(radarId, iniciadaEm);
  CREATE UNIQUE INDEX IF NOT EXISTS execucao_ativa ON radar_execucoes(rotinaId) WHERE estado IN ('pendente','executando')`);
  return db;
}

export type Frequencia = "diaria" | "semanal" | "mensal" | "unica";

export type Rotina<P = unknown> = {
  id: string;
  tipo: string;
  frequencia: Frequencia;
  /** "HH:MM", horário do servidor nas rotinas legadas; monitoramentos usam horarios/fuso nos parâmetros. */
  hora: string;
  /** 0 (domingo) a 6 (sábado); só para frequencia "semanal". */
  diaSemana: number | null;
  /** 1 a 31; só para frequencia "mensal" (dias além do fim do mês caem no último dia). */
  diaMes: number | null;
  /** "AAAA-MM-DD"; só para frequencia "unica". */
  dataUnica: string | null;
  canal: Canal;
  destino: string | null;
  parametros: P;
  ativa: boolean;
  ultimaExecucao: string | null;
  /** Motivo da última falha (ex.: canal de notificação não configurado); null quando a última execução deu certo ou a rotina nunca rodou. */
  ultimaFalha: string | null;
  /** Falhas seguidas desde o último sucesso; ao chegar a 3, a rotina é pausada automaticamente. */
  falhasSeguidas: number;
  criadoEm: string;
};

type Linha = {
  id: string; tipo: string; frequencia: string; hora: string;
  diaSemana: number | null; diaMes: number | null; dataUnica: string | null;
  canal: string; destino: string | null; parametros: string;
  ativa: number; ultimaExecucao: string | null; ultimaFalha: string | null; falhasSeguidas: number; criadoEm: string;
};

function linhaParaRotina<P>(l: Linha): Rotina<P> {
  return {
    id: l.id,
    tipo: l.tipo,
    frequencia: l.frequencia as Frequencia,
    hora: l.hora,
    diaSemana: l.diaSemana,
    diaMes: l.diaMes,
    dataUnica: l.dataUnica,
    canal: l.canal as Canal,
    destino: l.destino,
    parametros: JSON.parse(l.parametros),
    ativa: Boolean(l.ativa),
    ultimaExecucao: l.ultimaExecucao,
    ultimaFalha: l.ultimaFalha,
    falhasSeguidas: l.falhasSeguidas,
    criadoEm: l.criadoEm,
  };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export function criar({ tipo, frequencia, hora, diaSemana, diaMes, dataUnica, canal, destino, parametros }: {
  tipo: string; frequencia: Frequencia; hora: string;
  diaSemana?: number; diaMes?: number; dataUnica?: string;
  canal: Canal; destino?: string; parametros?: unknown;
}): string {
  const id = gerarId();
  abrir()
    .prepare(
      `INSERT INTO rotinas (id, tipo, frequencia, hora, diaSemana, diaMes, dataUnica, canal, destino, parametros, ativa, ultimaExecucao, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)`
    )
    .run(id, tipo, frequencia, hora, diaSemana ?? null, diaMes ?? null, dataUnica ?? null, canal, destino ?? null, JSON.stringify(parametros ?? {}), new Date().toISOString());
  return id;
}

export function atualizarMonitoramento(id: string, parametros: Monitoramento): void {
  abrir().prepare("UPDATE rotinas SET parametros = ?, hora = ? WHERE id = ?").run(JSON.stringify(parametros), parametros.horarios[0], id);
}

export function listar<P = unknown>(): Rotina<P>[] {
  const linhas = abrir().prepare("SELECT * FROM rotinas ORDER BY criadoEm DESC").all() as Linha[];
  return linhas.map((l) => linhaParaRotina<P>(l));
}

export function obter<P = unknown>(id: string): Rotina<P> | null {
  const linha = abrir().prepare("SELECT * FROM rotinas WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaRotina<P>(linha) : null;
}

/** Ativa ou pausa uma rotina (o agendador ignora rotinas pausadas). */
export function pausar(id: string, ativa: boolean): void {
  if (ativa) {
    const r = obter<Monitoramento>(id);
    if (r?.tipo === TIPO_MONITORAMENTO && r.parametros.radarId) { const cadastro = obterRadar(r.parametros.radarId); if (cadastro.pesquisa.acompanhamento === false) atualizarPesquisa(cadastro.id, { ...cadastro.pesquisa, acompanhamento: true }); }
  }
  abrir().prepare("UPDATE rotinas SET ativa = ? WHERE id = ?").run(ativa ? 1 : 0, id);
}

export function apagar(id: string): void {
  const r = obter<Monitoramento>(id);
  if (r?.tipo === TIPO_MONITORAMENTO && r.parametros.radarId) { const radar = obterRadar(r.parametros.radarId); atualizarPesquisa(radar.id, { ...radar.pesquisa, acompanhamento: false }); }
  abrir().prepare("DELETE FROM rotinas WHERE id = ?").run(id);
}

/** Execução bem-sucedida (ou sem nada a avisar): limpa a sequência de falhas. */
function marcarSucesso(id: string, quando: string): void {
  abrir().prepare("UPDATE rotinas SET ultimaExecucao = ?, ultimaFalha = NULL, falhasSeguidas = 0 WHERE id = ?").run(quando, id);
}

/** Execução falhou: registra o motivo e, na 3ª falha seguida, pausa a rotina (o agendador ignora rotinas pausadas). */
function marcarFalha(id: string, quando: string, motivo: string): void {
  const linha = abrir().prepare("SELECT falhasSeguidas FROM rotinas WHERE id = ?").get(id) as { falhasSeguidas: number } | undefined;
  const falhasSeguidas = (linha?.falhasSeguidas ?? 0) + 1;
  abrir().prepare("UPDATE rotinas SET ultimaExecucao = ?, ultimaFalha = ?, falhasSeguidas = ? WHERE id = ?").run(quando, motivo, falhasSeguidas, id);
  if (falhasSeguidas >= 3) pausar(id, false);
}

/** Tipo de rotina disponível para um app criar (ver lib/rotinas-do-app.ts, arquivo próprio de cada app, para a lista real). */
export type TipoRotina<P = unknown> = {
  tipo: string;
  rotulo: string;
  cadastroProprio?: boolean;
  /** Confere os parâmetros específicos desta rotina (ex.: temas, empresa) antes de criar; devolve a mensagem de erro, ou undefined quando pode criar. */
  validar?: (parametros: P, config: Record<string, string | undefined>) => string | undefined;
};

/** Roda o `validar` do tipo escolhido (quando existe) contra os parâmetros recebidos. */
export function validarParametrosTipo(tipo: string, parametros: unknown, tipos: TipoRotina[]): string | undefined {
  const def = tipos.find((t) => t.tipo === tipo);
  return def?.validar ? def.validar(parametros, getAllConfig()) : undefined;
}

/** O que um `tipo` de rotina devolve ao rodar; vira a notificação enviada (titulo, texto e, quando houver, o link /r/<resultadoId>). enviar: false (ex.: uma rotina de alerta que só deve falar quando algo mudou) pula o envio desta execução, sem deixar de marcar a rotina como executada. */
export type ResultadoRotina = { titulo: string; texto: string; resultadoId?: string; enviar?: boolean };
export type ExecutorRotina = (rotina: Rotina) => Promise<ResultadoRotina>;

const executores = new Map<string, ExecutorRotina>();

/** Cada app registra aqui o que cada `tipo` de rotina faz (ver lib/rotinas-do-app.ts, arquivo próprio do app). */
export function registrarExecutor(tipo: string, fn: ExecutorRotina): void {
  executores.set(tipo, fn);
}

/** Horário mais recente (hora local do servidor) em que a rotina deveria ter rodado até agora, ou null se a vez dela ainda não chegou. */
function ultimoHorarioDevido(r: Pick<Rotina, "frequencia" | "hora" | "diaSemana" | "diaMes" | "dataUnica">, agora: Date): Date | null {
  const [h, m] = r.hora.split(":").map(Number);

  if (r.frequencia === "unica") {
    if (!r.dataUnica) return null;
    const alvo = new Date(`${r.dataUnica}T00:00:00`);
    alvo.setHours(h, m, 0, 0);
    return alvo <= agora ? alvo : null;
  }

  if (r.frequencia === "diaria") {
    const alvo = new Date(agora);
    alvo.setHours(h, m, 0, 0);
    if (alvo > agora) alvo.setDate(alvo.getDate() - 1);
    return alvo;
  }

  if (r.frequencia === "semanal") {
    const diaSemana = r.diaSemana ?? 0;
    const alvo = new Date(agora);
    alvo.setHours(h, m, 0, 0);
    const diff = (alvo.getDay() - diaSemana + 7) % 7;
    alvo.setDate(alvo.getDate() - diff);
    if (alvo > agora) alvo.setDate(alvo.getDate() - 7);
    return alvo;
  }

  // mensal
  const diaMes = r.diaMes ?? 1;
  const ultimoDiaMesAtual = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const alvo = new Date(agora.getFullYear(), agora.getMonth(), Math.min(diaMes, ultimoDiaMesAtual), h, m, 0, 0);
  if (alvo <= agora) return alvo;
  const ultimoDiaMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0).getDate();
  return new Date(agora.getFullYear(), agora.getMonth() - 1, Math.min(diaMes, ultimoDiaMesAnterior), h, m, 0, 0);
}

function devida(r: Rotina, agora: Date): boolean {
  if (!r.ativa) return false;
  if (r.tipo === TIPO_MONITORAMENTO) return monitoramentoDevido(r.parametros as Monitoramento, r.ultimaExecucao, r.criadoEm, agora);
  const alvo = ultimoHorarioDevido(r, agora);
  if (!alvo) return false;
  if (!r.ultimaExecucao) return true;
  return new Date(r.ultimaExecucao) < alvo;
}

export type ExecucaoRadar = { id: string; rotinaId: string; radarId: string | null; origem: "manual" | "agenda"; estado: "pendente" | "executando" | "sucesso" | "falha" | "interrompida"; iniciadaEm: string; encerradaEm: string | null; resultadoId: string | null; mensagem: string | null };
function recuperarInterrompidas() {
  abrir().prepare("UPDATE radar_execucoes SET estado = 'interrompida', encerradaEm = ?, mensagem = 'O servidor interrompeu esta rodada. Uma nova tentativa será feita no próximo horário.' WHERE estado = 'executando' AND rotinaId NOT IN (SELECT id FROM rotina_locks WHERE ate >= ?)").run(new Date().toISOString(), Date.now());
}
export function historicoExecucoes(radarId: string): ExecucaoRadar[] {
  recuperarInterrompidas();
  return abrir().prepare("SELECT * FROM radar_execucoes WHERE radarId = ? ORDER BY iniciadaEm DESC, rowid DESC LIMIT 50").all(radarId) as ExecucaoRadar[];
}
export function enfileirarRotina(id: string, origem: "manual" | "agenda" = "manual"): string | null {
  const r = obter<{ radarId?: string }>(id);
  if (!r) return null;
  recuperarInterrompidas();
  const existente = abrir().prepare("SELECT id FROM radar_execucoes WHERE rotinaId = ? AND estado IN ('pendente','executando')").get(id) as { id: string } | undefined;
  if (existente) return existente.id;
  const execucaoId = gerarId();
  abrir().prepare("INSERT OR IGNORE INTO radar_execucoes (id, rotinaId, radarId, origem, estado, iniciadaEm) VALUES (?, ?, ?, ?, 'pendente', ?)").run(execucaoId, id, r.parametros?.radarId || null, origem, new Date().toISOString());
  return (abrir().prepare("SELECT id FROM radar_execucoes WHERE rotinaId = ? AND estado IN ('pendente','executando')").get(id) as { id: string }).id;
}
async function executar(r: Rotina, origem: "manual" | "agenda" = "manual"): Promise<{ id: string; ok: boolean; mensagem: string }> {
  const execucaoId = enfileirarRotina(r.id, origem)!;
  const lock = abrir().prepare(`INSERT INTO rotina_locks (id, ate) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET ate = excluded.ate WHERE rotina_locks.ate < ?`).run(r.id, Date.now() + 30 * 60_000, Date.now());
  if (!lock.changes) return { id: r.id, ok: false, mensagem: "Esta rotina já está em execução." };
  const agora = new Date().toISOString();
  abrir().prepare("UPDATE radar_execucoes SET estado = 'executando', iniciadaEm = ? WHERE id = ?").run(agora, execucaoId);
  const finalizar = (estado: string, mensagem: string, resultadoId?: string) => abrir().prepare("UPDATE radar_execucoes SET estado = ?, encerradaEm = ?, mensagem = ?, resultadoId = ? WHERE id = ?").run(estado, new Date().toISOString(), mensagem, resultadoId || null, execucaoId);
  // Renova o lease enquanto este processo está trabalhando, inclusive em consultas demoradas.
  const heartbeat = setInterval(() => abrir().prepare("UPDATE rotina_locks SET ate = ? WHERE id = ?").run(Date.now() + 30 * 60_000, r.id), 60_000);
  try {
    const executor = executores.get(r.tipo);
    if (!executor) throw new Error(`Nenhuma ação registrada para o tipo "${r.tipo}".`);
    const resultado = await executor(r);
    marcarSucesso(r.id, agora);
    const mensagem = "Análise salva no histórico deste radar.";
    finalizar("sucesso", mensagem, resultado.resultadoId);
    return { id: r.id, ok: true, mensagem };
  } catch (err) {
    console.error(`Falha ao executar a rotina "${r.tipo}":`, err);
    const mensagem = err instanceof Error && err.message ? err.message : "Não foi possível concluir esta rodada.";
    marcarFalha(r.id, agora, mensagem); finalizar("falha", mensagem);
    return { id: r.id, ok: false, mensagem };
  } finally { clearInterval(heartbeat); abrir().prepare("DELETE FROM rotina_locks WHERE id = ?").run(r.id); }
}
export async function executarFila() {
  const fila = abrir().prepare("SELECT id, rotinaId FROM radar_execucoes WHERE estado = 'pendente' ORDER BY iniciadaEm").all() as { id: string; rotinaId: string }[];
  for (const job of fila) {
    if (!abrir().prepare("SELECT 1 FROM radar_execucoes WHERE id = ? AND estado = 'pendente'").get(job.id)) continue;
    const r = obter(job.rotinaId);
    if (r) await executar(r);
    else abrir().prepare("UPDATE radar_execucoes SET estado = 'interrompida', encerradaEm = ?, mensagem = 'Agenda removida.' WHERE rotinaId = ? AND estado = 'pendente'").run(new Date().toISOString(), job.rotinaId);
  }
}

/** Executa todas as rotinas ativas cuja vez já chegou. Chamada pelo executor de 60s (instrumentation.ts) e pelo gatilho externo (POST /api/rotinas/executar). */
export async function executarVencidas(agora = new Date()): Promise<{ id: string; ok: boolean; mensagem: string }[]> {
  await executarFila();
  const vencidas = listar().filter((r) => devida(r, agora));
  const resultados: { id: string; ok: boolean; mensagem: string }[] = [];
  for (const r of vencidas) {
    const atual = obter(r.id);
    if (atual && devida(atual, agora)) resultados.push(await executar(atual, "agenda"));
  }
  return resultados;
}

/** Executa uma rotina agora, ignorando o agendamento ("Executar agora" no cartão de /setup). */
export async function executarAgora(id: string): Promise<{ id: string; ok: boolean; mensagem: string } | null> {
  const r = obter(id);
  if (!r) return null;
  return executar(r);
}

const CHAVE_CODIGO = "ROTINAS_CODIGO_ACESSO";

export function codigoAtivo(): string | undefined {
  return getConfig(CHAVE_CODIGO);
}

export function codigoMascarado(): string | null {
  return mascarar(codigoAtivo());
}

/** Gera um novo código de acesso do gatilho externo e invalida o anterior. */
export function gerarCodigo(): string {
  const codigo = crypto.randomBytes(32).toString("base64url");
  setConfig(CHAVE_CODIGO, codigo);
  return codigo;
}

export function revogarCodigo(): void {
  setConfig(CHAVE_CODIGO, null);
}

function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Extrai o código do cabeçalho Authorization: Bearer <código>, ou null se ausente. */
export function extrairCodigo(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const recebido = auth.slice(7).trim();
  return recebido || null;
}

export function autenticar(codigoRecebido: string | null): boolean {
  const ativo = codigoAtivo();
  if (!ativo || !codigoRecebido) return false;
  return compararSeguro(codigoRecebido, ativo);
}
