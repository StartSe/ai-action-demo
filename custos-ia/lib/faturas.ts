// Faturas de ferramentas de IA, lançadas manualmente (US-019) ou lidas por e-mail/PDF (histórias
// futuras). Usa o mesmo arquivo SQLite de lib/store.ts/lib/historico.ts, em uma tabela própria.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Alerta, Fatura, Orcamento, Periodo } from "./types";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let db: DatabaseSync | null = null;

function abrir(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.sqlite"));
  db.exec(`CREATE TABLE IF NOT EXISTS faturas (
    id TEXT PRIMARY KEY,
    fornecedor TEXT NOT NULL,
    ferramenta TEXT NOT NULL,
    categoria TEXT NOT NULL,
    valor REAL NOT NULL,
    moeda TEXT NOT NULL,
    valorBRL REAL NOT NULL,
    data TEXT NOT NULL,
    periodicidade TEXT NOT NULL,
    origem TEXT NOT NULL,
    referencia TEXT,
    criadoEm TEXT NOT NULL
  )`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS faturas_dedup ON faturas (fornecedor, valor, data)`);
  return db;
}

type Linha = {
  id: string; fornecedor: string; ferramenta: string; categoria: string; valor: number; moeda: string;
  valorBRL: number; data: string; periodicidade: string; origem: string; referencia: string | null; criadoEm: string;
};

function linhaParaFatura(l: Linha): Fatura {
  return {
    id: l.id,
    fornecedor: l.fornecedor,
    ferramenta: l.ferramenta,
    categoria: l.categoria,
    valor: l.valor,
    moeda: l.moeda as Fatura["moeda"],
    valorBRL: l.valorBRL,
    data: l.data,
    periodicidade: l.periodicidade as Fatura["periodicidade"],
    origem: l.origem as Fatura["origem"],
    referencia: l.referencia ?? undefined,
    criadoEm: l.criadoEm,
  };
}

function gerarId(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Início (AAAA-MM-DD) do período, contando `meses` para trás a partir do mês atual (incluindo-o). */
export function inicioPeriodo(meses: number, referencia = new Date()): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth() - (meses - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function mesesDoPeriodo(periodo: Periodo): number {
  return periodo === "mes" ? 1 : periodo === "3meses" ? 3 : 12;
}

/** Último dia (AAAA-MM-DD) do mês da data de referência — limite superior de uma leitura fechada
 * (ex.: o fechamento mensal lê o mês anterior e não pode puxar faturas já lançadas no mês corrente). */
export function fimDoMes(referencia = new Date()): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Chave AAAA-MM do mês `offset` meses antes de `referencia` (0 = o próprio mês de referência). */
export function chaveMes(referencia: Date, offset: number): string {
  const d = new Date(referencia.getFullYear(), referencia.getMonth() - offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MESES_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "setembro de 2026" a partir de "2026-09". */
export function rotuloMes(aaaaMm: string): string {
  const [ano, mes] = aaaaMm.split("-").map(Number);
  return `${MESES_PT[mes - 1]} de ${ano}`;
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

function reais(v: number): string {
  return `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
}

/** Quantos meses antes de um mês um fornecedor precisa estar ausente para a fatura dele contar como "Assinatura nova". */
export const MESES_SEM_FATURA_PARA_NOVA = 3;

/** Alertas calculados sem IA, mês a mês dentro do período (os `meses` mais recentes até `referencia`):
 * - "Acima do planejado": o gasto de uma ferramenta num mês passou do orçamento mensal daquele item;
 * - "Assinatura nova": um fornecedor teve fatura num mês e nenhuma nos 3 meses anteriores — só quando
 *   já havia alguma fatura (de qualquer fornecedor) nesses 3 meses, para o começo do histórico não
 *   marcar todo mundo como novo;
 * - "Assinatura duplicada": a mesma ferramenta foi paga duas vezes no mesmo mês, seja em dois
 *   fornecedores diferentes (contrato direto e revenda), seja em dois planos do mesmo fornecedor.
 *   Cobrança recorrente é mensal por definição, então a segunda fatura do mês é sempre suspeita.
 * `faturas` precisa trazer os 3 meses anteriores ao período (lib/leitura.ts já carrega essa janela).
 * Ordenado do mês mais recente para o mais antigo; dentro do mês, estouros (por valor) antes das novas. */
export function calcularAlertas({ faturas, orcamento, meses, referencia = new Date() }: { faturas: Fatura[]; orcamento: Orcamento[]; meses: number; referencia?: Date }): Alerta[] {
  const porMesFerramenta = new Map<string, number>();
  const mesesPorFornecedor = new Map<string, Set<string>>();
  const mesesComFatura = new Set<string>();
  for (const f of faturas) {
    const mes = f.data.slice(0, 7);
    mesesComFatura.add(mes);
    const chave = `${mes}|${f.ferramenta.trim().toLowerCase()}`;
    porMesFerramenta.set(chave, (porMesFerramenta.get(chave) || 0) + f.valorBRL);
    const fornecedor = f.fornecedor.trim().toLowerCase();
    if (!mesesPorFornecedor.has(fornecedor)) mesesPorFornecedor.set(fornecedor, new Set());
    mesesPorFornecedor.get(fornecedor)!.add(mes);
  }

  const orcado = new Map(orcamento.map((o) => [o.item.trim().toLowerCase(), o.valorMensalBRL] as const));
  const alertas: Alerta[] = [];

  for (let offset = 0; offset < meses; offset++) {
    const mes = chaveMes(referencia, offset);
    const rotulo = rotuloMes(mes);
    const anteriores = Array.from({ length: MESES_SEM_FATURA_PARA_NOVA }, (_, i) => chaveMes(referencia, offset + i + 1));
    const haHistoricoAntes = anteriores.some((m) => mesesComFatura.has(m));

    const estouros: Alerta[] = [];
    const novas: Alerta[] = [];
    const ferramentasVistas = new Set<string>();
    const fornecedoresVistos = new Set<string>();
    for (const f of faturas) {
      if (f.data.slice(0, 7) !== mes) continue;

      const ferramenta = f.ferramenta.trim().toLowerCase();
      if (!ferramentasVistas.has(ferramenta)) {
        ferramentasVistas.add(ferramenta);
        const limite = orcado.get(ferramenta);
        const gasto = arredondar(porMesFerramenta.get(`${mes}|${ferramenta}`) || 0);
        if (limite !== undefined && gasto > limite) {
          estouros.push({
            tipo: "acima-do-planejado",
            titulo: "Acima do planejado",
            nivel: "alta",
            alvo: f.ferramenta,
            mes,
            descricao: `${f.ferramenta} gastou ${reais(gasto)} em ${rotulo}, ${reais(arredondar(gasto - limite))} acima do planejado (${reais(limite)} por mês).`,
          });
        }
      }

      const fornecedor = f.fornecedor.trim().toLowerCase();
      if (!fornecedoresVistos.has(fornecedor)) {
        fornecedoresVistos.add(fornecedor);
        const mesesDoFornecedor = mesesPorFornecedor.get(fornecedor)!;
        const semFaturaAntes = anteriores.every((m) => !mesesDoFornecedor.has(m));
        if (haHistoricoAntes && semFaturaAntes) {
          novas.push({
            tipo: "assinatura-nova",
            titulo: "Assinatura nova",
            nivel: "media",
            alvo: f.fornecedor,
            mes,
            descricao: `${f.fornecedor} (${f.ferramenta}) apareceu em ${rotulo} sem nenhuma fatura nos ${MESES_SEM_FATURA_PARA_NOVA} meses anteriores.`,
          });
        }
      }
    }

    estouros.sort((a, b) => (porMesFerramenta.get(`${mes}|${b.alvo.trim().toLowerCase()}`) || 0) - (porMesFerramenta.get(`${mes}|${a.alvo.trim().toLowerCase()}`) || 0));
    novas.sort((a, b) => a.alvo.localeCompare(b.alvo, "pt-BR"));
    alertas.push(...estouros, ...duplicadasDoMes(faturas, mes, rotulo), ...novas);
  }

  return alertas;
}

/** "Assinatura duplicada" de um mês: ferramentas com mais de uma cobrança no mês, agrupadas por
 * fornecedor. Duas ou mais faturas da mesma ferramenta no mesmo mês significam ou contrato em dois
 * fornecedores, ou dois planos no mesmo fornecedor — a descrição diz qual dos dois é o caso e quanto
 * daria para economizar cancelando a menor. Faturas idênticas (mesmo fornecedor, valor e data) não
 * chegam aqui: lib/faturas.ts:salvar já as descarta. */
function duplicadasDoMes(faturas: Fatura[], mes: string, rotulo: string): Alerta[] {
  const porFerramenta = new Map<string, Fatura[]>();
  for (const f of faturas) {
    if (f.data.slice(0, 7) !== mes) continue;
    const chave = f.ferramenta.trim().toLowerCase();
    if (!porFerramenta.has(chave)) porFerramenta.set(chave, []);
    porFerramenta.get(chave)!.push(f);
  }

  const alertas: Alerta[] = [];
  for (const cobrancas of porFerramenta.values()) {
    if (cobrancas.length < 2) continue;
    const fornecedores = [...new Set(cobrancas.map((f) => f.fornecedor.trim()))];
    const total = arredondar(cobrancas.reduce((s, f) => s + f.valorBRL, 0));
    const menor = arredondar(Math.min(...cobrancas.map((f) => f.valorBRL)));
    const onde =
      fornecedores.length > 1
        ? `em ${fornecedores.length} fornecedores (${fornecedores.join(" e ")})`
        : `em ${cobrancas.length} cobranças do mesmo fornecedor (${fornecedores[0]})`;
    alertas.push({
      tipo: "assinatura-duplicada",
      titulo: "Assinatura duplicada",
      nivel: "alta",
      alvo: cobrancas[0].ferramenta,
      mes,
      descricao: `${cobrancas[0].ferramenta} foi paga ${onde} em ${rotulo}, ${reais(total)} no total. Cancelar a menor economiza ${reais(menor)} por mês.`,
    });
  }
  return alertas.sort((a, b) => a.alvo.localeCompare(b.alvo, "pt-BR"));
}

/** Salva uma fatura; ignora silenciosamente (devolve a existente) quando já existe uma com o mesmo
 * fornecedor, valor e data — mesma chave de dedup usada por leituras futuras de e-mail/PDF. */
export function salvar(fatura: Omit<Fatura, "id" | "criadoEm">): Fatura {
  const existente = abrir()
    .prepare("SELECT * FROM faturas WHERE fornecedor = ? AND valor = ? AND data = ?")
    .get(fatura.fornecedor, fatura.valor, fatura.data) as Linha | undefined;
  if (existente) return linhaParaFatura(existente);

  const id = gerarId();
  const criadoEm = new Date().toISOString();
  try {
    abrir()
      .prepare(
        `INSERT INTO faturas (id, fornecedor, ferramenta, categoria, valor, moeda, valorBRL, data, periodicidade, origem, referencia, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id, fatura.fornecedor, fatura.ferramenta, fatura.categoria, fatura.valor, fatura.moeda, fatura.valorBRL,
        fatura.data, fatura.periodicidade, fatura.origem, fatura.referencia || null, criadoEm
      );
  } catch {
    // Corrida rara entre a checagem acima e o INSERT: outra chamada já inseriu a mesma chave.
    const duplicada = abrir()
      .prepare("SELECT * FROM faturas WHERE fornecedor = ? AND valor = ? AND data = ?")
      .get(fatura.fornecedor, fatura.valor, fatura.data) as Linha;
    return linhaParaFatura(duplicada);
  }
  return { ...fatura, id, criadoEm };
}

/** Faturas dentro do período (mês atual, últimos 3 meses ou últimos 12 meses), mais recentes primeiro. */
export function listar(periodo: Periodo): Fatura[] {
  const desde = inicioPeriodo(mesesDoPeriodo(periodo));
  const linhas = abrir().prepare("SELECT * FROM faturas WHERE data >= ? ORDER BY data DESC").all(desde) as Linha[];
  return linhas.map(linhaParaFatura);
}

/** Faturas dos últimos `n` meses (contando o atual), mais recentes primeiro — usado por lib/leitura.ts
 * para ter sempre um mês extra de contexto na hora de calcular a variação do mês mais recente, mesmo
 * quando o período pedido pela tela é só "mês atual" (1 mês). */
export function listarUltimosMeses(n: number, referencia = new Date()): Fatura[] {
  const desde = inicioPeriodo(n, referencia);
  const linhas = abrir().prepare("SELECT * FROM faturas WHERE data >= ? ORDER BY data DESC").all(desde) as Linha[];
  return linhas.map(linhaParaFatura);
}

/** Já existe fatura com esta origem e referência (ex.: id da mensagem do Gmail)? Evita reler — e gastar
 * uma chamada ao modelo — em um e-mail que já virou fatura numa importação anterior. */
export function existeReferencia(origem: Fatura["origem"], referencia: string): boolean {
  const linha = abrir().prepare("SELECT 1 FROM faturas WHERE origem = ? AND referencia = ? LIMIT 1").get(origem, referencia);
  return Boolean(linha);
}

/** Todas as faturas gravadas, sem filtro de período — usado só para decidir se o app tem dado real (senão cai no demo). */
export function existeAlguma(): boolean {
  const linha = abrir().prepare("SELECT 1 FROM faturas LIMIT 1").get();
  return Boolean(linha);
}

export function apagar(id: string): void {
  abrir().prepare("DELETE FROM faturas WHERE id = ?").run(id);
}

export function apagarTodas(): void {
  abrir().prepare("DELETE FROM faturas").run();
}

/** Total gasto (BRL) no período, para uso rápido fora de lib/leitura.ts. */
export function resumo(periodo: Periodo): { totalBRL: number; quantidade: number } {
  const faturas = listar(periodo);
  return { totalBRL: faturas.reduce((s, f) => s + f.valorBRL, 0), quantidade: faturas.length };
}
