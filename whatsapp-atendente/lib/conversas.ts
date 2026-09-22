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
import { ehMotivo, MOTIVO_PADRAO, rotuloMotivo, type MotivoTransferencia } from "./transferencia";
import { PAPEIS_DE_CONVERSA, type CanalOrigem, type Conversa, type ConversaCompleta, type MensagemChat, type MensagemDaConversa, type PapelMensagem, type Periodo, type StatusConversa } from "./types";

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
  passou_por_pessoa: number;
  motivo_transferencia: string | null;
  esperando_desde: string | null;
  criado_em: string;
  atualizado_em: string;
};

/**
 * Trecho de SQL que deixa só as mensagens que são conversa de verdade (cliente, atendente, pessoa):
 * notas internas e eventos da linha do tempo moram na mesma tabela, mas não são pergunta nem resposta.
 */
const SO_CONVERSA = `papel IN (${PAPEIS_DE_CONVERSA.map((p) => `'${p}'`).join(", ")})`;

type LinhaMensagem = {
  id: number;
  numero: string;
  papel: string;
  texto: string;
  criado_em: string;
  ferramenta_usada: string | null;
  tempo_resposta_ms: number | null;
  id_externo: string | null;
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
      passou_por_pessoa INTEGER NOT NULL DEFAULT 0,
      motivo_transferencia TEXT NULL,
      esperando_desde TEXT NULL,
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
      tempo_resposta_ms INTEGER NULL,
      id_externo TEXT NULL
    )`);
    d.exec(`CREATE INDEX IF NOT EXISTS mensagens_por_conversa ON mensagens (numero, id)`);
    // Bancos anteriores à 0.3.0 não têm `id_externo` (o id da mensagem no canal, para o mesmo aviso
    // entregue duas vezes virar UMA mensagem). ALTER TABLE falha de propósito quando a coluna já existe.
    try {
      d.exec(`ALTER TABLE mensagens ADD COLUMN id_externo TEXT NULL`);
    } catch { /* coluna já existe */ }
    // Índice único PARCIAL: só as mensagens que vieram de um canal têm id externo; as do simulador,
    // do MCP e as respostas ficam NULL, e NULL não conta para a unicidade.
    d.exec(`CREATE UNIQUE INDEX IF NOT EXISTS mensagens_id_externo ON mensagens (id_externo) WHERE id_externo IS NOT NULL`);
    // Bancos criados antes da US-015 não têm a coluna; ALTER TABLE falha de propósito quando ela já existe.
    // A primeira vez recupera o passado pelo que dá para saber: o status atual e as respostas escritas por
    // uma pessoa (padrão de lib/rotinas.ts).
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN passou_por_pessoa INTEGER NOT NULL DEFAULT 0`);
      d.exec(`UPDATE conversas SET passou_por_pessoa = 1
        WHERE status IN ('atencao', 'humano')
           OR EXISTS (SELECT 1 FROM mensagens m WHERE m.numero = conversas.numero AND m.papel = 'humano')`);
    } catch { /* coluna já existe */ }
    // 0.3.0: por que a IA passou a conversa para uma pessoa, e desde quando o cliente espera por ela.
    // Conversas antigas já em `atencao` ganham o motivo padrão, para a faixa âmbar não ficar sem frase.
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN motivo_transferencia TEXT NULL`);
      d.exec(`UPDATE conversas SET motivo_transferencia = '${MOTIVO_PADRAO}' WHERE status = 'atencao'`);
    } catch { /* coluna já existe */ }
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN esperando_desde TEXT NULL`);
      d.exec(`UPDATE conversas SET esperando_desde = atualizado_em WHERE status = 'atencao'`);
    } catch { /* coluna já existe */ }
    criado = true;
  }
  return d;
}

