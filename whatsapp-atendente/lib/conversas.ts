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
import { anexosDeMensagens, apagarDeMensagens, registrarAnexo } from "./anexos";
import { conversasExemplo } from "./demo";
import { textoParaIA } from "./midia";
import { publicar } from "./eventos";
import { abrirBanco, getConfig, setConfig } from "./store";
import { erroDeEtiqueta, normalizarEtiqueta, proximaCor } from "./etiquetas";
import { ehMotivo, MOTIVO_PADRAO, notaDaTransferencia, rotuloMotivo, type MotivoTransferencia } from "./transferencia";
import {
  MAX_ETIQUETAS,
  MAX_ETIQUETAS_POR_CONVERSA,
  PAPEIS_DE_CONVERSA,
  type CanalOrigem,
  type Conversa,
  type ConversaCompleta,
  type DetalhesResposta,
  type MensagemChat,
  type MensagemDaConversa,
  type PapelMensagem,
  type Periodo,
  type Etiqueta,
  type EtiquetaEmUso,
  type StatusConversa,
  type StatusEntrega,
} from "./types";

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
  resumo: string | null;
  resumo_ate_id: number | null;
  etiquetas: string;
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
  status_entrega: string | null;
  erro_envio: string | null;
  detalhes: string | null;
};

// Os dois tipos que saem deste arquivo moram em lib/types.ts (arquivo client-safe, sem node:sqlite):
// a conversa aberta é desenhada por um Client Component, e uma definição só evita que o formato do
// banco e o formato da tela andem em ritmos diferentes.

/**
 * Uma conversa como ela está no banco, sem as mensagens (para isso, veja `obterConversa`). O contato
 * fica de fora porque a tabela `contatos` tem outro dono (lib/memoria.ts): quem junta os dois é a
 * rota, por `comContato`, e não uma consulta cruzada daqui.
 */
export type ConversaRegistro = Omit<ConversaCompleta, "mensagens" | "contato">;

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
      resumo TEXT NULL,
      resumo_ate_id INTEGER NULL,
      etiquetas TEXT NOT NULL DEFAULT '[]',
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
      id_externo TEXT NULL,
      status_entrega TEXT NULL,
      erro_envio TEXT NULL,
      detalhes TEXT NULL
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
    // 0.3.0 (US-003): até onde a mensagem que saiu pelo número da empresa chegou, e por que não saiu.
    // Mensagens anteriores ficam NULL (um tique na tela): ninguém sabe se elas chegaram.
    try {
      d.exec(`ALTER TABLE mensagens ADD COLUMN status_entrega TEXT NULL`);
    } catch { /* coluna já existe */ }
    try {
      d.exec(`ALTER TABLE mensagens ADD COLUMN erro_envio TEXT NULL`);
    } catch { /* coluna já existe */ }
    // 0.3.0 (US-010): como a resposta foi montada (fontes, ferramentas, tempo, modelo), em JSON. As
    // respostas anteriores ficam NULL e simplesmente não mostram o "Por que respondeu assim".
    try {
      d.exec(`ALTER TABLE mensagens ADD COLUMN detalhes TEXT NULL`);
    } catch { /* coluna já existe */ }
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
    // 0.3.0 (US-011): o resumo do começo de uma conversa longa e até que mensagem ele já cobre
    // (lib/memoria.ts). Conversas antigas ficam sem resumo e o ganham na primeira vez que passarem do
    // tamanho do histórico — não há o que recuperar do passado aqui.
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN resumo TEXT NULL`);
    } catch { /* coluna já existe */ }
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN resumo_ate_id INTEGER NULL`);
    } catch { /* coluna já existe */ }
    // 0.3.0 (US-016): as etiquetas da equipe nesta conversa, em JSON (`["orçamento"]`). A lista de
    // etiquetas da instância, com a cor de cada uma, mora na chave `ETIQUETAS` (getConfig/setConfig):
    // aqui ficam só os nomes, para renomear ou recolorir uma etiqueta não obrigar a reescrever linha.
    try {
      d.exec(`ALTER TABLE conversas ADD COLUMN etiquetas TEXT NOT NULL DEFAULT '[]'`);
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
    resumo: l.resumo?.trim() ? l.resumo : null,
    etiquetas: lerEtiquetas(l.etiquetas),
  };
}

