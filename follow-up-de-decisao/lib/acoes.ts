// Lógica de negócio das ações: cadastro manual, extração de ações a partir de uma ata colada (com
// checagem anti-alucinação) e a lista usada pela rotina de cobrança. Compartilhada entre a rota HTTP
// (app/api/acoes/**) e a ferramenta MCP (lib/ferramentas.ts), para não duplicar prompt nem lógica.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { acoesPropostasDemo, esperar } from "./demo";
import type { Acao, AcaoProposta, StatusAcao } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS acoes (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    dono TEXT NOT NULL DEFAULT '',
    prazo TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    origem TEXT NOT NULL DEFAULT 'manual',
    evidenciaDono TEXT NOT NULL DEFAULT '',
    evidenciaPrazo TEXT NOT NULL DEFAULT '',
    criadoEm TEXT NOT NULL,
    concluidaEm TEXT NULL
  )`);
  return db;
}

type Linha = {
  id: string; titulo: string; dono: string; prazo: string; status: string; origem: string;
  evidenciaDono: string; evidenciaPrazo: string; criadoEm: string; concluidaEm: string | null;
};

function linhaParaAcao(l: Linha): Acao {
  return {
    id: l.id,
    titulo: l.titulo,
    dono: l.dono,
    prazo: l.prazo,
    status: l.status as StatusAcao,
    origem: l.origem as Acao["origem"],
    evidenciaDono: l.evidenciaDono,
    evidenciaPrazo: l.evidenciaPrazo,
    criadoEm: l.criadoEm,
    concluidaEm: l.concluidaEm,
  };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** "AAAA-MM-DD" a partir das partes locais (nunca toISOString: em fuso negativo empurra a data). */
function paraDataLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export type NovaAcao = { titulo: string; dono?: string; prazo?: string; origem?: Acao["origem"]; evidenciaDono?: string; evidenciaPrazo?: string };

function validarPrazo(prazo: string | undefined): string {
  const v = (prazo ?? "").trim();
  if (!v) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

/** Cria uma ação (manual ou já revisada e confirmada a partir de uma ata) e devolve o registro salvo. */
export function criarAcao({ titulo, dono, prazo, origem = "manual", evidenciaDono, evidenciaPrazo }: NovaAcao): Acao {
  const id = gerarId();
  const criadoEm = new Date().toISOString();
  const linha: Acao = {
    id,
    titulo: titulo.trim(),
    dono: (dono ?? "").trim(),
    prazo: validarPrazo(prazo),
    status: "pendente",
    origem,
    evidenciaDono: origem === "ata" ? (evidenciaDono ?? "").trim() : "",
    evidenciaPrazo: origem === "ata" ? (evidenciaPrazo ?? "").trim() : "",
    criadoEm,
    concluidaEm: null,
  };
  abrir()
    .prepare(
      `INSERT INTO acoes (id, titulo, dono, prazo, status, origem, evidenciaDono, evidenciaPrazo, criadoEm, concluidaEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(linha.id, linha.titulo, linha.dono, linha.prazo, linha.status, linha.origem, linha.evidenciaDono, linha.evidenciaPrazo, linha.criadoEm, linha.concluidaEm);
  return linha;
}

export function criarAcoesEmLote(acoes: NovaAcao[]): Acao[] {
  return acoes.map((a) => criarAcao(a));
}

/** Mais recentes primeiro; pendentes com prazo primeiro, depois pendentes sem prazo, depois concluídas. */
export function listarAcoes(): Acao[] {
  const linhas = abrir().prepare("SELECT * FROM acoes ORDER BY criadoEm DESC").all() as Linha[];
  const acoes = linhas.map(linhaParaAcao);
  const peso = (a: Acao) => (a.status === "concluida" ? 2 : a.prazo ? 0 : 1);
  return acoes.sort((a, b) => {
    const diff = peso(a) - peso(b);
    if (diff !== 0) return diff;
    if (a.status === "pendente" && a.prazo && b.prazo) return a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0;
    return 0;
  });
}

export function obterAcao(id: string): Acao | null {
  const linha = abrir().prepare("SELECT * FROM acoes WHERE id = ?").get(id) as Linha | undefined;
  return linha ? linhaParaAcao(linha) : null;
}

/** Marca como concluída (ou reabre); nunca cobra de novo uma ação já concluída (ver acoesNaJanela). */
export function definirStatus(id: string, status: StatusAcao): Acao | null {
  const concluidaEm = status === "concluida" ? new Date().toISOString() : null;
  const { changes } = abrir().prepare("UPDATE acoes SET status = ?, concluidaEm = ? WHERE id = ?").run(status, concluidaEm, id);
  return Number(changes) > 0 ? obterAcao(id) : null;
}

