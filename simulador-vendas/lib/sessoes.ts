// Sessão: uma conversa de um vendedor dentro de uma simulação (US-002). É o que torna possível mandar
// **um** link para trinta pessoas e receber trinta resultados comparáveis — cada abertura do link gera
// uma sessão própria, com a persona atribuída na hora (US-008).
//
// A transcrição mora aqui, no servidor (`mensagens_sessao`), não no navegador: a partir da US-015 a
// sala manda só a última fala a cada turno, em vez de reenviar a conversa inteira como hoje.
import { agora, banco, gerarId } from "./banco";
import { escolherPersona } from "./atribuicao";
import { obter as obterSimulacao } from "./simulacoes";

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
  banco().prepare("UPDATE sessoes_treino SET status = 'abandonada' WHERE status = 'preparando' AND criadoEm < ?").run(limite);
}

/**
 * As personas que este participante já pegou nesta simulação, uma entrada por sessão. A atribuição
 * (US-008) usa isto para não repetir o mesmo cliente com quem volta ao link.
 */
export function personasUsadasPor(simulacaoCodigo: string, participanteId: string): string[] {
  const linhas = banco()
    .prepare("SELECT personaId FROM sessoes_treino WHERE simulacaoCodigo = ? AND participanteId = ?")
    .all(simulacaoCodigo, participanteId) as { personaId: string }[];
  return linhas.map((l) => l.personaId);
}

/**
 * Abre a sessão do vendedor que acabou de se identificar.
 *
 * **A persona é escolhida aqui, na abertura, nunca na criação do link** (D8): o link é da simulação
 * e vale para o time inteiro, então na hora de criá-lo ainda não existe sessão nenhuma para contar.
 * Quem chama passa só a simulação e a pessoa; `personaId` é para semear demonstração e teste.
 *
 * As três consultas (contagem geral, histórico da pessoa, INSERT) rodam **na mesma chamada**, sem
 * nenhum `await` no meio e sobre a conexão única de lib/banco.ts. É o que mantém a contagem honesta
 * com trinta vendedores abrindo o mesmo link ao mesmo tempo: em Node nada intercala aqui dentro.
 */
export function abrir({
  simulacaoCodigo,
  participanteId,
  personaId,
  modo,
}: {
  simulacaoCodigo: string;
  participanteId: string;
  personaId?: string;
  modo: ModoSessao;
}): Sessao {
  const escolhida =
    personaId ??
    escolherPersona({
      simulacao: obterSimulacao(simulacaoCodigo) ?? { modoPersona: "aleatoria", personas: [] },
      contagem: contarPorPersona(simulacaoCodigo),
      jaUsadas: personasUsadasPor(simulacaoCodigo, participanteId),
    });
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare(
      `INSERT INTO sessoes_treino (id, simulacaoCodigo, participanteId, personaId, modo, status, iniciadaEm, encerradaEm, duracaoSeg, resultadoId, criadoEm)
       VALUES (?, ?, ?, ?, ?, 'preparando', NULL, NULL, NULL, NULL, ?)`,
    )
    .run(id, simulacaoCodigo, participanteId, escolhida, modo, criadoEm);
  return { id, simulacaoCodigo, participanteId, personaId: escolhida, modo, status: "preparando", criadoEm };
}

export function obter(id: string): Sessao | null {
  marcarAbandonadas();
  const linha = banco().prepare("SELECT * FROM sessoes_treino WHERE id = ?").get(id) as LinhaSessao | undefined;
  return linha ? linhaParaSessao(linha) : null;
}

/** O vendedor clicou em "Começar conversa": a sessão sai de "preparando" e o cronômetro começa. */
export function iniciar(id: string, modo?: ModoSessao): Sessao | null {
  const d = banco();
  if (modo) d.prepare("UPDATE sessoes_treino SET modo = ? WHERE id = ?").run(modo, id);
  d.prepare("UPDATE sessoes_treino SET status = 'em_andamento', iniciadaEm = ? WHERE id = ? AND iniciadaEm IS NULL").run(agora(), id);
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
  banco().prepare("UPDATE sessoes_treino SET status = ?, encerradaEm = ?, duracaoSeg = ? WHERE id = ?").run(status, fim, duracaoSeg, id);
  return obter(id);
}