/** Os nomes gravados na coluna; lista vazia quando a conversa é anterior à coluna ou o JSON não abre. */
function lerEtiquetas(bruto: string | null): string[] {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto) as unknown;
    return Array.isArray(lista) ? lista.filter((n): n is string => typeof n === "string") : [];
  } catch (err) {
    console.error("Não foi possível ler as etiquetas de uma conversa:", err);
    return [];
  }
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
    statusEntrega: ehStatusEntrega(l.status_entrega) ? l.status_entrega : undefined,
    erroEnvio: l.erro_envio ?? undefined,
    detalhes: lerDetalhes(l.detalhes),
  };
}

/** Os detalhes gravados em JSON; `undefined` na resposta antiga (coluna nula) e no JSON que não abre. */
function lerDetalhes(bruto: string | null): DetalhesResposta | undefined {
  if (!bruto) return undefined;
  try {
    return JSON.parse(bruto) as DetalhesResposta;
  } catch (err) {
    console.error("Não foi possível ler os detalhes de uma resposta:", err);
    return undefined;
  }
}

/** Uma mensagem desta conversa pelo id; null quando não existe ou é de outra conversa. */
export function obterMensagem(numero: string, id: number): MensagemRegistro | null {
  const l = banco().prepare("SELECT * FROM mensagens WHERE numero = ? AND id = ?").get(numero, id) as LinhaMensagem | undefined;
  return l ? paraMensagem(l) : null;
}

/** A conversa inteira, da mensagem mais antiga para a mais recente; null quando o número não existe. */
export function obterConversa(numero: string): ConversaCompleta | null {
  const registro = obterRegistro(numero);
  if (!registro) return null;
  const linhas = banco().prepare("SELECT * FROM mensagens WHERE numero = ? ORDER BY id").all(numero) as LinhaMensagem[];
  // Os anexos (lib/anexos.ts) vêm numa consulta só, e não uma por bolha: é o áudio, a foto ou o
  // arquivo que o cliente mandou, e sem eles a conversa mostraria só o texto entre colchetes.
  const anexos = anexosDeMensagens(linhas.map((l) => Number(l.id)));
  return {
    ...registro,
    // O que o atendente lembra deste cliente mora noutra tabela, com outro dono: quem preenche esta
    // linha é a rota (lib/memoria.ts:comContato), para este arquivo não consultar `contatos`.
    contato: null,
    mensagens: linhas.map((l) => {
      const mensagem = paraMensagem(l);
      const doAnexo = anexos.get(mensagem.id);
      return doAnexo ? { ...mensagem, anexos: doAnexo } : mensagem;
    }),
  };
}

/**
 * As últimas mensagens da conversa, da mais antiga para a mais recente: a memória de curto prazo da IA.
 * Notas internas e eventos ficam de fora — a IA nunca os vê.
 *
 * O texto de uma mensagem com anexo já entendido vem com a transcrição no lugar do marcador entre
 * colchetes (lib/midia.ts:textoParaIA): é isso que faz a IA responder ao que o cliente FALOU no áudio,
 * e não a "[Áudio de 12 s]". Sem transcrição gravada, o texto sai como está.
 */
export function historicoRecente(numero: string, limite = MAX_HISTORICO): MensagemChat[] {
  const linhas = banco()
    .prepare(`SELECT id, papel, texto FROM mensagens WHERE numero = ? AND ${SO_CONVERSA} ORDER BY id DESC LIMIT ?`)
    .all(numero, limite) as { id: number; papel: string; texto: string }[];
  const anexos = anexosDeMensagens(linhas.map((l) => Number(l.id)));
  return linhas.reverse().map((l) => ({
    papel: l.papel as PapelMensagem,
    texto: textoParaIA({ texto: l.texto, anexos: anexos.get(Number(l.id)) }),
  }));
}

