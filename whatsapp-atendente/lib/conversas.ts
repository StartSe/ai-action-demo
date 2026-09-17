/**
 * Conversas e mensagens do atendimento, guardadas no mesmo `app.sqlite` de lib/store.ts (padrão de
 * lib/conta.ts: `CREATE TABLE IF NOT EXISTS` na primeira abertura). Até a US-003 elas viviam num Map
 * em memória de lib/atendente.ts, com só a última pergunta e a última resposta por número, e se
 * perdiam a cada reinício do app.
 *
 * Datas: gravadas como o SQLite grava (`YYYY-MM-DD HH:MM:SS`, sempre em UTC, o mesmo formato de
 * `datetime('now')`), o que deixa comparar e ordenar por texto. Para fora deste arquivo elas sempre
 * saem em ISO.
 */
import { conversasExemplo } from "./demo";
import { abrirBanco, getConfig, setConfig } from "./store";
import type { CanalOrigem, Conversa, ConversaCompleta, MensagemChat, MensagemDaConversa, PapelMensagem, Periodo, StatusConversa } from "./types";

/** Quantas mensagens da conversa vão para a IA como memória de curto prazo. */
export const MAX_HISTORICO = 20;

/**
 * Uma conversa atendida pela IA sem mensagem nova do cliente por mais de 24 h é LIDA como resolvida
 * (nunca gravada assim): o cálculo acontece na leitura, sem tarefa agendada. 24 h é a mesma janela de
 * conversa que o WhatsApp usa. "Precisa de atenção" nunca se resolve sozinha.
 */
const HORAS_ATE_RESOLVER = 24;

type LinhaConversa = {
  numero: string;
  nome: string;
  origem: string;
  status: string;
  assunto: string | null;
  exemplo: number;
  nao_lidas: number;
  criado_em: string;
  atualizado_em: string;
};

type LinhaMensagem = {
  id: number;
  numero: string;
  papel: string;
  texto: string;
  criado_em: string;
  ferramenta_usada: string | null;
  tempo_resposta_ms: number | null;
};

// Os dois tipos que saem deste arquivo moram em lib/types.ts (arquivo client-safe, sem node:sqlite):
// a conversa aberta é desenhada por um Client Component, e uma definição só evita que o formato do
// banco e o formato da tela andem em ritmos diferentes.

/** Uma conversa como ela está no banco, sem as mensagens (para isso, veja `obterConversa`). */
export type ConversaRegistro = Omit<ConversaCompleta, "mensagens">;

export type MensagemRegistro = MensagemDaConversa;

let criado = false;