export function apagarAcao(id: string): boolean {
  const { changes } = abrir().prepare("DELETE FROM acoes WHERE id = ?").run(id);
  return Number(changes) > 0;
}

/** Ações pendentes com prazo dentro da janela [hoje, hoje+dias] — nunca antes, nunca depois, nunca sem
 * prazo, nunca já concluída. É o que a rotina de cobrança (lib/rotinas-do-app.ts) usa para decidir o que
 * cobrar; nunca "cobra tudo". */
export function acoesNaJanela(dias: number): Acao[] {
  const hoje = paraDataLocal(new Date());
  const limiteData = new Date();
  limiteData.setDate(limiteData.getDate() + Math.max(0, dias));
  const limite = paraDataLocal(limiteData);
  return listarAcoes().filter((a) => a.status === "pendente" && a.prazo && a.prazo >= hoje && a.prazo <= limite);
}

// --- Extração de ações a partir de uma ata colada (IA), com checagem anti-alucinação. ---

const SYSTEM_EXTRACAO = `Você extrai itens de ação de atas de reunião em português do Brasil, para um gestor cobrar depois.
Regras rígidas, sem exceção:
- Nunca invente um dono ou um prazo que não esteja escrito explicitamente no texto. Sem um responsável claro, devolva "dono" e "evidencia_dono" como string vazia. Sem uma data resolvível com segurança, devolva "prazo" e "evidencia_prazo" como string vazia.
- "evidencia_dono" e "evidencia_prazo" são trechos copiados EXATAMENTE do texto original (mesmas palavras, mesma pontuação), nunca parafraseados. Um trecho que não existe literalmente no texto é um erro grave.
- Quando houver uma referência de prazo resolvível (ex.: "até sexta-feira (18/09)", "até o fim do mês", "dia 30"), calcule "prazo" no formato AAAA-MM-DD usando a data de referência informada. Referências vagas (ex.: "próximo trimestre", "na próxima reunião", "em breve") não são resolvíveis: deixe "prazo" vazio.
- Cada ação tem um título curto no infinitivo (ex.: "Renegociar o contrato"), sem repetir o nome do dono.
- Ignore falas que não são ações concretas (contexto, debate, agradecimentos).
Responda em JSON: { "acoes": [ { "titulo": "", "dono": "", "prazo": "", "evidencia_dono": "", "evidencia_prazo": "" } ] }`;

type AcaoExtraidaBruta = { titulo?: string; dono?: string; prazo?: string; evidencia_dono?: string; evidencia_prazo?: string };

/** Só aceita dono/prazo quando a evidência declarada é mesmo um trecho literal do texto colado; caso
 * contrário, limpa os dois campos em vez de arriscar um dado inventado. */
function validarEvidencia(bruta: AcaoExtraidaBruta, textoOriginal: string): AcaoProposta {
  const evidenciaDono = (bruta.evidencia_dono ?? "").trim();
  const donoValido = Boolean(evidenciaDono) && textoOriginal.includes(evidenciaDono) && Boolean((bruta.dono ?? "").trim());
  const evidenciaPrazo = (bruta.evidencia_prazo ?? "").trim();
  const prazoBruto = (bruta.prazo ?? "").trim();
  const prazoValido = Boolean(evidenciaPrazo) && textoOriginal.includes(evidenciaPrazo) && /^\d{4}-\d{2}-\d{2}$/.test(prazoBruto);
  return {
    titulo: (bruta.titulo ?? "").trim(),
    dono: donoValido ? (bruta.dono ?? "").trim() : "",
    evidenciaDono: donoValido ? evidenciaDono : "",
    prazo: prazoValido ? prazoBruto : "",
    evidenciaPrazo: prazoValido ? evidenciaPrazo : "",
  };
}

export type ResultadoExtracao = { demo: boolean; acoes: AcaoProposta[]; meta: Meta };

/** Propõe ações a partir do texto colado; nunca salva sozinha — a pessoa revisa e confirma
 * (app/api/acoes/lote) antes de qualquer ação virar registro de verdade. */
export async function extrairAcoesDaAta(texto: string): Promise<ResultadoExtracao> {
  const insumo = "o texto da ata colado";
  if (!aiEnabled()) {
    await esperar(1200);
    return { demo: true, acoes: acoesPropostasDemo(), meta: meta({ demo: true, insumo }) };
  }
  const hoje = paraDataLocal(new Date());
  const prompt = `Data de referência para calcular prazos: ${hoje}\n\nTexto da ata:\n${texto}`;
  const resposta = await askJSON<{ acoes?: AcaoExtraidaBruta[] }>({ system: SYSTEM_EXTRACAO, prompt });
  const acoes = (resposta.acoes ?? []).map((a) => validarEvidencia(a, texto)).filter((a) => a.titulo);
  return { demo: false, acoes, meta: meta({ demo: false, insumo }) };
}