function hora(texto: string): string {
  return paraData(texto).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type LinhaLista = LinhaConversa & {
  ultima_cliente: string | null;
  ultima_cliente_em: string | null;
  ultima_resposta: string | null;
  tem_notas: number;
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
  /** Só as conversas com esta etiqueta (uma por vez, como a linha de chips da tela). */
  etiqueta?: string;
}

/** As conversas da mais recente para a mais antiga, com a última pergunta e a última resposta de cada. */
export function listarConversas({ desde, status, busca, etiqueta }: FiltroConversas = {}): Conversa[] {
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
        (SELECT texto FROM mensagens m WHERE m.numero = c.numero AND m.papel IN ('atendente', 'humano') ORDER BY m.id DESC LIMIT 1) AS ultima_resposta,
        EXISTS (SELECT 1 FROM mensagens m WHERE m.numero = c.numero AND m.papel = 'nota') AS tem_notas
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
        temNotas: Number(l.tem_notas) > 0,
        etiquetas: registro.etiquetas,
      } satisfies Conversa;
    })
    // O status filtrado é o da leitura, então o filtro vem depois do banco, nunca no WHERE. A etiqueta
    // é filtrada aqui pelo mesmo motivo prático: os nomes moram num JSON, não numa coluna por etiqueta.
    .filter((c) => (!status || c.status === status) && (!etiqueta || c.etiquetas.includes(etiqueta)));
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

/**
 * Avisa as telas abertas de que esta conversa mudou (lib/eventos.ts). Toda escrita deste arquivo passa
 * por aqui: é o que faz uma mensagem nova aparecer na hora, em vez de esperar a próxima consulta.
 */
function avisarConversa(numero: string | undefined | null): void {
  if (numero) publicar({ tipo: "conversa", numero });
}

/** A qual conversa esta mensagem pertence — os avisos de entrega chegam pelo id da mensagem, não pelo número. */
function numeroDaMensagem(mensagemId: number): string | undefined {
  const l = banco().prepare("SELECT numero FROM mensagens WHERE id = ?").get(mensagemId) as { numero: string } | undefined;
  return l?.numero;
}