/** Chamado quando a avaliação termina (US-018): liga a sessão ao resultado que virou o link /r/<id>. */
export function registrarResultado(id: string, resultadoId: string): void {
  banco().prepare("UPDATE sessoes_treino SET resultadoId = ?, status = 'avaliada' WHERE id = ?").run(resultadoId, id);
}

export function listarPorSimulacao(simulacaoCodigo: string, limite = 500): Sessao[] {
  marcarAbandonadas();
  const linhas = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE simulacaoCodigo = ? ORDER BY criadoEm DESC LIMIT ?")
    .all(simulacaoCodigo, limite) as LinhaSessao[];
  return linhas.map(linhaParaSessao);
}

export function listarPorParticipante(participanteId: string, limite = 500): Sessao[] {
  marcarAbandonadas();
  const linhas = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE participanteId = ? ORDER BY criadoEm DESC LIMIT ?")
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
    .prepare("SELECT personaId, COUNT(*) AS total FROM sessoes_treino WHERE simulacaoCodigo = ? GROUP BY personaId")
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
    .prepare("SELECT COUNT(*) AS total FROM sessoes_treino WHERE simulacaoCodigo = ? AND participanteId = ? AND status <> 'abandonada'")
    .get(simulacaoCodigo, participanteId) as { total: number } | undefined;
  return linha?.total ?? 0;
}

/** Resumo por simulação para as listas do gestor, sem uma consulta por cartão. */
export function resumoPorSimulacao(): Record<string, { sessoes: number; participantes: number }> {
  const linhas = banco()
    .prepare("SELECT simulacaoCodigo, COUNT(*) AS sessoes, COUNT(DISTINCT participanteId) AS participantes FROM sessoes_treino GROUP BY simulacaoCodigo")
    .all() as { simulacaoCodigo: string; sessoes: number; participantes: number }[];
  return Object.fromEntries(linhas.map((l) => [l.simulacaoCodigo, { sessoes: l.sessoes, participantes: l.participantes }]));
}

/**
 * Nota média por simulação, só das sessões já avaliadas.
 *
 * A nota não mora aqui: ela é parte do resultado gravado em `lib/historico.ts` (o mesmo registro que
 * vira o link /r/<id>), que é infraestrutura comparada byte a byte entre os apps e por isso não pode
 * ganhar uma função nova. Como as duas tabelas vivem no **mesmo `app.sqlite`**, a junção é feita em
 * SQL, numa consulta só — e não com uma leitura por sessão avaliada, que numa lista de dez treinos
 * de trinta vendedores seriam centenas de consultas por carregamento de tela.
 *
 * `resultados` pode ainda não existir num banco recém-criado, e `prepare` sobre tabela inexistente
 * lança na hora (não na execução): a conferência vem antes.
 */
export function notaMediaPorSimulacao(): Record<string, { nota: number; avaliadas: number }> {
  const d = banco();
  const existe = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get();
  if (!existe) return {};

  const linhas = d
    .prepare(
      `SELECT s.simulacaoCodigo AS codigo, r.saida AS saida
         FROM sessoes_treino s
         JOIN resultados r ON r.id = s.resultadoId
        WHERE s.resultadoId IS NOT NULL`,
    )
    .all() as { codigo: string; saida: string }[];

  const somas: Record<string, { soma: number; avaliadas: number }> = {};
  for (const l of linhas) {
    const nota = notaDoResultado(l.saida);
    if (nota === null) continue;
    const atual = somas[l.codigo] ?? { soma: 0, avaliadas: 0 };
    somas[l.codigo] = { soma: atual.soma + nota, avaliadas: atual.avaliadas + 1 };
  }

  return Object.fromEntries(
    Object.entries(somas).map(([codigo, s]) => [codigo, { nota: Math.round((s.soma / s.avaliadas) * 10) / 10, avaliadas: s.avaliadas }]),
  );
}

/** A nota geral de uma análise salva; resultado de outro formato (ou JSON torto) simplesmente não conta. */
function notaDoResultado(saida: string): number | null {
  try {
    const lido: unknown = JSON.parse(saida);
    const nota = (lido as { nota?: unknown } | null)?.nota;
    return typeof nota === "number" && Number.isFinite(nota) ? nota : null;
  } catch (err) {
    console.error("Resultado com saída mal formada; fora da média.", err);
    return null;
  }
}