function banco() {
  const d = abrirBanco();
  if (!criado) {
    d.exec(`CREATE TABLE IF NOT EXISTS conversas (
      numero TEXT PRIMARY KEY,
      nome TEXT NOT NULL DEFAULT '',
      origem TEXT NOT NULL DEFAULT 'simulador',
      status TEXT NOT NULL DEFAULT 'ia',
      assunto TEXT NULL,
      exemplo INTEGER NOT NULL DEFAULT 0,
      nao_lidas INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    d.exec(`CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL,
      papel TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      ferramenta_usada TEXT NULL,
      tempo_resposta_ms INTEGER NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS mensagens_por_conversa ON mensagens (numero, id)`);
    criado = true;
  }
  return d;
}

// --- Datas ---------------------------------------------------------------

/** Data no formato gravado (UTC, "2026-09-17 14:03:00"), igual ao de `datetime('now')`. */
export function paraTextoDeBanco(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function paraData(texto: string): Date {
  return new Date(`${texto.replace(" ", "T")}Z`);
}

function paraIso(texto: string): string {
  return paraData(texto).toISOString();
}

// --- Leitura -------------------------------------------------------------

function statusEfetivo(status: string, ultimaDoCliente: string | null, atualizadoEm: string): StatusConversa {
  const gravado = (status || "ia") as StatusConversa;
  if (gravado !== "ia") return gravado;
  const referencia = paraData(ultimaDoCliente ?? atualizadoEm).getTime();
  return Date.now() - referencia > HORAS_ATE_RESOLVER * 60 * 60 * 1000 ? "resolvida" : "ia";
}

function ultimaDoCliente(numero: string): string | null {
  const linha = banco()
    .prepare("SELECT criado_em FROM mensagens WHERE numero = ? AND papel = 'cliente' ORDER BY id DESC LIMIT 1")
    .get(numero) as { criado_em: string } | undefined;
  return linha?.criado_em ?? null;
}

function paraRegistro(l: LinhaConversa, ultimaCliente: string | null): ConversaRegistro {
  return {
    numero: l.numero,
    nome: l.nome,
    origem: l.origem as CanalOrigem,
    status: statusEfetivo(l.status, ultimaCliente, l.atualizado_em),
    assunto: l.assunto,
    exemplo: Boolean(l.exemplo),
    naoLidas: Number(l.nao_lidas),
    criadoEm: paraIso(l.criado_em),
    atualizadoEm: paraIso(l.atualizado_em),
  };
}

function linha(numero: string): LinhaConversa | undefined {
  return banco().prepare("SELECT * FROM conversas WHERE numero = ?").get(numero) as LinhaConversa | undefined;
}

/** A conversa (sem as mensagens), com o status já calculado na leitura; null quando o número não existe. */
export function obterRegistro(numero: string): ConversaRegistro | null {
  const l = linha(numero);
  return l ? paraRegistro(l, ultimaDoCliente(numero)) : null;
}

function paraMensagem(l: LinhaMensagem): MensagemRegistro {
  return {
    id: Number(l.id),
    papel: l.papel as PapelMensagem,
    texto: l.texto,
    criadoEm: paraIso(l.criado_em),
    ferramentaUsada: l.ferramenta_usada ?? undefined,
    tempoRespostaMs: l.tempo_resposta_ms === null ? undefined : Number(l.tempo_resposta_ms),
  };
}

/** A conversa inteira, da mensagem mais antiga para a mais recente; null quando o número não existe. */
export function obterConversa(numero: string): ConversaCompleta | null {
  const registro = obterRegistro(numero);
  if (!registro) return null;
  const linhas = banco().prepare("SELECT * FROM mensagens WHERE numero = ? ORDER BY id").all(numero) as LinhaMensagem[];
  return { ...registro, mensagens: linhas.map(paraMensagem) };
}

/** As últimas mensagens da conversa, da mais antiga para a mais recente: a memória de curto prazo da IA. */
export function historicoRecente(numero: string, limite = MAX_HISTORICO): MensagemChat[] {
  const linhas = banco()
    .prepare("SELECT papel, texto FROM mensagens WHERE numero = ? ORDER BY id DESC LIMIT ?")
    .all(numero, limite) as { papel: string; texto: string }[];
  return linhas.reverse().map((l) => ({ papel: l.papel as PapelMensagem, texto: l.texto }));
}

function hora(texto: string): string {
  return paraData(texto).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type LinhaLista = LinhaConversa & {
  ultima_cliente: string | null;
  ultima_cliente_em: string | null;
  ultima_resposta: string | null;
};

/**
 * Momento a partir do qual as conversas entram na lista; `null` em "tudo". "Hoje" é desde a meia-noite
 * (e não 24 h para trás), que é o que alguém entende ao escolher o período pela manhã.
 */
export function inicioDoPeriodo(periodo: Periodo): Date | null {
  if (periodo === "tudo") return null;
  if (periodo === "hoje") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const dias = periodo === "7d" ? 7 : 30;
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

export interface FiltroConversas {
  /** A conversa entra na lista quando a última mensagem dela é desta data em diante; sem ele, todas. */
  desde?: Date | null;
  /** Status já calculado na leitura (uma conversa `ia` parada há mais de 24 h aparece em "resolvida"). */
  status?: StatusConversa;
  /** Casa com o número, o nome do contato ou o texto de qualquer mensagem da conversa. */
  busca?: string;
}

/** As conversas da mais recente para a mais antiga, com a última pergunta e a última resposta de cada. */
export function listarConversas({ desde, status, busca }: FiltroConversas = {}): Conversa[] {
  const condicoes: string[] = [];
  const valores: (string | number)[] = [];
  if (desde) {
    condicoes.push("c.atualizado_em >= ?");
    valores.push(paraTextoDeBanco(desde));
  }
  const termo = busca?.trim().toLowerCase();
  if (termo) {
    condicoes.push(`(LOWER(c.numero) LIKE ? OR LOWER(c.nome) LIKE ?
      OR EXISTS (SELECT 1 FROM mensagens m WHERE m.numero = c.numero AND LOWER(m.texto) LIKE ?))`);
    valores.push(`%${termo}%`, `%${termo}%`, `%${termo}%`);
  }
  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = banco()
    .prepare(
      `SELECT c.*,
        (SELECT texto FROM mensagens m WHERE m.numero = c.numero AND m.papel = 'cliente' ORDER BY m.id DESC LIMIT 1) AS ultima_cliente,
        (SELECT criado_em FROM mensagens m WHERE m.numero = c.numero AND m.papel = 'cliente' ORDER BY m.id DESC LIMIT 1) AS ultima_cliente_em,
        (SELECT texto FROM mensagens m WHERE m.numero = c.numero AND m.papel IN ('atendente', 'humano') ORDER BY m.id DESC LIMIT 1) AS ultima_resposta
       FROM conversas c ${onde} ORDER BY c.atualizado_em DESC, c.numero`
    )
    .all(...valores) as LinhaLista[];

  return linhas
    .map((l) => {
      const registro = paraRegistro(l, l.ultima_cliente_em);
      return {
        numero: l.numero,
        nome: l.nome,
        ultima_mensagem: l.ultima_cliente ?? "",
        ultima_resposta: l.ultima_resposta ?? "",
        hora: hora(l.atualizado_em),
        transferir: registro.status === "atencao",
        origem: registro.origem,
        status: registro.status,
        assunto: registro.assunto,
        exemplo: registro.exemplo,
        nao_lidas: registro.naoLidas,
        atualizado_em: registro.atualizadoEm,
      } satisfies Conversa;
    })
    // O status filtrado é o da leitura, então o filtro vem depois do banco, nunca no WHERE.
    .filter((c) => !status || c.status === status);
}

/** Uma pergunta do cliente já gravada, com a resposta que veio logo depois (base de `perguntasPendentes`). */
export interface PerguntaRegistrada {
  numero: string;
  texto: string;
  criadoEm: string;
  /** Resposta dada logo depois desta pergunta; string vazia quando ninguém respondeu. */
  resposta: string;
  /** A conversa parou nesta pergunta esperando uma pessoa. */
  transferida: boolean;
}

/**
 * Todas as perguntas dos clientes, da mais antiga para a mais recente, cada uma com a resposta que
 * veio em seguida. Guarda a frequência de verdade (a lista de conversas antiga só tinha a última
 * pergunta de cada número, então "frequência" era uma aproximação por número).
 */
export function perguntasDoCliente({ desdeDias }: { desdeDias?: number } = {}): PerguntaRegistrada[] {
  const d = banco();
  const conversas = d.prepare("SELECT * FROM conversas").all() as LinhaConversa[];
  if (conversas.length === 0) return [];
  const linhas = d.prepare("SELECT * FROM mensagens ORDER BY numero, id").all() as LinhaMensagem[];

  const porNumero = new Map<string, LinhaMensagem[]>();
  for (const m of linhas) {
    const lista = porNumero.get(m.numero);
    if (lista) lista.push(m);
    else porNumero.set(m.numero, [m]);
  }

  const limite = desdeDias ? Date.now() - desdeDias * 24 * 60 * 60 * 1000 : 0;
  const perguntas: PerguntaRegistrada[] = [];
  for (const c of conversas) {
    const mensagens = porNumero.get(c.numero) ?? [];
    const daConversa = mensagens.filter((m) => m.papel === "cliente");
    const ultimaPergunta = daConversa[daConversa.length - 1];
    const status = statusEfetivo(c.status, ultimaPergunta?.criado_em ?? null, c.atualizado_em);
    for (let i = 0; i < mensagens.length; i++) {
      const m = mensagens[i];
      if (m.papel !== "cliente") continue;
      if (paraData(m.criado_em).getTime() < limite) continue;
      const seguinte = mensagens[i + 1];
      perguntas.push({
        numero: c.numero,
        texto: m.texto,
        criadoEm: paraIso(m.criado_em),
        resposta: seguinte && seguinte.papel !== "cliente" ? seguinte.texto : "",
        // Só a última pergunta da conversa pode estar esperando uma pessoa: as anteriores já andaram.
        transferida: status === "atencao" && m.id === ultimaPergunta?.id,
      });
    }
  }
  return perguntas.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

// --- Escrita -------------------------------------------------------------

function inserirMensagem({
  numero,
  papel,
  texto,
  criadoEm,
  ferramentaUsada,
  tempoRespostaMs,
}: {
  numero: string;
  papel: PapelMensagem;
  texto: string;
  criadoEm?: string;
  ferramentaUsada?: string;
  tempoRespostaMs?: number;
}): number {
  const gravada = banco()
    .prepare("INSERT INTO mensagens (numero, papel, texto, criado_em, ferramenta_usada, tempo_resposta_ms) VALUES (?, ?, ?, ?, ?, ?)")
    .run(numero, papel, texto, criadoEm ?? paraTextoDeBanco(), ferramentaUsada ?? null, tempoRespostaMs ?? null);
  return Number(gravada.lastInsertRowid);
}

/** Cria a conversa se ela ainda não existir e devolve o registro atual. */
export function garantirConversa({
  numero,
  origem = "simulador",
  nome = "",
  exemplo = false,
  assunto = null,
  status = "ia",
  em,
}: {
  numero: string;
  origem?: CanalOrigem;
  nome?: string;
  exemplo?: boolean;
  assunto?: string | null;
  status?: StatusConversa;
  /** Momento de criação, para as conversas de exemplo nascerem espalhadas nos últimos dias (US-004). */
  em?: Date;
}): ConversaRegistro {
  const existente = linha(numero);
  if (!existente) {
    const quando = paraTextoDeBanco(em);
    banco()
      .prepare("INSERT INTO conversas (numero, nome, origem, status, assunto, exemplo, nao_lidas, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)")
      .run(numero, nome, origem, status, assunto, exemplo ? 1 : 0, quando, quando);
  } else if (nome && !existente.nome) {
    banco().prepare("UPDATE conversas SET nome = ? WHERE numero = ?").run(nome, numero);
  }
  return obterRegistro(numero) as ConversaRegistro;
}

/**
 * Grava uma mensagem do cliente e devolve o status da conversa depois dela. Uma conversa resolvida
 * reabre como atendida pela IA; uma em atendimento humano continua humana e soma uma não lida (é o
 * que faz a IA não responder, em lib/atendente.ts).
 */
export function registrarMensagemCliente({
  numero,
  texto,
  origem = "simulador",
  nome,
  em,
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
  nome?: string;
  em?: Date;
}): ConversaRegistro {
  // A primeira conversa real do WhatsApp aposenta a demonstração, antes de qualquer gravação.
  if (origem === "whatsapp") apagarExemplosNaPrimeiraReal();
  const atual = garantirConversa({ numero, origem, nome, em });
  const gravado = (linha(numero) as LinhaConversa).status as StatusConversa;
  const status: StatusConversa = gravado === "resolvida" ? "ia" : gravado;
  const naoLidas = status === "humano" ? atual.naoLidas + 1 : atual.naoLidas;
  // A origem de uma conversa de exemplo não muda: ela continua marcada como exemplo até ser apagada.
  const origemFinal = atual.exemplo ? atual.origem : origem;
  const quando = paraTextoDeBanco(em);
  banco()
    .prepare("UPDATE conversas SET status = ?, nao_lidas = ?, origem = ?, atualizado_em = ? WHERE numero = ?")
    .run(status, naoLidas, origemFinal, quando, numero);
  inserirMensagem({ numero, papel: "cliente", texto, criadoEm: quando });
  return obterRegistro(numero) as ConversaRegistro;
}

/** Grava a resposta do atendente virtual: com o marcador de transferência, a conversa passa a precisar de atenção. */
export function registrarResposta({
  numero,
  texto,
  transferir = false,
  ferramentaUsada,
  tempoRespostaMs,
  em,
}: {
  numero: string;
  texto: string;
  transferir?: boolean;
  ferramentaUsada?: string;
  tempoRespostaMs?: number;
  em?: Date;
}): void {
  const quando = paraTextoDeBanco(em);
  banco().prepare("UPDATE conversas SET status = ?, atualizado_em = ? WHERE numero = ?").run(transferir ? "atencao" : "ia", quando, numero);
  inserirMensagem({ numero, papel: "atendente", texto, criadoEm: quando, ferramentaUsada, tempoRespostaMs });
}

/**
 * Grava a resposta escrita por uma pessoa: a conversa fica (ou passa a ficar) em atendimento humano.
 * Devolve o id da mensagem gravada — a tela precisa dele para marcar a bolha quando o envio pelo
 * número real falha depois da gravação (a mensagem existe, mas o cliente não a recebeu).
 */
export function registrarMensagemHumana(numero: string, texto: string): number {
  garantirConversa({ numero });
  const quando = paraTextoDeBanco();
  banco().prepare("UPDATE conversas SET status = 'humano', nao_lidas = 0, atualizado_em = ? WHERE numero = ?").run(quando, numero);
  return inserirMensagem({ numero, papel: "humano", texto, criadoEm: quando });
}

/**
 * Zera as mensagens não lidas (alguém abriu a conversa na tela). Não encosta em `atualizado_em`: ler
 * uma conversa não é novidade nela, e mexer na data a faria pular para o topo da lista a cada leitura.
 */
export function marcarLido(numero: string): void {
  banco().prepare("UPDATE conversas SET nao_lidas = 0 WHERE numero = ?").run(numero);
}

function mudarStatus(numero: string, status: StatusConversa, { zerarNaoLidas = false } = {}): void {
  const d = banco();
  if (!linha(numero)) return;
  d.prepare(`UPDATE conversas SET status = ?, atualizado_em = ?${zerarNaoLidas ? ", nao_lidas = 0" : ""} WHERE numero = ?`).run(status, paraTextoDeBanco(), numero);
}

/** Uma pessoa assumiu a conversa: a IA para de responder e as não lidas zeram. */
export function assumir(numero: string): void {
  mudarStatus(numero, "humano", { zerarNaoLidas: true });
}

export function devolver(numero: string): void {
  mudarStatus(numero, "ia");
}

export function resolver(numero: string): void {
  mudarStatus(numero, "resolvida", { zerarNaoLidas: true });
}

export function apagarConversa(numero: string): void {
  const d = banco();
  d.prepare("DELETE FROM mensagens WHERE numero = ?").run(numero);
  d.prepare("DELETE FROM conversas WHERE numero = ?").run(numero);
}

// --- Conversas de exemplo ------------------------------------------------
// Ver lib/demo.ts:conversasExemplo(). Elas são gravadas uma única vez, para as telas terem o que
// mostrar antes de o número da empresa estar conectado, e somem na primeira conversa real.

/** Marca que a demonstração já nasceu (ou já foi apagada): sem ela, as conversas de exemplo voltariam. */
const CHAVE_EXEMPLOS = "CONVERSAS_EXEMPLO_SEMEADAS";

export function contarExemplos(): number {
  const linha = banco().prepare("SELECT COUNT(*) AS total FROM conversas WHERE exemplo = 1").get() as { total: number };
  return Number(linha.total);
}

function totalConversas(): number {
  const linha = banco().prepare("SELECT COUNT(*) AS total FROM conversas").get() as { total: number };
  return Number(linha.total);
}

/**
 * Grava as conversas de exemplo quando o app ainda não tem conversa nenhuma e o número da empresa
 * não está conectado. Devolve quantas gravou (0 quando não era o caso). Só acontece uma vez: depois
 * disso, apagar as conversas de exemplo deixa o app vazio de verdade.
 */
export function semearExemplosSeVazio({ numeroConectado }: { numeroConectado: boolean }): number {
  if (numeroConectado || getConfig(CHAVE_EXEMPLOS) || totalConversas() > 0) return 0;
  const agora = Date.now();
  for (const c of conversasExemplo()) {
    const inicio = new Date(agora - (c.mensagens[0]?.atras ?? 0) * 60 * 1000);
    const fim = new Date(agora - (c.mensagens[c.mensagens.length - 1]?.atras ?? 0) * 60 * 1000);
    garantirConversa({ numero: c.numero, nome: c.nome, origem: "exemplo", exemplo: true, assunto: c.assunto, status: c.status, em: inicio });
    for (const m of c.mensagens) {
      inserirMensagem({ numero: c.numero, papel: m.papel, texto: m.texto, criadoEm: paraTextoDeBanco(new Date(agora - m.atras * 60 * 1000)) });
    }
    banco()
      .prepare("UPDATE conversas SET nao_lidas = ?, atualizado_em = ? WHERE numero = ?")
      .run(c.naoLidas ?? 0, paraTextoDeBanco(fim), c.numero);
  }
  setConfig(CHAVE_EXEMPLOS, new Date().toISOString());
  return conversasExemplo().length;
}

/** Apaga as conversas de exemplo e deixa o app no estado inicial vazio (elas não voltam depois disso). */
export function apagarExemplos(): number {
  const d = banco();
  const quantas = contarExemplos();
  d.prepare("DELETE FROM mensagens WHERE numero IN (SELECT numero FROM conversas WHERE exemplo = 1)").run();
  d.prepare("DELETE FROM conversas WHERE exemplo = 1").run();
  setConfig(CHAVE_EXEMPLOS, new Date().toISOString());
  return quantas;
}

function apagarExemplosNaPrimeiraReal(): void {
  const quantas = contarExemplos();
  if (quantas === 0) return;
  apagarExemplos();
  console.log(`Primeira conversa real do WhatsApp: ${quantas} conversas de exemplo apagadas.`);
}