function inserirMensagem({
  numero,
  papel,
  texto,
  criadoEm,
  ferramentaUsada,
  tempoRespostaMs,
  idExterno,
  statusEntrega,
  detalhes,
}: {
  numero: string;
  papel: PapelMensagem;
  texto: string;
  criadoEm?: string;
  ferramentaUsada?: string;
  tempoRespostaMs?: number;
  idExterno?: string;
  statusEntrega?: StatusEntrega;
  detalhes?: DetalhesResposta;
}): number {
  const gravada = banco()
    .prepare(
      "INSERT INTO mensagens (numero, papel, texto, criado_em, ferramenta_usada, tempo_resposta_ms, id_externo, status_entrega, detalhes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(numero, papel, texto, criadoEm ?? paraTextoDeBanco(), ferramentaUsada ?? null, tempoRespostaMs ?? null, idExterno ?? null, statusEntrega ?? null, detalhes ? JSON.stringify(detalhes) : null);
  avisarConversa(numero);
  return Number(gravada.lastInsertRowid);
}

/**
 * Com que status uma mensagem que acabou de ser escrita para o cliente nasce: `enviando` quando a
 * conversa é de um número real (o envio vem logo depois da gravação e vai confirmar ou falhar), e
 * nenhum nos outros canais — no simulador, no assistente por MCP e nas conversas de exemplo a
 * mensagem nunca sai do app, e um status ali diria algo que não aconteceu.
 */
function statusInicialDeEnvio(numero: string): StatusEntrega | undefined {
  return linha(numero)?.origem === "whatsapp" ? "enviando" : undefined;
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
  // Com os anexos: é sobre esta lista que lib/midia.ts decide o que precisa ser ouvido, olhado ou lido
  // antes de a IA responder à sequência.
  const anexos = anexosDeMensagens(linhas.map((l) => Number(l.id)));
  return linhas.map((l) => {
    const mensagem = paraMensagem(l);
    const doAnexo = anexos.get(mensagem.id);
    return doAnexo ? { ...mensagem, anexos: doAnexo } : mensagem;
  });
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
  detalhes,
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
  /** Como a resposta foi montada (lib/atendente.ts), para o bloco "Por que respondeu assim". */
  detalhes?: DetalhesResposta;
  em?: Date;
}): number {
  const quando = paraTextoDeBanco(em);
  const status: StatusConversa = transferir ? "atencao" : "ia";
  const motivoFinal = transferir ? motivo ?? MOTIVO_PADRAO : null;
  banco()
    .prepare(`UPDATE conversas SET status = ?, atualizado_em = ?, motivo_transferencia = ?, esperando_desde = ?${marcaDePessoa(status)} WHERE numero = ?`)
    .run(status, quando, motivoFinal, transferir ? quando : null, numero);
  const mensagemId = inserirMensagem({ numero, papel: "atendente", texto, criadoEm: quando, ferramentaUsada, tempoRespostaMs, detalhes, statusEntrega: statusInicialDeEnvio(numero) });
  if (motivoFinal) {
    registrarEvento(numero, `${atendente?.trim() || "O atendente"} pediu ajuda de uma pessoa · ${rotuloMotivo(motivoFinal)}`, em);
    // Além do evento, o atendente deixa uma NOTA interna com o motivo e a pergunta que o travou: quem
    // assume a conversa lê a razão em texto corrido, ao lado das mensagens, sem ter que deduzi-la do
    // rótulo do motivo. O cliente não vê nenhuma das duas.
    registrarNota(numero, notaDaTransferencia({ motivo: motivoFinal, pergunta: ultimaPerguntaDoCliente(numero), atendente }), em);
  }
  // A conversa passou a esperar por uma pessoa: o contador do cabeçalho e o painel do dia mudam junto.
  if (transferir) publicar({ tipo: "atencao", numero });
  return mensagemId;
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
 * Uma anotação da equipe dentro da conversa: só quem abre o app a vê. Ela não é mensagem de ninguém
 * para ninguém — não sai pelo número da empresa, não conta como não lida, não muda o status nem a
 * última mensagem da lista, e a IA nunca a lê (`historicoRecente` filtra por papel). Quem a escreve é
 * a equipe (`POST /api/conversas/[numero]/notas`) ou o próprio atendente virtual ao transferir.
 */
export function registrarNota(numero: string, texto: string, em?: Date): number {
  return inserirMensagem({ numero, papel: "nota", texto, criadoEm: paraTextoDeBanco(em) });
}

/** Apaga uma nota interna; `false` quando o id não é uma nota desta conversa (outra aba já a apagou). */
export function apagarNota(numero: string, id: number): boolean {
  const apagada = banco().prepare("DELETE FROM mensagens WHERE id = ? AND numero = ? AND papel = 'nota'").run(id, numero);
  if (!apagada.changes) return false;
  avisarConversa(numero);
  return true;
}

/** A última coisa que o cliente escreveu nesta conversa: é a pergunta citada na nota da transferência. */
function ultimaPerguntaDoCliente(numero: string): string | null {
  const l = banco().prepare("SELECT texto FROM mensagens WHERE numero = ? AND papel = 'cliente' ORDER BY id DESC LIMIT 1").get(numero) as
    | { texto: string }
    | undefined;
  return l?.texto ?? null;
}

/** A mesma frase para os dois caminhos de assumir: o seletor "Quem atende" e responder pelo campo. */
const EVENTO_ASSUMIU = "Você assumiu a conversa";

/**
 * Grava a resposta escrita por uma pessoa: a conversa fica (ou passa a ficar) em atendimento humano.
 * Devolve o id da mensagem gravada — a tela precisa dele para marcar a bolha quando o envio pelo
 * número real falha depois da gravação (a mensagem existe, mas o cliente não a recebeu).
 */
export function registrarMensagemHumana(numero: string, texto: string): number {
  garantirConversa({ numero });
  // Responder JÁ é assumir: quem escreve pelo número da empresa passa a cuidar da conversa, e a linha
  // do tempo registra isso do mesmo jeito que registraria um clique no seletor "Quem atende" — quem
  // abrir a conversa depois precisa saber a partir de onde a IA parou de responder.
  const assumindoAgora = linha(numero)?.status !== "humano";
  if (assumindoAgora) registrarEvento(numero, EVENTO_ASSUMIU);
  const quando = paraTextoDeBanco();
  // Uma pessoa respondeu: o cliente não está mais esperando por ela.
  banco().prepare("UPDATE conversas SET status = 'humano', nao_lidas = 0, passou_por_pessoa = 1, esperando_desde = NULL, atualizado_em = ? WHERE numero = ?").run(quando, numero);
  return inserirMensagem({ numero, papel: "humano", texto, criadoEm: quando, statusEntrega: statusInicialDeEnvio(numero) });
}

// --- Entrega das mensagens enviadas -----------------------------------------------------------
// O que saiu pelo número da empresa passa por `enviando` → `enviada` (o provedor aceitou) → `entregue`
// (chegou ao aparelho) → `lida`, ou cai em `falhou`. Os dois primeiros passos o app sabe sozinho
// (o retorno do `send-text`); os dois seguintes chegam pelo aviso de status da z-api
// (app/webhook/zapi/route.ts), pelo `id_externo` que o envio devolveu. A Meta não tem esse aviso aqui,
// então uma mensagem dela para em `enviada`.

/** Ordem dos status: um aviso só avança a entrega, nunca volta (o `READ` chega antes do `RECEIVED` às vezes). */
const ORDEM_ENTREGA: Record<StatusEntrega, number> = { falhou: 0, enviando: 0, enviada: 1, entregue: 2, lida: 3 };

function ehStatusEntrega(valor: string | null): valor is StatusEntrega {
  return valor !== null && valor in ORDEM_ENTREGA;
}

/**
 * O provedor aceitou a mensagem: `enviada`, com o id que ele deu a ela (é por esse id que os avisos de
 * status chegam). Um id que já esteja em outra mensagem (não deveria acontecer; o índice é único) não
 * pode deixar esta em `enviando` para sempre: ela fica `enviada` sem id, e o caso vai para o log.
 */
export function marcarEnviada(mensagemId: number, idExterno?: string): void {
  const d = banco();
  try {
    d.prepare("UPDATE mensagens SET status_entrega = 'enviada', id_externo = COALESCE(?, id_externo), erro_envio = NULL WHERE id = ?").run(idExterno ?? null, mensagemId);
  } catch (err) {
    console.error(`O id ${idExterno} do provedor já pertence a outra mensagem; a mensagem ${mensagemId} fica enviada sem id.`, err);
    d.prepare("UPDATE mensagens SET status_entrega = 'enviada', erro_envio = NULL WHERE id = ?").run(mensagemId);
  }
  avisarConversa(numeroDaMensagem(mensagemId));
}

/** O provedor recusou (ou a rede caiu): `falhou`, com a frase de negócio que a bolha mostra abaixo da mensagem. */
export function marcarFalhaEnvio(mensagemId: number, erro: string): void {
  banco().prepare("UPDATE mensagens SET status_entrega = 'falhou', erro_envio = ? WHERE id = ?").run(erro, mensagemId);
  avisarConversa(numeroDaMensagem(mensagemId));
}

/**
 * Um aviso de status do canal para a mensagem com este id externo. Só avança: `lida` nunca volta para
 * `entregue`, mesmo que os avisos cheguem fora de ordem. Devolve `false` quando nenhuma mensagem tem
 * esse id — o que acontece com o que a equipe manda direto do celular da empresa, que não passou pelo app.
 */
export function atualizarEntrega(idExterno: string, status: Exclude<StatusEntrega, "enviando" | "falhou">): boolean {
  // Só o que saiu pelo número da empresa: o id de uma mensagem do cliente também mora em `id_externo`,
  // e um aviso sobre ela (não deveria vir, mas o canal é externo) não pode ganhar status de entrega.
  const atual = banco()
    .prepare("SELECT id, numero, status_entrega FROM mensagens WHERE id_externo = ? AND papel IN ('atendente', 'humano')")
    .get(idExterno) as { id: number; numero: string; status_entrega: string | null } | undefined;
  if (!atual) return false;
  const de = ehStatusEntrega(atual.status_entrega) ? atual.status_entrega : "enviando";
  if (ORDEM_ENTREGA[status] <= ORDEM_ENTREGA[de]) return true;
  banco().prepare("UPDATE mensagens SET status_entrega = ?, erro_envio = NULL WHERE id = ?").run(status, atual.id);
  avisarConversa(atual.numero);
  return true;
}

/**
 * Grava o assunto da conversa (lib/atendente.ts:classificarConversa). Como `marcarLido`, não encosta
 * em `atualizado_em`: separar por assunto não é novidade na conversa e não deve fazê-la pular para o
 * topo da lista.
 */
export function definirAssunto(numero: string, assunto: string): void {
  banco().prepare("UPDATE conversas SET assunto = ? WHERE numero = ?").run(assunto, numero);
  avisarConversa(numero);
}

// --- Etiquetas ------------------------------------------------------------------------------
//
// Duas coisas, no mesmo assunto: a LISTA da instância (o nome e a cor de cada etiqueta que a equipe
// já criou, na chave `ETIQUETAS`) e as etiquetas DE CADA CONVERSA (só os nomes, na coluna JSON). A
// lista não é um cadastro que alguém preencha antes: uma etiqueta nasce na primeira vez que é escrita
// no painel do contato, e a cor vem da paleta, na ordem (lib/etiquetas.ts).

const CHAVE_ETIQUETAS = "ETIQUETAS";

/** As etiquetas da instância, na ordem em que foram criadas (que é a ordem das cores da paleta). */
export function etiquetasDaEmpresa(): Etiqueta[] {
  const bruto = getConfig(CHAVE_ETIQUETAS);
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((e): e is Etiqueta => Boolean(e) && typeof (e as Etiqueta).nome === "string")
      .map((e, i) => ({ nome: e.nome, cor: e.cor ?? proximaCor(i) }));
  } catch (err) {
    console.error("Não foi possível ler a lista de etiquetas:", err);
    return [];
  }
}

