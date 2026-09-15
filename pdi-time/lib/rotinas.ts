// Rotinas: tarefas agendadas (diária/semanal/mensal/única) que o app executa sozinho, entregando o
// resultado por notificação (lib/notificacoes.ts). Usa o mesmo arquivo SQLite de lib/store.ts. Copie
// este arquivo para cada app sem alterar; o que cada `tipo` de rotina faz é registrado por
// lib/rotinas-do-app.ts (arquivo próprio de cada app, não compartilhado).
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { enviar, type Canal } from "./notificacoes";
import { getConfig, mascarar, setConfig } from "./store";

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
  return db;
}

export type Frequencia = "diaria" | "semanal" | "mensal" | "unica";

export type Rotina<P = unknown> = {
  id: string;
  tipo: string;
  frequencia: Frequencia;
  /** "HH:MM", horário do relógio do servidor. */
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
  criadoEm: string;
};

type Linha = {
  id: string; tipo: string; frequencia: string; hora: string;
  diaSemana: number | null; diaMes: number | null; dataUnica: string | null;
  canal: string; destino: string | null; parametros: string;
  ativa: number; ultimaExecucao: string | null; criadoEm: string;
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
  abrir().prepare("UPDATE rotinas SET ativa = ? WHERE id = ?").run(ativa ? 1 : 0, id);
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM rotinas WHERE id = ?").run(id);
}

function marcarExecutada(id: string, quando: string): void {
  abrir().prepare("UPDATE rotinas SET ultimaExecucao = ? WHERE id = ?").run(quando, id);
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
  const alvo = ultimoHorarioDevido(r, agora);
  if (!alvo) return false;
  if (!r.ultimaExecucao) return true;
  return new Date(r.ultimaExecucao) < alvo;
}

async function executar(r: Rotina): Promise<{ id: string; ok: boolean; mensagem: string }> {
  const executor = executores.get(r.tipo);
  if (!executor) return { id: r.id, ok: false, mensagem: `Nenhuma ação registrada para o tipo "${r.tipo}".` };
  try {
    const resultado = await executor(r);
    marcarExecutada(r.id, new Date().toISOString());
    if (resultado.enviar === false) return { id: r.id, ok: true, mensagem: "Nada para avisar desta vez." };
    const base = getConfig("APP_URL") || "http://localhost:3000";
    const envio = await enviar({
      canal: r.canal,
      destino: r.destino ?? undefined,
      titulo: resultado.titulo,
      texto: resultado.texto,
      link: resultado.resultadoId ? `${base}/r/${resultado.resultadoId}` : undefined,
    });
    return { id: r.id, ok: envio.ok, mensagem: envio.mensagem };
  } catch (err) {
    marcarExecutada(r.id, new Date().toISOString());
    console.error(`Falha ao executar a rotina "${r.tipo}":`, err);
    const mensagem = err instanceof Error && err.message ? err.message : "Não foi possível concluir esta rotina agora. Tente executar de novo em Configurações.";
    return { id: r.id, ok: false, mensagem };
  }
}

/** Executa todas as rotinas ativas cuja vez já chegou. Chamada pelo executor de 60s (instrumentation.ts) e pelo gatilho externo (POST /api/rotinas/executar). */
export async function executarVencidas(agora = new Date()): Promise<{ id: string; ok: boolean; mensagem: string }[]> {
  const vencidas = listar().filter((r) => devida(r, agora));
  const resultados: { id: string; ok: boolean; mensagem: string }[] = [];
  for (const r of vencidas) resultados.push(await executar(r));
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
