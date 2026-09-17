// Sessão: uma conversa de um vendedor dentro de uma simulação (US-002). É o que torna possível mandar
// **um** link para trinta pessoas e receber trinta resultados comparáveis — cada abertura do link gera
// uma sessão própria, com a persona atribuída na hora (US-008).
//
// A transcrição mora aqui, no servidor (`mensagens_sessao`), não no navegador: a partir da US-015 a
// sala manda só a última fala a cada turno, em vez de reenviar a conversa inteira como hoje.
import { agora, banco, gerarId } from "./banco";

export type ModoSessao = "voz-agente" | "voz-navegador" | "texto";
export type StatusSessao = "preparando" | "em_andamento" | "encerrada" | "avaliada" | "abandonada";
export type PapelMensagem = "vendedor" | "cliente";

export type Sessao = {
  id: string;
  simulacaoCodigo: string;
  participanteId: string;
  personaId: string;
  modo: ModoSessao;
  status: StatusSessao;
  iniciadaEm?: string;
  encerradaEm?: string;
  duracaoSeg?: number;
  /** Id do registro em lib/historico.ts (o link /r/<id>), preenchido quando a avaliação termina. */
  resultadoId?: string;
  criadoEm: string;
};

export type MensagemSessao = {
  id: string;
  sessaoId: string;
  papel: PapelMensagem;
  texto: string;
  segundo?: number;
  criadoEm: string;
};

type LinhaSessao = {
  id: string;
  simulacaoCodigo: string;
  participanteId: string;
  personaId: string;
  modo: string;
  status: string;
  iniciadaEm: string | null;
  encerradaEm: string | null;
  duracaoSeg: number | null;
  resultadoId: string | null;
  criadoEm: string;
};

type LinhaMensagem = { id: string; sessaoId: string; papel: string; texto: string; segundo: number | null; criadoEm: string };

/** Uma sessão aberta e nunca iniciada vira abandonada depois disto (calculado na leitura, US-014). */
const MINUTOS_ATE_ABANDONAR = 30;

function linhaParaSessao(l: LinhaSessao): Sessao {
  return {
    id: l.id,
    simulacaoCodigo: l.simulacaoCodigo,
    participanteId: l.participanteId,
    personaId: l.personaId,
    modo: (["voz-agente", "voz-navegador", "texto"].includes(l.modo) ? l.modo : "texto") as ModoSessao,
    status: (["preparando", "em_andamento", "encerrada", "avaliada", "abandonada"].includes(l.status) ? l.status : "preparando") as StatusSessao,
    iniciadaEm: l.iniciadaEm ?? undefined,
    encerradaEm: l.encerradaEm ?? undefined,
    duracaoSeg: l.duracaoSeg ?? undefined,
    resultadoId: l.resultadoId ?? undefined,
    criadoEm: l.criadoEm,
  };
}

function linhaParaMensagem(l: LinhaMensagem): MensagemSessao {
  return { ...l, papel: l.papel === "cliente" ? "cliente" : "vendedor", segundo: l.segundo ?? undefined };
}

/**
 * Sessões que ficaram paradas em "preparando" viram "abandonada" — o vendedor abriu o link, viu quem
 * era o cliente e fechou a aba. Roda na leitura, não em tarefa agendada: o app não tem agendador
 * próprio e uma sessão esquecida não incomoda ninguém até alguém olhar a lista.
 */
function marcarAbandonadas(): void {
  const limite = new Date(Date.now() - MINUTOS_ATE_ABANDONAR * 60 * 1000).toISOString();
  banco().prepare("UPDATE sessoes SET status = 'abandonada' WHERE status = 'preparando' AND criadoEm < ?").run(limite);
}

/** Abre a sessão do vendedor que acabou de se identificar. A persona já vem escolhida (US-008). */
export function abrir({
  simulacaoCodigo,
  participanteId,
  personaId,
  modo,
}: {
  simulacaoCodigo: string;
  participanteId: string;
  personaId: string;
  modo: ModoSessao;
}): Sessao {
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare(
      `INSERT INTO sessoes (id, simulacaoCodigo, participanteId, personaId, modo, status, iniciadaEm, encerradaEm, duracaoSeg, resultadoId, criadoEm)
       VALUES (?, ?, ?, ?, ?, 'preparando', NULL, NULL, NULL, NULL, ?)`,
    )
    .run(id, simulacaoCodigo, participanteId, personaId, modo, criadoEm);
  return { id, simulacaoCodigo, participanteId, personaId, modo, status: "preparando", criadoEm };
}

export function obter(id: string): Sessao | null {
  marcarAbandonadas();
  const linha = banco().prepare("SELECT * FROM sessoes WHERE id = ?").get(id) as LinhaSessao | undefined;
  return linha ? linhaParaSessao(linha) : null;
}

/** O vendedor clicou em "Começar conversa": a sessão sai de "preparando" e o cronômetro começa. */
export function iniciar(id: string, modo?: ModoSessao): Sessao | null {
  const d = banco();
  if (modo) d.prepare("UPDATE sessoes SET modo = ? WHERE id = ?").run(modo, id);
  d.prepare("UPDATE sessoes SET status = 'em_andamento', iniciadaEm = ? WHERE id = ? AND iniciadaEm IS NULL").run(agora(), id);
  return obter(id);
}

