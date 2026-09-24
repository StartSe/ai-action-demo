// Guarda a planilha enviada no mesmo app.sqlite, em tabela própria.
// Precisa ficar guardada (e não só viver na requisição) porque o painel é reaberto por /r/[id],
// impresso por /imprimir/[id] e ajustado pela conversa de refino — e todos recalculam em cima
// das linhas originais.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Dados } from "./planilha";
import type { EspecReceitas } from "./receita";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

/** Planilha apagada sozinha depois disso. Dado do usuário não fica para sempre sem necessidade. */
export const DIAS_DE_GUARDA = 30;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS planilhas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    linhas INTEGER NOT NULL,
    criadoEm TEXT NOT NULL,
    expiraEm TEXT NOT NULL
  )`);
  // O texto cru fica junto para a pessoa poder corrigir o tipo de uma coluna: reprocessar do zero é
  // a única forma sem perda (o valor convertido já perdeu o formato original).
  try { db.exec(`ALTER TABLE planilhas ADD COLUMN texto TEXT NOT NULL DEFAULT ''`); } catch { /* coluna já existe */ }
  // Receitas por painel, em tabela própria: `lib/historico.ts` é arquivo INFRA comparado byte a byte
  // com o pdi-time e não pode ganhar um gravador de `entrada` só para este app. A chave é o id do
  // painel salvo; o ajuste conversando lê daqui, edita e regrava.
  db.exec(`CREATE TABLE IF NOT EXISTS receitas_painel (
    painel_id TEXT PRIMARY KEY,
    dados_id TEXT NOT NULL,
    receitas TEXT NOT NULL,
    anteriores TEXT NOT NULL DEFAULT '[]',
    atualizadoEm TEXT NOT NULL
  )`);
  return db;
}

export function guardarDados(dados: Dados, texto: string): string {
  const id = crypto.randomBytes(9).toString("base64url");
  const agora = new Date();
  const expira = new Date(agora.getTime() + DIAS_DE_GUARDA * 86_400_000);
  abrir()
    .prepare("INSERT INTO planilhas (id, nome, conteudo, texto, linhas, criadoEm, expiraEm) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, dados.nome, JSON.stringify(dados), texto, dados.linhas.length, agora.toISOString(), expira.toISOString());
  return id;
}

/** Substitui a leitura guardada (usado quando a pessoa corrige o tipo de uma coluna). */
export function regravarDados(id: string, dados: Dados): void {
  abrir().prepare("UPDATE planilhas SET conteudo = ?, linhas = ? WHERE id = ?").run(JSON.stringify(dados), dados.linhas.length, id);
}

/** O texto cru do arquivo, para reprocessar com outro tipo de coluna. */
export function obterTexto(id: string): string | null {
  const linha = abrir().prepare("SELECT texto FROM planilhas WHERE id = ?").get(id) as { texto: string } | undefined;
  return linha?.texto || null;
}

export function obterDados(id: string): Dados | null {
  const linha = abrir().prepare("SELECT conteudo FROM planilhas WHERE id = ?").get(id) as { conteudo: string } | undefined;
  if (!linha) return null;
  try {
    return JSON.parse(linha.conteudo) as Dados;
  } catch (err) {
    console.error("Planilha guardada ilegível:", id, err);
    return null;
  }
}

export function apagarDados(id: string): void {
  abrir().prepare("DELETE FROM planilhas WHERE id = ?").run(id);
}

/** Mesma profundidade da pilha de Desfazer da tela: o painel e a receita voltam juntos. */
const PILHA_RECEITAS = 5;

/**
 * Liga um painel salvo à planilha e às receitas que o produziram, empilhando a versão anterior.
 * Sem a pilha, um Desfazer devolveria o painel antigo à tela mas deixaria a receita nova no banco —
 * e o ajuste seguinte partiria de um estado que ninguém está vendo.
 */
export function guardarReceitas(painelId: string, dadosId: string, receitas: EspecReceitas): void {
  const atual = obterReceitas(painelId);
  const anteriores = atual ? [atual.receitas, ...lerAnteriores(painelId)].slice(0, PILHA_RECEITAS) : [];
  abrir()
    .prepare(`INSERT INTO receitas_painel (painel_id, dados_id, receitas, anteriores, atualizadoEm) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(painel_id) DO UPDATE SET receitas = excluded.receitas, anteriores = excluded.anteriores, atualizadoEm = excluded.atualizadoEm`)
    .run(painelId, dadosId, JSON.stringify(receitas), JSON.stringify(anteriores), new Date().toISOString());
}

function lerAnteriores(painelId: string): EspecReceitas[] {
  const linha = abrir().prepare("SELECT anteriores FROM receitas_painel WHERE painel_id = ?").get(painelId) as { anteriores: string } | undefined;
  if (!linha) return [];
  try {
    const lista = JSON.parse(linha.anteriores);
    return Array.isArray(lista) ? (lista as EspecReceitas[]) : [];
  } catch {
    return [];
  }
}

/** Volta uma versão de receita, para acompanhar o Desfazer da tela. */
export function desfazerReceitas(painelId: string): boolean {
  const [anterior, ...resto] = lerAnteriores(painelId);
  if (!anterior) return false;
  abrir()
    .prepare("UPDATE receitas_painel SET receitas = ?, anteriores = ?, atualizadoEm = ? WHERE painel_id = ?")
    .run(JSON.stringify(anterior), JSON.stringify(resto), new Date().toISOString(), painelId);
  return true;
}

export function obterReceitas(painelId: string): { dadosId: string; receitas: EspecReceitas } | null {
  const linha = abrir().prepare("SELECT dados_id, receitas FROM receitas_painel WHERE painel_id = ?").get(painelId) as
    | { dados_id: string; receitas: string }
    | undefined;
  if (!linha) return null;
  try {
    return { dadosId: linha.dados_id, receitas: JSON.parse(linha.receitas) as EspecReceitas };
  } catch (err) {
    console.error("Receitas guardadas ilegíveis:", painelId, err);
    return null;
  }
}

/** Roda na subida do servidor, junto com limparExpirados() do histórico (ver instrumentation.ts). */
export function limparPlanilhasExpiradas(): void {
  const agora = new Date().toISOString();
  const d = abrir();
  d.prepare("DELETE FROM planilhas WHERE expiraEm < ?").run(agora);
  // Receita sem a planilha não serve para nada: o ajuste precisa das linhas para recalcular.
  d.prepare("DELETE FROM receitas_painel WHERE dados_id NOT IN (SELECT id FROM planilhas)").run();
}