/** As etiquetas da instância com quantas conversas usam cada uma (a linha de filtro e o diálogo). */
export function etiquetasEmUso(): EtiquetaEmUso[] {
  const linhas = banco().prepare("SELECT etiquetas FROM conversas").all() as { etiquetas: string }[];
  const contagem = new Map<string, number>();
  for (const l of linhas) {
    for (const nome of lerEtiquetas(l.etiquetas)) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  return etiquetasDaEmpresa().map((e) => ({ ...e, usos: contagem.get(e.nome) ?? 0 }));
}

function gravarEtiquetasDaEmpresa(lista: Etiqueta[]): void {
  setConfig(CHAVE_ETIQUETAS, JSON.stringify(lista));
}

/**
 * O que impede estas etiquetas de serem gravadas nesta conversa, em uma frase de negócio — ou `null`
 * quando elas podem. Confere o tamanho de cada nome, o teto por conversa e o teto da instância (as
 * que ainda não existem seriam criadas agora).
 */
export function erroDeEtiquetas(nomes: string[]): string | null {
  if (nomes.length > MAX_ETIQUETAS_POR_CONVERSA) return `Até ${MAX_ETIQUETAS_POR_CONVERSA} etiquetas por conversa.`;
  for (const nome of nomes) {
    const erro = erroDeEtiqueta(nome);
    if (erro) return erro;
  }
  const existentes = etiquetasDaEmpresa().map((e) => e.nome);
  const novas = nomes.filter((n) => !existentes.includes(n)).length;
  if (existentes.length + novas > MAX_ETIQUETAS) {
    return `Já são ${MAX_ETIQUETAS} etiquetas nesta conta. Apague alguma antes de criar outra.`;
  }
  return null;
}

/**
 * Grava as etiquetas desta conversa, criando na lista da instância as que ainda não existem (com a
 * cor seguinte da paleta). Como `definirAssunto`, não encosta em `atualizado_em`: etiquetar não é
 * novidade na conversa e não pode fazê-la pular para o topo da lista. Quem chama já validou por
 * `erroDeEtiquetas`; os nomes chegam já normalizados, e os repetidos saem aqui.
 */
export function definirEtiquetas(numero: string, nomes: string[]): string[] {
  const limpos: string[] = [];
  for (const bruto of nomes) {
    const nome = normalizarEtiqueta(bruto);
    if (nome && !limpos.includes(nome)) limpos.push(nome);
  }
  const daEmpresa = etiquetasDaEmpresa();
  for (const nome of limpos) {
    if (daEmpresa.some((e) => e.nome === nome)) continue;
    daEmpresa.push({ nome, cor: proximaCor(daEmpresa.length) });
  }
  gravarEtiquetasDaEmpresa(daEmpresa);
  banco().prepare("UPDATE conversas SET etiquetas = ? WHERE numero = ?").run(JSON.stringify(limpos), numero);
  avisarConversa(numero);
  return limpos;
}

/**
 * Apaga uma etiqueta da instância e de todas as conversas em que ela estava (a tela pergunta antes,
 * com a contagem). Devolve de quantas conversas ela saiu; 0 quando ela não existia.
 */
export function apagarEtiqueta(nome: string): number {
  const alvo = normalizarEtiqueta(nome);
  gravarEtiquetasDaEmpresa(etiquetasDaEmpresa().filter((e) => e.nome !== alvo));
  const linhas = banco().prepare("SELECT numero, etiquetas FROM conversas").all() as { numero: string; etiquetas: string }[];
  let quantas = 0;
  for (const l of linhas) {
    const atuais = lerEtiquetas(l.etiquetas);
    if (!atuais.includes(alvo)) continue;
    banco()
      .prepare("UPDATE conversas SET etiquetas = ? WHERE numero = ?")
      .run(JSON.stringify(atuais.filter((n) => n !== alvo)), l.numero);
    avisarConversa(l.numero);
    quantas += 1;
  }
  return quantas;
}

/**
 * O resumo do começo desta conversa e até que mensagem ele já cobre (lib/memoria.ts o escreve com a
 * IA). `ateId` é 0 quando ainda não há resumo nenhum: toda mensagem da conversa é "não resumida".
 */
export function resumoDaConversa(numero: string): { resumo: string | null; ateId: number } {
  const l = linha(numero);
  return { resumo: l?.resumo?.trim() ? l.resumo : null, ateId: Number(l?.resumo_ate_id ?? 0) };
}

/**
 * Grava o resumo do começo da conversa. Não encosta em `atualizado_em` (mesma razão de `definirAssunto`
 * e `marcarLido`: resumir não é novidade na conversa e não pode fazê-la pular para o topo da lista), e
 * nada o apaga além de apagar a conversa inteira — uma conversa resolvida que o cliente reabre continua
 * com o que já tinha sido combinado.
 */
export function definirResumo(numero: string, resumo: string, ateId: number): void {
  banco().prepare("UPDATE conversas SET resumo = ?, resumo_ate_id = ? WHERE numero = ?").run(resumo, ateId, numero);
  avisarConversa(numero);
}

/**
 * Zera as mensagens não lidas (alguém abriu a conversa na tela). Não encosta em `atualizado_em`: ler
 * uma conversa não é novidade nela, e mexer na data a faria pular para o topo da lista a cada leitura.
 */
export function marcarLido(numero: string): void {
  // O aviso só sai quando havia algo por ler: abrir a conversa recarrega a tela, que abre a conversa de
  // novo — sem esta guarda, a leitura se avisaria sem fim.
  const tinha = (linha(numero)?.nao_lidas ?? 0) > 0;
  banco().prepare("UPDATE conversas SET nao_lidas = 0 WHERE numero = ?").run(numero);
  if (tinha) avisarConversa(numero);
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
  avisarConversa(numero);
  if (status === "atencao") publicar({ tipo: "atencao", numero });
  return true;
}

/**
 * Uma pessoa assumiu a conversa: a IA para de responder e as não lidas zeram. A espera do cliente
 * continua contando — assumir não é responder — e o motivo da transferência fica, para quem abrir a
 * conversa ainda saber por que ela chegou aqui.
 */
export function assumir(numero: string): void {
  mudarStatus(numero, "humano", { zerarNaoLidas: true, evento: EVENTO_ASSUMIU });
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
  // Os anexos saem junto (com os arquivos no disco): apagar a conversa tem que apagar mesmo o áudio e
  // a foto que o cliente mandou, não só as linhas que apontavam para eles.
  apagarDeMensagens((d.prepare("SELECT id FROM mensagens WHERE numero = ?").all(numero) as { id: number }[]).map((l) => Number(l.id)));
  d.prepare("DELETE FROM mensagens WHERE numero = ?").run(numero);
  d.prepare("DELETE FROM conversas WHERE numero = ?").run(numero);
  avisarConversa(numero);
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
      const mensagemId = inserirMensagem({
        numero: c.numero,
        papel: m.papel,
        texto: m.texto,
        criadoEm: paraTextoDeBanco(quando),
        tempoRespostaMs: m.respostaMs,
        detalhes: m.detalhes,
      });
      // O áudio e a foto da demonstração apontam para arquivos do próprio app (public/exemplos): nada
      // é baixado de fora, e a conversa mostra os dois tipos antes de o número da empresa existir.
      if (m.anexo) {
        registrarAnexo({
          mensagemId,
          numero: c.numero,
          tipo: m.anexo.tipo,
          urlOriginal: m.anexo.arquivo,
          mime: m.anexo.mime,
          nomeArquivo: m.anexo.nome,
          segundos: m.anexo.segundos,
          legenda: m.anexo.legenda,
          transcricao: m.anexo.transcricao,
          em: quando,
        });
      }
      // A linha do tempo da demonstração: a primeira resposta de uma pessoa é o momento em que ela assumiu.
      if (m.papel === "humano" && !c.mensagens.slice(0, c.mensagens.indexOf(m)).some((x) => x.papel === "humano")) {
        registrarEvento(c.numero, "Você assumiu a conversa", quando);
      }
    }
    if (c.status === "atencao") {
      const motivo = c.motivo ?? MOTIVO_PADRAO;
      registrarEvento(c.numero, `${atendente} pediu ajuda de uma pessoa · ${rotuloMotivo(motivo)}`, fim);
      // A demonstração mostra a transferência como ela acontece de verdade: o evento na linha do tempo
      // e a nota interna que o atendente deixa com o motivo e a pergunta que o travou.
      const pergunta = [...c.mensagens].reverse().find((m) => m.papel === "cliente")?.texto;
      registrarNota(c.numero, notaDaTransferencia({ motivo, pergunta, atendente }), fim);
    }
    // As etiquetas da demonstração criam a lista da instância como qualquer outra (a cor vem da paleta,
    // na ordem): quem abre o app pela primeira vez vê os chips na lista e a linha de filtro funcionando.
    if (c.etiquetas?.length) definirEtiquetas(c.numero, c.etiquetas);
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
  const numeros = (d.prepare("SELECT numero FROM conversas WHERE exemplo = 1").all() as { numero: string }[]).map((l) => l.numero);
  const mensagens = d
    .prepare("SELECT id FROM mensagens WHERE numero IN (SELECT numero FROM conversas WHERE exemplo = 1)")
    .all() as { id: number }[];
  apagarDeMensagens(mensagens.map((l) => Number(l.id)));
  d.prepare("DELETE FROM mensagens WHERE numero IN (SELECT numero FROM conversas WHERE exemplo = 1)").run();
  d.prepare("DELETE FROM conversas WHERE exemplo = 1").run();
  for (const n of numeros) avisarConversa(n);
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
