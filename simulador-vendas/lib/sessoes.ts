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
/** Só os dois desfechos que o gestor precisa ver. "Não havia o que enviar" não é um deles: nada é
 * gravado quando o participante não tem e-mail, quando o canal não está configurado ou quando o
 * gestor desligou o envio — silêncio esperado não é falha. */
export type StatusEnvioEmail = "enviado" | "falhou";

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
  /** Como terminou o envio do feedback por e-mail (US-020). Ausente quando não havia envio a fazer. */
  envioEmail?: StatusEnvioEmail;
  /** A frase de negócio da falha de envio, para o gestor saber o que consertar. */
  envioEmailMotivo?: string;
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
  envioEmail: string | null;
  envioEmailMotivo: string | null;
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
    envioEmail: l.envioEmail === "enviado" || l.envioEmail === "falhou" ? l.envioEmail : undefined,
    envioEmailMotivo: l.envioEmailMotivo ?? undefined,
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

/**
 * A sessão que este participante abriu nesta simulação e ainda não começou (US-014).
 *
 * Existe para que recarregar a tela de preparação **não** abra uma conversa nova: sem isto, cada
 * atualização de página gastaria uma tentativa do vendedor e sortearia outro cliente, e o efeito de
 * montagem do React em desenvolvimento (que roda duas vezes) criaria sozinho duas sessões.
 */
export function emPreparacao(simulacaoCodigo: string, participanteId: string): Sessao | null {
  marcarAbandonadas();
  const linha = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE simulacaoCodigo = ? AND participanteId = ? AND status = 'preparando' ORDER BY criadoEm DESC LIMIT 1")
    .get(simulacaoCodigo, participanteId) as LinhaSessao | undefined;
  return linha ? linhaParaSessao(linha) : null;
}

/** A conversa deste participante que já começou e ainda não foi encerrada — a retomada é a US-017. */
export function emAndamento(simulacaoCodigo: string, participanteId: string): Sessao | null {
  marcarAbandonadas();
  const linha = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE simulacaoCodigo = ? AND participanteId = ? AND status = 'em_andamento' ORDER BY criadoEm DESC LIMIT 1")
    .get(simulacaoCodigo, participanteId) as LinhaSessao | undefined;
  return linha ? linhaParaSessao(linha) : null;
}

/**
 * A última conversa que este participante abriu nesta simulação, em qualquer estado.
 *
 * Existe para o pedido do resultado (US-015): quando o tempo acaba, o turno da despedida já fecha a
 * sessão, e o pedido do feedback chega em seguida — `emAndamento` já não a encontra. Sem isto, quem
 * treinou até o fim do cronômetro **perderia justamente o feedback da conversa que completou**, e só
 * não perdia quando o navegador ainda tinha o id da sessão no cookie (que a tela recarregada não
 * renova). Quem chama decide quais estados aceita.
 */
