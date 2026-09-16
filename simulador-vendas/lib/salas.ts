// Sala de simulação pública (link de treino): o vendedor abre /simular/<código> sozinho, conversa com
// o cliente simulado (por texto ou pelo agente de voz da ElevenLabs) e vê a mesma análise do app ao
// final. Usa o mesmo arquivo SQLite de lib/store.ts, em uma tabela própria; o link dura 30 dias e pode
// ser reaberto quantas vezes o vendedor quiser (sem limite de usos).
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS salas (
    codigo TEXT PRIMARY KEY,
    vendedorId TEXT NULL,
    cenarioId TEXT NULL,
    expiraEm TEXT NOT NULL,
    ultimoResultadoId TEXT NULL,
    ultimoResultadoEm TEXT NULL,
    criadoEm TEXT NOT NULL
  )`);
  // Coluna acrescentada depois (US-032): bancos criados antes desta versão ganham a coluna aqui, sem
  // script de migração separado — mesmo padrão de `resumo` em lib/historico.ts.
  try {
    db.exec("ALTER TABLE salas ADD COLUMN ultimaLigacaoEm TEXT NULL");
  } catch {
    // a coluna já existe
  }
  return db;
}

export type Sala = {
  codigo: string;
  vendedorId: string | null;
  cenarioId: string | null;
  expiraEm: string;
  ultimoResultadoId: string | null;
  ultimoResultadoEm: string | null;
  /** Quando o vendedor encerrou uma ligação por voz nesta sala; gravado mesmo que a análise nunca chegue. */
  ultimaLigacaoEm: string | null;
  criadoEm: string;
};

const DIAS_EXPIRACAO = 30;

/** Código aleatório de 16 caracteres, seguro para URL (base64url de 12 bytes) — mesmo formato de lib/formularios.ts. */
function gerarCodigo(): string {
  return crypto.randomBytes(12).toString("base64url");
}

/** Cria a sala e devolve o código do link (/simular/<código>). */
export function criar({ vendedorId, cenarioId }: { vendedorId?: string; cenarioId?: string }): string {
  const codigo = gerarCodigo();
  const criadoEm = new Date().toISOString();
  const expiraEm = new Date(Date.now() + DIAS_EXPIRACAO * 24 * 60 * 60 * 1000).toISOString();
  abrir()
    .prepare("INSERT INTO salas (codigo, vendedorId, cenarioId, expiraEm, criadoEm) VALUES (?, ?, ?, ?, ?)")
    .run(codigo, vendedorId ?? null, cenarioId ?? null, expiraEm, criadoEm);
  return codigo;
}

export function obter(codigo: string): Sala | null {
  const linha = abrir().prepare("SELECT * FROM salas WHERE codigo = ?").get(codigo) as Sala | undefined;
  return linha ?? null;
}

/** true quando a sala já passou do prazo; centralizado aqui para nunca chamar Date.now() direto de um componente. */
export function expirou(sala: Pick<Sala, "expiraEm">): boolean {
  return new Date(sala.expiraEm).getTime() < Date.now();
}

/** Chamado pelo aviso automático de pós-conversa (app/webhook/elevenlabs) quando dynamic_variables.sala_token
 * identifica esta sala: guarda o resultado mais recente, para a sala pública encontrá-lo por sondagem
 * (GET /api/salas/<código>/ultima) enquanto a análise da ligação por voz ainda está sendo gerada. */
export function registrarResultado(codigo: string, resultadoId: string): void {
  abrir().prepare("UPDATE salas SET ultimoResultadoId = ?, ultimoResultadoEm = ? WHERE codigo = ?").run(resultadoId, new Date().toISOString(), codigo);
}

/** Marca que uma ligação por voz terminou nesta sala. Chamado pela própria sala (o vendedor clica em
 * "Já terminei"), para a ligação ficar registrada mesmo quando o aviso de pós-conversa da ElevenLabs
 * nunca chega — é o que alimenta "ligações sem análise" no cartão da equipe técnica. */
export function registrarLigacao(codigo: string): void {
  abrir().prepare("UPDATE salas SET ultimaLigacaoEm = ? WHERE codigo = ?").run(new Date().toISOString(), codigo);
}

/** Quantas ligações registradas ainda não receberam a análise correspondente (o aviso não chegou). */
export function ligacoesSemAnalise(): number {
  const linha = abrir()
    .prepare("SELECT COUNT(*) AS total FROM salas WHERE ultimaLigacaoEm IS NOT NULL AND (ultimoResultadoEm IS NULL OR ultimoResultadoEm < ultimaLigacaoEm)")
    .get() as { total: number } | undefined;
  return linha?.total ?? 0;
}

/** Remove salas expiradas; roda na inicialização do servidor (ver instrumentation.ts). */
export function limparExpirados(): void {
  abrir().prepare("DELETE FROM salas WHERE expiraEm < ?").run(new Date().toISOString());
}