/**
 * O mesmo banco, com as duas tabelas garantidas. Existe para lib/metricas.ts, o único outro arquivo
 * que lê `conversas`/`mensagens` por SQL — e só lê: criar tabela, migrar coluna e toda escrita
 * continuam morando aqui, para o formato dos dados ter um dono só.
 */
export function bancoDeConversas() {
  return banco();
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

/**
 * A data como o banco a guarda ("2026-09-17 14:03:00", em UTC) lida de volta em ISO. Exportada para
 * lib/metricas.ts, que também lê as duas tabelas: a conversão entre o formato do banco e o das telas
 * mora aqui, junto do formato dos dados.
 */
export function isoDeBanco(texto: string): string {
  return paraIso(texto);
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
    motivoTransferencia: ehMotivo(l.motivo_transferencia) ? l.motivo_transferencia : null,
    esperandoDesde: l.esperando_desde ? paraIso(l.esperando_desde) : null,
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

/**
 * As últimas mensagens da conversa, da mais antiga para a mais recente: a memória de curto prazo da IA.
 * Notas internas e eventos ficam de fora — a IA nunca os vê.
 */
export function historicoRecente(numero: string, limite = MAX_HISTORICO): MensagemChat[] {
  const linhas = banco()
    .prepare(`SELECT papel, texto FROM mensagens WHERE numero = ? AND ${SO_CONVERSA} ORDER BY id DESC LIMIT ?`)
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
        motivoTransferencia: registro.motivoTransferencia,
        esperandoDesde: registro.esperandoDesde,
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
  const linhas = d.prepare(`SELECT * FROM mensagens WHERE ${SO_CONVERSA} ORDER BY numero, id`).all() as LinhaMensagem[];

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

/**
 * Os dois status que querem uma pessoa na conversa. Passar por um deles, mesmo que a conversa volte
 * para a IA depois, fica gravado na coluna `passou_por_pessoa` — é o que lib/metricas.ts conta como
 * "passada para uma pessoa", que o status de agora sozinho não contaria.
 */
function precisouDePessoa(status: StatusConversa): boolean {
  return status === "atencao" || status === "humano";
}

/** Trecho de SQL que soma a marca de "passou por uma pessoa" a um UPDATE de status, quando for o caso. */
function marcaDePessoa(status: StatusConversa): string {
  return precisouDePessoa(status) ? ", passou_por_pessoa = 1" : "";
}

function inserirMensagem({
  numero,
  papel,
  texto,
  criadoEm,
  ferramentaUsada,
  tempoRespostaMs,
  idExterno,
}: {
  numero: string;
  papel: PapelMensagem;
  texto: string;
  criadoEm?: string;
  ferramentaUsada?: string;
  tempoRespostaMs?: number;
  idExterno?: string;
}): number {
  const gravada = banco()
    .prepare("INSERT INTO mensagens (numero, papel, texto, criado_em, ferramenta_usada, tempo_resposta_ms, id_externo) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(numero, papel, texto, criadoEm ?? paraTextoDeBanco(), ferramentaUsada ?? null, tempoRespostaMs ?? null, idExterno ?? null);
  return Number(gravada.lastInsertRowid);
}

/** A mensagem já gravada com este id do canal, se o mesmo aviso já tiver chegado antes. */
function mensagemPorIdExterno(idExterno: string): { id: number; numero: string } | undefined {
  return banco().prepare("SELECT id, numero FROM mensagens WHERE id_externo = ?").get(idExterno) as { id: number; numero: string } | undefined;
}

/** Cria a conversa se ela ainda não existir e devolve o registro atual. */
export function garantirConversa({
  numero,
  origem = "simulador",
  nome = "",
  exemplo = false,
  assunto = null,
  status = "ia",
  motivo = null,
  em,
}: {
  numero: string;
  origem?: CanalOrigem;
  nome?: string;
  exemplo?: boolean;
  assunto?: string | null;
  status?: StatusConversa;
  /** Por que a conversa já nasce esperando uma pessoa (só as de exemplo nascem assim). */
  motivo?: MotivoTransferencia | null;
  /** Momento de criação, para as conversas de exemplo nascerem espalhadas nos últimos dias (US-004). */
  em?: Date;
}): ConversaRegistro {
  const existente = linha(numero);
  if (!existente) {
    const quando = paraTextoDeBanco(em);
    const esperando = status === "atencao";
    banco()
      .prepare(
        `INSERT INTO conversas (numero, nome, origem, status, assunto, exemplo, nao_lidas, passou_por_pessoa, motivo_transferencia, esperando_desde, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
      )
      .run(numero, nome, origem, status, assunto, exemplo ? 1 : 0, precisouDePessoa(status) ? 1 : 0, esperando ? (motivo ?? MOTIVO_PADRAO) : null, esperando ? quando : null, quando, quando);
  } else if (nome && !existente.nome) {
    banco().prepare("UPDATE conversas SET nome = ? WHERE numero = ?").run(nome, numero);
  }
  return obterRegistro(numero) as ConversaRegistro;
}

/** O que `registrarMensagemCliente` devolve: a conversa, o id da mensagem e se ela já estava gravada. */
export type MensagemClienteRegistrada = ConversaRegistro & {
  /** Id da mensagem gravada (ou da já existente, quando `duplicada`). */
  mensagemId: number;
  /**
   * O mesmo aviso do canal já tinha chegado (mesmo `idExterno`): nada foi gravado e ninguém deve
   * responder de novo. A z-api reenvia o aviso quando a resposta demora, e a Meta também.
   */
  duplicada: boolean;
};

/**
 * Grava uma mensagem do cliente e devolve o status da conversa depois dela. Uma conversa resolvida
 * reabre como atendida pela IA; uma em atendimento humano continua humana e soma uma não lida (é o
 * que faz a IA não responder, em lib/atendente.ts).
 *
 * Com `idExterno` (o id da mensagem no canal), uma mensagem que já exista é ignorada em silêncio: a
 * conversa volta como está, com `duplicada: true`, sem gravar nada e sem mexer em não lidas ou datas.
 */
export function registrarMensagemCliente({
  numero,
  texto,
  origem = "simulador",
  nome,
  em,
  idExterno,
}: {
  numero: string;
  texto: string;
  origem?: CanalOrigem;
  nome?: string;
  em?: Date;
  idExterno?: string;
}): MensagemClienteRegistrada {
  if (idExterno) {
    const existente = mensagemPorIdExterno(idExterno);
    if (existente) {
      const registro = obterRegistro(existente.numero) as ConversaRegistro;
      return { ...registro, mensagemId: existente.id, duplicada: true };
    }
  }
  // A primeira conversa real do WhatsApp aposenta a demonstração, antes de qualquer gravação.
  if (origem === "whatsapp") apagarExemplosNaPrimeiraReal();
  const nova = !linha(numero);
  const atual = garantirConversa({ numero, origem, nome, em });
  const gravado = (linha(numero) as LinhaConversa).status as StatusConversa;
  const status: StatusConversa = gravado === "resolvida" ? "ia" : gravado;
  const naoLidas = status === "humano" ? atual.naoLidas + 1 : atual.naoLidas;
  // A origem de uma conversa de exemplo não muda: ela continua marcada como exemplo até ser apagada.
  const origemFinal = atual.exemplo ? atual.origem : origem;
  const quando = paraTextoDeBanco(em);
  // Cliente escreveu numa conversa que uma pessoa cuida: a espera por ela começa agora, se ainda não
  // tinha começado (uma segunda mensagem não reinicia a contagem).
  const esperando = status === "humano" ? "COALESCE(esperando_desde, ?)" : "esperando_desde";
  banco()
    .prepare(`UPDATE conversas SET status = ?, nao_lidas = ?, origem = ?, atualizado_em = ?, esperando_desde = ${esperando} WHERE numero = ?`)
    .run(...(status === "humano" ? [status, naoLidas, origemFinal, quando, quando, numero] : [status, naoLidas, origemFinal, quando, numero]));
  // Uma conversa que estava resolvida (gravada assim, ou lida assim por ter passado 24 h) reabre: a
  // linha do tempo marca isso antes da mensagem que reabriu.
  if (!nova && atual.status === "resolvida") registrarEvento(numero, "Conversa reaberta pelo cliente", em);
  const mensagemId = inserirMensagem({ numero, papel: "cliente", texto, criadoEm: quando, idExterno });
  return { ...(obterRegistro(numero) as ConversaRegistro), mensagemId, duplicada: false };
}

/**
 * As mensagens do cliente que ainda não receberam resposta: tudo o que ele escreveu depois da última
 * mensagem do atendente (ou de uma pessoa), da mais antiga para a mais recente. É a "sequência" que a
 * IA responde de uma vez depois de uma rajada (lib/rajada.ts); vazia quando a última mensagem da
 * conversa não é do cliente.
 */
export function mensagensSemResposta(numero: string): MensagemRegistro[] {
  const linhas = banco()
    .prepare(
      `SELECT * FROM mensagens WHERE numero = ? AND papel = 'cliente'
         AND id > COALESCE((SELECT MAX(id) FROM mensagens WHERE numero = ? AND papel IN ('atendente', 'humano')), 0)
       ORDER BY id`
    )
    .all(numero, numero) as LinhaMensagem[];
  return linhas.map(paraMensagem);
}

/** Id da última mensagem do cliente nesta conversa; null quando ele nunca escreveu. */
export function ultimaMensagemDoClienteId(numero: string): number | null {
  const l = banco().prepare("SELECT id FROM mensagens WHERE numero = ? AND papel = 'cliente' ORDER BY id DESC LIMIT 1").get(numero) as { id: number } | undefined;
  return l ? Number(l.id) : null;
}

/**
 * Grava a resposta do atendente virtual. Com `transferir`, a conversa passa a precisar de atenção: o
 * motivo e o começo da espera ficam gravados, e a linha do tempo ganha "{atendente} pediu ajuda de uma
 * pessoa · {motivo}". Sem `transferir`, a IA está cuidando da conversa de novo e os dois campos zeram.
 */
export function registrarResposta({
  numero,
  texto,
  transferir = false,
  motivo,
  atendente,
  ferramentaUsada,
  tempoRespostaMs,
  em,
}: {
  numero: string;
  texto: string;
  transferir?: boolean;
  /** Por que transferiu (lib/transferencia.ts); sem ele, o motivo padrão. Ignorado sem `transferir`. */
  motivo?: MotivoTransferencia | null;
  /** Nome do atendente virtual, para o evento da linha do tempo. */
  atendente?: string;
  ferramentaUsada?: string;
  tempoRespostaMs?: number;
  em?: Date;
}): void {
  const quando = paraTextoDeBanco(em);
  const status: StatusConversa = transferir ? "atencao" : "ia";
  const motivoFinal = transferir ? motivo ?? MOTIVO_PADRAO : null;
  banco()
    .prepare(`UPDATE conversas SET status = ?, atualizado_em = ?, motivo_transferencia = ?, esperando_desde = ?${marcaDePessoa(status)} WHERE numero = ?`)
    .run(status, quando, motivoFinal, transferir ? quando : null, numero);
  inserirMensagem({ numero, papel: "atendente", texto, criadoEm: quando, ferramentaUsada, tempoRespostaMs });
  if (motivoFinal) registrarEvento(numero, `${atendente?.trim() || "O atendente"} pediu ajuda de uma pessoa · ${rotuloMotivo(motivoFinal)}`, em);
}

/**
 * Uma linha da linha do tempo ("Você assumiu a conversa", "Marcada como resolvida"). Só existe para
 * quem olha a conversa na tela: não muda status, não lidas nem `atualizado_em` (a ação que a gerou já
 * mexeu no que tinha que mexer), não vai para a IA e nunca sai pelo número da empresa.
 */
export function registrarEvento(numero: string, texto: string, em?: Date): number {
  return inserirMensagem({ numero, papel: "evento", texto, criadoEm: paraTextoDeBanco(em) });
}

/**
 * Grava a resposta escrita por uma pessoa: a conversa fica (ou passa a ficar) em atendimento humano.
 * Devolve o id da mensagem gravada — a tela precisa dele para marcar a bolha quando o envio pelo
 * número real falha depois da gravação (a mensagem existe, mas o cliente não a recebeu).
 */
export function registrarMensagemHumana(numero: string, texto: string): number {
  garantirConversa({ numero });
  const quando = paraTextoDeBanco();
  // Uma pessoa respondeu: o cliente não está mais esperando por ela.
  banco().prepare("UPDATE conversas SET status = 'humano', nao_lidas = 0, passou_por_pessoa = 1, esperando_desde = NULL, atualizado_em = ? WHERE numero = ?").run(quando, numero);
  return inserirMensagem({ numero, papel: "humano", texto, criadoEm: quando });
}

/**
 * Grava o assunto da conversa (lib/atendente.ts:classificarConversa). Como `marcarLido`, não encosta
 * em `atualizado_em`: separar por assunto não é novidade na conversa e não deve fazê-la pular para o
 * topo da lista.
 */
export function definirAssunto(numero: string, assunto: string): void {
  banco().prepare("UPDATE conversas SET assunto = ? WHERE numero = ?").run(assunto, numero);
}

/**
 * Zera as mensagens não lidas (alguém abriu a conversa na tela). Não encosta em `atualizado_em`: ler
 * uma conversa não é novidade nela, e mexer na data a faria pular para o topo da lista a cada leitura.
 */
export function marcarLido(numero: string): void {
  banco().prepare("UPDATE conversas SET nao_lidas = 0 WHERE numero = ?").run(numero);
}

function mudarStatus(
  numero: string,
  status: StatusConversa,
  { zerarNaoLidas = false, zerarEspera = false, zerarMotivo = false, evento }: { zerarNaoLidas?: boolean; zerarEspera?: boolean; zerarMotivo?: boolean; evento?: string } = {}
): boolean {
  const d = banco();
  if (!linha(numero)) return false;
  const extras = `${zerarNaoLidas ? ", nao_lidas = 0" : ""}${zerarEspera ? ", esperando_desde = NULL" : ""}${zerarMotivo ? ", motivo_transferencia = NULL" : ""}${marcaDePessoa(status)}`;
  d.prepare(`UPDATE conversas SET status = ?, atualizado_em = ?${extras} WHERE numero = ?`).run(status, paraTextoDeBanco(), numero);
  if (evento) registrarEvento(numero, evento);
  return true;
}

/**
 * Uma pessoa assumiu a conversa: a IA para de responder e as não lidas zeram. A espera do cliente
 * continua contando — assumir não é responder — e o motivo da transferência fica, para quem abrir a
 * conversa ainda saber por que ela chegou aqui.
 */
export function assumir(numero: string): void {
  mudarStatus(numero, "humano", { zerarNaoLidas: true, evento: "Você assumiu a conversa" });
}

/** A IA volta a cuidar da conversa: motivo e espera zeram, e a linha do tempo diz para quem ela voltou. */
export function devolver(numero: string, atendente?: string): void {
  mudarStatus(numero, "ia", { zerarEspera: true, zerarMotivo: true, evento: `Conversa devolvida para ${atendente?.trim() || "o atendente virtual"}` });
}

export function resolver(numero: string): void {
  mudarStatus(numero, "resolvida", { zerarNaoLidas: true, zerarEspera: true, evento: "Marcada como resolvida" });
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
export function semearExemplosSeVazio({ numeroConectado, atendente = "Bia" }: { numeroConectado: boolean; atendente?: string }): number {
  if (numeroConectado || getConfig(CHAVE_EXEMPLOS) || totalConversas() > 0) return 0;
  const agora = Date.now();
  for (const c of conversasExemplo()) {
    const inicio = new Date(agora - (c.mensagens[0]?.atras ?? 0) * 60 * 1000);
    const fim = new Date(agora - (c.mensagens[c.mensagens.length - 1]?.atras ?? 0) * 60 * 1000);
    garantirConversa({ numero: c.numero, nome: c.nome, origem: "exemplo", exemplo: true, assunto: c.assunto, status: c.status, motivo: c.motivo, em: inicio });
    for (const m of c.mensagens) {
      const quando = new Date(agora - m.atras * 60 * 1000);
      inserirMensagem({
        numero: c.numero,
        papel: m.papel,
        texto: m.texto,
        criadoEm: paraTextoDeBanco(quando),
        tempoRespostaMs: m.respostaMs,
      });
      // A linha do tempo da demonstração: a primeira resposta de uma pessoa é o momento em que ela assumiu.
      if (m.papel === "humano" && !c.mensagens.slice(0, c.mensagens.indexOf(m)).some((x) => x.papel === "humano")) {
        registrarEvento(c.numero, "Você assumiu a conversa", quando);
      }
    }
    if (c.status === "atencao") {
      registrarEvento(c.numero, `${atendente} pediu ajuda de uma pessoa · ${rotuloMotivo(c.motivo ?? MOTIVO_PADRAO)}`, fim);
    }
    banco()
      .prepare("UPDATE conversas SET nao_lidas = ?, atualizado_em = ?, esperando_desde = ? WHERE numero = ?")
      .run(c.naoLidas ?? 0, paraTextoDeBanco(fim), c.status === "atencao" ? paraTextoDeBanco(fim) : null, c.numero);
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

/**
 * Limpa de uma vez o que era só teste — as conversas de exemplo e a conversa do simulador — quando o app
 * termina de ser configurado (IA conectada E número conectado). Roda UMA única vez: quem testa no
 * simulador depois de conectar não pode ver a conversa sumir nas costas dele.
 *
 * Os dois sinais chegam de fora (`lib/ai.ts` e `lib/whatsapp.ts`) em vez de serem lidos aqui, pelo mesmo
 * motivo de `semearExemplosSeVazio`: este arquivo é o dono das tabelas de conversa e não depende das
 * outras camadas do app.
 */
export function limparTestesSeConfigurado({ iaConectada, numeroConectado }: { iaConectada: boolean; numeroConectado: boolean }): number {
  if (!iaConectada || !numeroConectado) return 0;
  if (getConfig(CHAVE_TESTES_LIMPOS)) return 0;
  const quantas = contarExemplos() + (obterRegistro(NUMERO_SIMULADOR) ? 1 : 0);
  apagarExemplos();
  apagarConversa(NUMERO_SIMULADOR);
  setConfig(CHAVE_TESTES_LIMPOS, new Date().toISOString());
  if (quantas > 0) console.log(`App configurado: ${quantas} conversas de teste apagadas (exemplos e simulador).`);
  return quantas;
}

const CHAVE_TESTES_LIMPOS = "CONVERSAS_TESTE_LIMPAS";

/** O número fixo que `POST /api/simular` usa: é uma conversa de teste, não um telefone (ver lib/rotulos.ts). */
const NUMERO_SIMULADOR = "simulador";

function apagarExemplosNaPrimeiraReal(): void {
  const quantas = contarExemplos();
  if (quantas === 0) return;
  apagarExemplos();
  console.log(`Primeira conversa real do WhatsApp: ${quantas} conversas de exemplo apagadas.`);
}