export function registrarMensagem({
  sessaoId,
  papel,
  texto,
  segundo,
}: {
  sessaoId: string;
  papel: PapelMensagem;
  texto: string;
  segundo?: number;
}): MensagemSessao {
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare("INSERT INTO mensagens_sessao (id, sessaoId, papel, texto, segundo, criadoEm) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, sessaoId, papel, texto, segundo ?? null, criadoEm);
  return { id, sessaoId, papel, texto, segundo, criadoEm };
}

/** A conversa inteira, em ordem. É o que vai para o prompt do cliente simulado e para a avaliação. */
export function transcricao(sessaoId: string): MensagemSessao[] {
  const linhas = banco()
    .prepare("SELECT * FROM mensagens_sessao WHERE sessaoId = ? ORDER BY criadoEm ASC, rowid ASC")
    .all(sessaoId) as LinhaMensagem[];
  return linhas.map(linhaParaMensagem);
}

/** Só as últimas N falas, para montar o prompt do turno sem crescer sem limite (US-015 usa 20). */
export function ultimasMensagens(sessaoId: string, quantas: number): MensagemSessao[] {
  const linhas = banco()
    .prepare("SELECT * FROM mensagens_sessao WHERE sessaoId = ? ORDER BY criadoEm DESC, rowid DESC LIMIT ?")
    .all(sessaoId, quantas) as LinhaMensagem[];
  return linhas.reverse().map(linhaParaMensagem);
}

export function encerrar(id: string, { status = "encerrada" }: { status?: StatusSessao } = {}): Sessao | null {
  const sessao = obter(id);
  if (!sessao) return null;
  const fim = agora();
  const inicio = sessao.iniciadaEm ?? sessao.criadoEm;
  const duracaoSeg = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
  banco().prepare("UPDATE sessoes SET status = ?, encerradaEm = ?, duracaoSeg = ? WHERE id = ?").run(status, fim, duracaoSeg, id);
  return obter(id);
}

/** Chamado quando a avaliação termina (US-018): liga a sessão ao resultado que virou o link /r/<id>. */
export function registrarResultado(id: string, resultadoId: string): void {
  banco().prepare("UPDATE sessoes SET resultadoId = ?, status = 'avaliada' WHERE id = ?").run(resultadoId, id);
}

export function listarPorSimulacao(simulacaoCodigo: string, limite = 500): Sessao[] {
  marcarAbandonadas();
  const linhas = banco()
    .prepare("SELECT * FROM sessoes WHERE simulacaoCodigo = ? ORDER BY criadoEm DESC LIMIT ?")
    .all(simulacaoCodigo, limite) as LinhaSessao[];
  return linhas.map(linhaParaSessao);
}

export function listarPorParticipante(participanteId: string, limite = 500): Sessao[] {
  marcarAbandonadas();
  const linhas = banco()
    .prepare("SELECT * FROM sessoes WHERE participanteId = ? ORDER BY criadoEm DESC LIMIT ?")
    .all(participanteId, limite) as LinhaSessao[];
  return linhas.map(linhaParaSessao);
}

/**
 * Quantas sessões cada persona já teve nesta simulação. É a contagem que a atribuição equilibrada
 * (US-008) usa para escolher a persona menos usada — por isso conta **toda** sessão, inclusive as
 * abandonadas: quem abriu o link e desistiu já consumiu aquela persona da rodada.
 */
export function contarPorPersona(simulacaoCodigo: string): Record<string, number> {
  const linhas = banco()
    .prepare("SELECT personaId, COUNT(*) AS total FROM sessoes WHERE simulacaoCodigo = ? GROUP BY personaId")
    .all(simulacaoCodigo) as { personaId: string; total: number }[];
  return Object.fromEntries(linhas.map((l) => [l.personaId, l.total]));
}

/**
 * Quantas tentativas esta pessoa já fez nesta simulação, para o limite da US-011.
 * Sessão abandonada não conta: quem abriu o link e fechou a aba sem conversar não gastou uma chance.
 */
export function tentativasDe(simulacaoCodigo: string, participanteId: string): number {
  marcarAbandonadas();
  const linha = banco()
    .prepare("SELECT COUNT(*) AS total FROM sessoes WHERE simulacaoCodigo = ? AND participanteId = ? AND status <> 'abandonada'")
    .get(simulacaoCodigo, participanteId) as { total: number } | undefined;
  return linha?.total ?? 0;
}

/** Resumo por simulação para as listas do gestor, sem uma consulta por cartão. */
export function resumoPorSimulacao(): Record<string, { sessoes: number; participantes: number }> {
  const linhas = banco()
    .prepare("SELECT simulacaoCodigo, COUNT(*) AS sessoes, COUNT(DISTINCT participanteId) AS participantes FROM sessoes GROUP BY simulacaoCodigo")
    .all() as { simulacaoCodigo: string; sessoes: number; participantes: number }[];
  return Object.fromEntries(linhas.map((l) => [l.simulacaoCodigo, { sessoes: l.sessoes, participantes: l.participantes }]));
}