export function ultimaDe(simulacaoCodigo: string, participanteId: string): Sessao | null {
  marcarAbandonadas();
  const linha = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE simulacaoCodigo = ? AND participanteId = ? ORDER BY criadoEm DESC LIMIT 1")
    .get(simulacaoCodigo, participanteId) as LinhaSessao | undefined;
  return linha ? linhaParaSessao(linha) : null;
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

/**
 * Fecha a sessão. A duração é o tempo de relógio entre o começo e agora, exceto quando quem chama sabe
 * melhor: na conversa com o agente conversacional (US-016) a ligação já acabou quando o aviso chega, e
 * a duração de verdade é a que vem no aviso — sem isso a conversa ficaria com o tempo que ela levou
 * para ser entregue ao app, não com o tempo que o vendedor falou.
 */
export function encerrar(id: string, { status = "encerrada", duracaoSeg }: { status?: StatusSessao; duracaoSeg?: number } = {}): Sessao | null {
  const sessao = obter(id);
  if (!sessao) return null;
  const fim = agora();
  const inicio = sessao.iniciadaEm ?? sessao.criadoEm;
  const medida = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
  banco().prepare("UPDATE sessoes_treino SET status = ?, encerradaEm = ?, duracaoSeg = ? WHERE id = ?").run(status, fim, duracaoSeg ?? medida, id);
  return obter(id);
}

/** Chamado quando a avaliação termina (US-018): liga a sessão ao resultado que virou o link /r/<id>. */
export function registrarResultado(id: string, resultadoId: string): void {
  banco().prepare("UPDATE sessoes_treino SET resultadoId = ?, status = 'avaliada' WHERE id = ?").run(resultadoId, id);
}

/**
 * Grava como terminou o envio do feedback por e-mail (US-020).
 *
 * Fica na sessão, e não num registro de envios à parte, porque é sempre a resposta de uma pergunta
 * sobre **aquela conversa**: "o vendedor recebeu o feedback dela?". É também o que torna o envio
 * idempotente sem flag de processo — quem for enviar pergunta antes ao banco, como a migração faz.
 */
export function registrarEnvioEmail(id: string, status: StatusEnvioEmail, motivo?: string): void {
  banco().prepare("UPDATE sessoes_treino SET envioEmail = ?, envioEmailMotivo = ? WHERE id = ?").run(status, motivo ?? null, id);
}

/**
 * As conversas cujo feedback não chegou ao e-mail do vendedor — a lista que o gestor vê em
 * `/resultados` (US-020).
 *
 * Existe pelo mesmo motivo de `pendentesDeAvaliacao`: a falha acontece longe de quem pode consertá-la.
 * O vendedor viu o feedback na tela e seguiu em frente; sem esta lista, o gestor nunca saberia que a
 * conta de e-mail parou de entregar.
 */
export function falhasDeEnvioEmail(limite = 20): Sessao[] {
  const linhas = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE envioEmail = 'falhou' ORDER BY encerradaEm DESC LIMIT ?")
    .all(limite) as LinhaSessao[];
  return linhas.map(linhaParaSessao);
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

/**
 * Conversas do agente conversacional que terminaram e nunca receberam avaliação (US-016).
 *
 * No nível 1 a transcrição não passa pelo app: ela chega depois, pelo aviso de pós-conversa. Quando
 * esse aviso não está configurado do outro lado — ou o segredo não confere —, a sessão fica fechada e
 * sem resultado para sempre, e ninguém descobre por quê. Esta contagem é o que o cartão "Dados para a
 * equipe técnica" mostra ao gestor para essa falha ter um número em vez de um silêncio.
 */
export function conversasSemAvaliacao(): number {
  const linha = banco()
    .prepare("SELECT COUNT(*) AS total FROM sessoes_treino WHERE modo = 'voz-agente' AND status = 'encerrada' AND resultadoId IS NULL")
    .get() as { total: number } | undefined;
  return linha?.total ?? 0;
}

/**
 * As conversas que terminaram e não têm avaliação — é a lista de "Avaliação pendente" do gestor
 * (US-018), com o "Tentar de novo" que roda o avaliador de novo sobre a transcrição já gravada.
 *
 * Uma conversa cai aqui quando a IA falhou no fim do treino (fila cheia, chave sem crédito) ou quando
 * o aviso de pós-conversa do agente nunca chegou. Nos dois casos a conversa está gravada e não se
 * perde: o que falta é o julgamento dela.
 */
export function pendentesDeAvaliacao(limite = 50): Sessao[] {
  marcarAbandonadas();
  const linhas = banco()
    .prepare("SELECT * FROM sessoes_treino WHERE status = 'encerrada' AND resultadoId IS NULL ORDER BY encerradaEm DESC LIMIT ?")
    .all(limite) as LinhaSessao[];
  return linhas.map(linhaParaSessao);
}

/**
 * Resumo por simulação para as listas do gestor, sem uma consulta por cartão.
 *
 * `ultimaSessao` existe para `/resultados` (US-022) ordenar os treinos por movimento e não por data de
 * criação: o gestor volta ao que o time está usando esta semana, que raramente é o último que ele criou.
 */
export function resumoPorSimulacao(): Record<string, { sessoes: number; participantes: number; ultimaSessao: string | null }> {
  const linhas = banco()
    .prepare(
      `SELECT simulacaoCodigo, COUNT(*) AS sessoes, COUNT(DISTINCT participanteId) AS participantes, MAX(criadoEm) AS ultimaSessao
         FROM sessoes_treino GROUP BY simulacaoCodigo`,
    )
    .all() as { simulacaoCodigo: string; sessoes: number; participantes: number; ultimaSessao: string | null }[];
  return Object.fromEntries(
    linhas.map((l) => [l.simulacaoCodigo, { sessoes: l.sessoes, participantes: l.participantes, ultimaSessao: l.ultimaSessao }]),
  );
}

/**
 * Quantos treinos diferentes cada pessoa já fez, no app inteiro — o número que a aba Equipe (US-023)
 * mostra ao abrir a linha de um vendedor ("já treinou em 3 treinos").
 *
 * A pergunta atravessa simulações de propósito: o painel é de um treino, mas quem conversa com a
 * pessoa quer saber se ela é veterana ou se está na primeira vez. Uma consulta agregada para a tela
 * toda, nunca uma por vendedor.
 */
export function treinosPorParticipante(): Record<string, number> {
  const linhas = banco()
    .prepare("SELECT participanteId, COUNT(DISTINCT simulacaoCodigo) AS treinos FROM sessoes_treino GROUP BY participanteId")
    .all() as { participanteId: string; treinos: number }[];
  return Object.fromEntries(linhas.map((l) => [l.participanteId, l.treinos]));
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

/**
 * A nota geral de um resultado salvo; resultado de outro formato (ou JSON torto) simplesmente não conta.
 *
 * Dois nomes, porque são dois formatos: `nota` é a análise de uma conversa real colada no painel
 * (`lib/analise.ts`) e `notaGeral` é a avaliação de um treino (`lib/avaliacao.ts`, US-018). As duas
 * são a média dos critérios com uma casa decimal, calculada no código, então somam na mesma conta.
 * **Ao criar uma saída nova com nota, ou ela usa um destes dois nomes, ou esta função ganha o terceiro**
 * — senão a nota simplesmente some das listas, sem erro em lugar nenhum.
 */
function notaDoResultado(saida: string): number | null {
  try {
    const lido = JSON.parse(saida) as { nota?: unknown; notaGeral?: unknown } | null;
    const nota = lido?.nota ?? lido?.notaGeral;
    return typeof nota === "number" && Number.isFinite(nota) ? nota : null;
  } catch (err) {
    console.error("Resultado com saída mal formada; fora da média.", err);
    return null;
  }
}

/**
 * A melhor sessão avaliada desta pessoa nesta simulação — é o que a tela mostra para quem já gastou
 * todas as tentativas (US-013), em vez de abrir uma conversa que não vai contar.
 *
 * Mesma junção em SQL de `notaMediaPorSimulacao`, e pelo mesmo motivo: a nota é parte do resultado
 * gravado em `lib/historico.ts`, infraestrutura que não pode ganhar função nova. `resultados` pode
 * não existir num banco recém-criado e `prepare` sobre tabela inexistente lança na hora.
 */
export function melhorSessaoDe(simulacaoCodigo: string, participanteId: string): { sessaoId: string; resultadoId: string; nota: number } | null {
  const d = banco();
  const existe = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get();
  if (!existe) return null;

  const linhas = d
    .prepare(
      `SELECT s.id AS sessaoId, s.resultadoId AS resultadoId, r.saida AS saida
         FROM sessoes_treino s
         JOIN resultados r ON r.id = s.resultadoId
        WHERE s.simulacaoCodigo = ? AND s.participanteId = ? AND s.resultadoId IS NOT NULL`,
    )
    .all(simulacaoCodigo, participanteId) as { sessaoId: string; resultadoId: string; saida: string }[];

  let melhor: { sessaoId: string; resultadoId: string; nota: number } | null = null;
  for (const l of linhas) {
    const nota = notaDoResultado(l.saida);
    if (nota === null) continue;
    if (!melhor || nota > melhor.nota) melhor = { sessaoId: l.sessaoId, resultadoId: l.resultadoId, nota };
  }
  return melhor;
}

/** Uma conversa do histórico do vendedor (US-017): a sessão com a nota já resolvida. */
export type SessaoComNota = Sessao & { nota: number | null };

/**
 * As conversas desta pessoa nesta simulação, da mais recente para a mais antiga — é o que ela vê em
 * `/simular/<código>/meus-resultados` e o que responde "como fui das outras vezes?".
 *
 * Fica de fora o que não é conversa: a sessão que ainda está em preparação (o vendedor nem começou) e
 * a abandonada (abriu o link e fechou a aba). Listar qualquer uma das duas seria mostrar como treino
 * algo que nunca aconteceu — e a abandonada nem gasta tentativa.
 *
 * A nota vem de `resultados` pela mesma junção em SQL de `notaMediaPorSimulacao`, e pelo mesmo motivo:
 * ela é parte do resultado gravado em lib/historico.ts, infraestrutura que não pode ganhar função
 * nova. `prepare` sobre tabela inexistente lança na hora, então a conferência vem antes.
 */
export function historicoDe(simulacaoCodigo: string, participanteId: string): SessaoComNota[] {
  marcarAbandonadas();
  const d = banco();
  const comResultados = Boolean(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get());
  const linhas = d
    .prepare(
      comResultados
        ? `SELECT s.*, r.saida AS saida
             FROM sessoes_treino s
             LEFT JOIN resultados r ON r.id = s.resultadoId
            WHERE s.simulacaoCodigo = ? AND s.participanteId = ? AND s.status NOT IN ('preparando', 'abandonada')
            ORDER BY s.criadoEm DESC`
        : `SELECT s.*, NULL AS saida
             FROM sessoes_treino s
            WHERE s.simulacaoCodigo = ? AND s.participanteId = ? AND s.status NOT IN ('preparando', 'abandonada')
            ORDER BY s.criadoEm DESC`,
    )
    .all(simulacaoCodigo, participanteId) as (LinhaSessao & { saida: string | null })[];
  return linhas.map((l) => ({ ...linhaParaSessao(l), nota: l.saida ? notaDoResultado(l.saida) : null }));
}

/**
 * As conversas já avaliadas desta simulação, com a saída crua do resultado — é o insumo do painel do
 * gestor (US-022).
 *
 * Devolve a saída como texto, sem interpretá-la, pelo mesmo motivo de `notaDoResultado` existir aqui:
 * este módulo é o que sabe falar com o banco, e quem sabe o **formato** da avaliação é
 * `lib/avaliacao.ts`. Interpretar aqui criaria uma dependência circular (a avaliação já lê as sessões)
 * e espalharia o formato por dois arquivos.
 *
 * Mesma junção em SQL de `notaMediaPorSimulacao`: uma consulta, não uma leitura por sessão avaliada —
 * um treino de trinta vendedores com três tentativas cada seriam noventa consultas por carregamento.
 */
export function avaliacoesDaSimulacao(simulacaoCodigo: string): { sessao: Sessao; saida: string }[] {
  const d = banco();
  const existe = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get();
  if (!existe) return [];

  const linhas = d
    .prepare(
      `SELECT s.*, r.saida AS saida
         FROM sessoes_treino s
         JOIN resultados r ON r.id = s.resultadoId
        WHERE s.simulacaoCodigo = ? AND s.resultadoId IS NOT NULL
        ORDER BY s.criadoEm ASC`,
    )
    .all(simulacaoCodigo) as (LinhaSessao & { saida: string })[];
  return linhas.map((l) => ({ sessao: linhaParaSessao(l), saida: l.saida }));
}

/**
 * Todas as conversas avaliadas destas pessoas, **em qualquer simulação**, a partir de uma data.
 *
 * A evolução de um vendedor (US-025) atravessa treinos: quem melhorou em "Objeções" melhorou no app
 * inteiro, não dentro de um link. Por isso a consulta não filtra por `simulacaoCodigo` — e é **uma**
 * consulta para o time inteiro da tela, não uma por pessoa, pela mesma razão de
 * `notaMediaPorSimulacao`: trinta vendedores dariam trinta consultas por carregamento de tela.
 *
 * `quando` é o fim da conversa, ou a abertura dela quando o fim não foi gravado — o mesmo carimbo com
 * que o resto do painel coloca uma conversa numa janela de tempo.
 *
 * `resultados` pode ainda não existir num banco recém-criado, e `prepare` sobre tabela inexistente
 * lança na hora (não na execução): a conferência vem antes.
 */
export function avaliacoesDosParticipantes(participanteIds: string[], desde: string): { participanteId: string; quando: string; saida: string }[] {
  if (!participanteIds.length) return [];
  const d = banco();
  const existe = d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get();
  if (!existe) return [];

  const marcadores = participanteIds.map(() => "?").join(", ");
  return d
    .prepare(
      `SELECT s.participanteId AS participanteId,
              COALESCE(s.encerradaEm, s.criadoEm) AS quando,
              r.saida AS saida
         FROM sessoes_treino s
         JOIN resultados r ON r.id = s.resultadoId
        WHERE s.participanteId IN (${marcadores})
          AND s.resultadoId IS NOT NULL
          AND COALESCE(s.encerradaEm, s.criadoEm) >= ?
        ORDER BY quando ASC`,
    )
    .all(...participanteIds, desde) as { participanteId: string; quando: string; saida: string }[];
}

/**
 * Resumo por participante para a tela de Equipe (US-026): o que cada pessoa já fez no app inteiro.
 *
 * "Sessão" aqui é conversa que aconteceu: fica de fora a que está em preparação (o vendedor abriu o
 * link e ainda não começou) e a abandonada (abriu e fechou a aba) — as mesmas duas exclusões de
 * `historicoDe`, e pelo mesmo motivo: mostrar como treino algo que nunca aconteceu.
 *
 * Duas consultas agregadas para a tela toda, não uma por linha: trinta pessoas dariam sessenta
 * consultas por carregamento. `resultados` pode não existir num banco recém-criado e `prepare` sobre
 * tabela inexistente lança na hora (não na execução), então a conferência vem antes.
 */
export function resumoPorParticipante(): Record<string, { sessoes: number; ultima: string | null; nota: number | null; avaliadas: number }> {
  marcarAbandonadas();
  const d = banco();

  const linhas = d
    .prepare(
      `SELECT participanteId, COUNT(*) AS sessoes, MAX(COALESCE(encerradaEm, criadoEm)) AS ultima
         FROM sessoes_treino
        WHERE status NOT IN ('preparando', 'abandonada')
        GROUP BY participanteId`,
    )
    .all() as { participanteId: string; sessoes: number; ultima: string | null }[];

  const resumo: Record<string, { sessoes: number; ultima: string | null; nota: number | null; avaliadas: number }> = {};
  for (const l of linhas) resumo[l.participanteId] = { sessoes: l.sessoes, ultima: l.ultima, nota: null, avaliadas: 0 };

  const comResultados = Boolean(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get());
  if (!comResultados) return resumo;

  const avaliadas = d
    .prepare(
      `SELECT s.participanteId AS participanteId, r.saida AS saida
         FROM sessoes_treino s
         JOIN resultados r ON r.id = s.resultadoId
        WHERE s.resultadoId IS NOT NULL AND s.status NOT IN ('preparando', 'abandonada')`,
    )
    .all() as { participanteId: string; saida: string }[];

  const somas: Record<string, { soma: number; total: number }> = {};
  for (const a of avaliadas) {
    const nota = notaDoResultado(a.saida);
    if (nota === null) continue;
    const atual = somas[a.participanteId] ?? { soma: 0, total: 0 };
    somas[a.participanteId] = { soma: atual.soma + nota, total: atual.total + 1 };
  }
  for (const [participanteId, s] of Object.entries(somas)) {
    const linha = resumo[participanteId] ?? { sessoes: 0, ultima: null, nota: null, avaliadas: 0 };
    resumo[participanteId] = { ...linha, nota: Math.round((s.soma / s.total) * 10) / 10, avaliadas: s.total };
  }
  return resumo;
}

/**
 * As conversas desta pessoa em **qualquer** treino, da mais recente para a mais antiga — metade da
 * linha do tempo do detalhe dela na tela de Equipe (a outra metade são as conversas reais analisadas,
 * que moram no histórico e não têm sessão; quem junta as duas é `lib/equipe.ts`).
 *
 * Mesmas exclusões e mesma junção em SQL de `historicoDe`, sem o filtro por simulação: aqui a pergunta
 * é "o que esta pessoa já fez", não "como ela foi neste link".
 */
export function sessoesComNotaDe(participanteId: string, limite = 200): SessaoComNota[] {
  marcarAbandonadas();
  const d = banco();
  const comResultados = Boolean(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'resultados'").get());
  const linhas = d
    .prepare(
      comResultados
        ? `SELECT s.*, r.saida AS saida
             FROM sessoes_treino s
             LEFT JOIN resultados r ON r.id = s.resultadoId
            WHERE s.participanteId = ? AND s.status NOT IN ('preparando', 'abandonada')
            ORDER BY COALESCE(s.encerradaEm, s.criadoEm) DESC LIMIT ?`
        : `SELECT s.*, NULL AS saida
             FROM sessoes_treino s
            WHERE s.participanteId = ? AND s.status NOT IN ('preparando', 'abandonada')
            ORDER BY COALESCE(s.encerradaEm, s.criadoEm) DESC LIMIT ?`,
    )
    .all(participanteId, limite) as (LinhaSessao & { saida: string | null })[];
  return linhas.map((l) => ({ ...linhaParaSessao(l), nota: l.saida ? notaDoResultado(l.saida) : null }));
}
