// Entrevista: o encontro de uma vaga com um candidato (US-002). É a linha que faz dez candidatos na
// mesma vaga gerarem dez históricos independentes — antes disso, "a entrevista" era o que estivesse
// na tela naquele momento.
//
// A transcrição mora aqui, no servidor (`mensagens_entrevista`), e não no navegador: é ela que
// sustenta o parecer (US-019), a consistência com o currículo e a retomada de uma conversa caída.
//
// Distinga de `lib/entrevista.ts` (singular), que continua sendo a lógica de IA da conversa e do
// scorecard. Este módulo só guarda estado.
import { agora, banco, gerarId } from "./banco";
import { semearDemonstracao } from "./semear-demo";
import { periodoPadrao } from "./prazo-convite";

export type StatusEntrevista = "convidada" | "aberta" | "em_andamento" | "concluida" | "avaliada" | "expirada" | "cancelada";
/** Os três níveis da conversa (D3): agente da ElevenLabs, voz do navegador, texto. Nulo até a sala abrir. */
export type NivelVoz = "agente" | "navegador" | "texto";
export type Decisao = "avancar" | "aguardar" | "reprovar";
export type PapelMensagem = "entrevistadora" | "candidato";

/**
 * Em que pé está o preparo do parecer de uma entrevista já concluída (US-021).
 *
 * O status da entrevista não dá conta disso sozinho: `concluida` é ao mesmo tempo "acabou agora e o
 * parecer está sendo preparado", "o parecer não saiu e alguém precisa pedir de novo" e "a conversa
 * foi curta demais para avaliar". São três esperas diferentes para quem acompanha o processo, e só a
 * do meio tem um botão. `pronto` convive com `status = "avaliada"`; os outros, com `concluida`.
 */
export type ParecerStatus = "nao_pedido" | "em_andamento" | "falhou" | "sem_material" | "pronto";

export type Entrevista = {
  id: string;
  vagaId: string;
  candidatoId: string;
  /** O token do link público (lib/formularios.ts); ausente até o convite ser criado (US-013). */
  codigo?: string;
  tentativa: number;
  status: StatusEntrevista;
  nivelVoz?: NivelVoz;
  convidadaEm?: string;
  abertaEm?: string;
  iniciadaEm?: string;
  concluidaEm?: string;
  /** Início da disponibilidade do convite, diferente do início real da conversa. */
  iniciaEm?: string;
  expiraEm?: string;
  /** Id do parecer em lib/historico.ts (o link /r/<id>), preenchido quando a avaliação termina. */
  resultadoId?: string;
  parecerStatus: ParecerStatus;
  decisao?: Decisao;
  decisaoEm?: string;
  exemplo: boolean;
  criadoEm: string;
};

export type MensagemEntrevista = {
  id: string;
  entrevistaId: string;
  papel: PapelMensagem;
  texto: string;
  /** Segundos desde o início da conversa, quando a sala souber medir. */
  segundo?: number;
  /** O passo do roteiro que esta fala da entrevistadora cumpriu (lib/roteiro.ts, `passoEmTexto`).
   * Vazio nas falas do candidato e nas gravadas antes da 0.8.0. */
  passo?: string;
  criadoEm: string;
};

type LinhaEntrevista = {
  id: string;
  vagaId: string;
  candidatoId: string;
  codigo: string | null;
  tentativa: number;
  status: string;
  nivelVoz: string | null;
  convidadaEm: string | null;
  abertaEm: string | null;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  iniciaEm: string | null;
  expiraEm: string | null;
  resultadoId: string | null;
  parecerStatus: string | null;
  decisao: string | null;
  decisaoEm: string | null;
  exemplo: number;
  criadoEm: string;
};

type LinhaMensagem = { id: string; entrevistaId: string; papel: string; texto: string; segundo: number | null; passo?: string | null; criadoEm: string };

const STATUS: StatusEntrevista[] = ["convidada", "aberta", "em_andamento", "concluida", "avaliada", "expirada", "cancelada"];
const NIVEIS: NivelVoz[] = ["agente", "navegador", "texto"];
const DECISOES: Decisao[] = ["avancar", "aguardar", "reprovar"];
const PARECER_STATUS: ParecerStatus[] = ["nao_pedido", "em_andamento", "falhou", "sem_material", "pronto"];

/** Uma entrevista nestes estados ainda "vale": é ela que o par (vaga, candidato) não pode duplicar. */
const STATUS_VIVOS = STATUS.filter((s) => s !== "cancelada" && s !== "expirada");

/** Cada mudança de status carimba a sua própria data; a tabela guarda todas, para a linha do tempo da
 * entrevista (convite → abertura → início → conclusão) não precisar ser deduzida depois. */
type ColunaCarimbo = "convidadaEm" | "abertaEm" | "iniciadaEm" | "concluidaEm";
const CARIMBO: Partial<Record<StatusEntrevista, ColunaCarimbo>> = {
  convidada: "convidadaEm",
  aberta: "abertaEm",
  em_andamento: "iniciadaEm",
  concluida: "concluidaEm",
};

function linhaParaEntrevista(l: LinhaEntrevista): Entrevista {
  return {
    id: l.id,
    vagaId: l.vagaId,
    candidatoId: l.candidatoId,
    codigo: l.codigo ?? undefined,
    tentativa: l.tentativa,
    status: STATUS.includes(l.status as StatusEntrevista) ? (l.status as StatusEntrevista) : "convidada",
    nivelVoz: NIVEIS.includes(l.nivelVoz as NivelVoz) ? (l.nivelVoz as NivelVoz) : undefined,
    convidadaEm: l.convidadaEm ?? undefined,
    abertaEm: l.abertaEm ?? undefined,
    iniciadaEm: l.iniciadaEm ?? undefined,
    concluidaEm: l.concluidaEm ?? undefined,
    iniciaEm: l.iniciaEm ?? l.convidadaEm ?? l.criadoEm,
    expiraEm: l.expiraEm ?? undefined,
    resultadoId: l.resultadoId ?? undefined,
    parecerStatus: PARECER_STATUS.includes(l.parecerStatus as ParecerStatus) ? (l.parecerStatus as ParecerStatus) : "nao_pedido",
    decisao: DECISOES.includes(l.decisao as Decisao) ? (l.decisao as Decisao) : undefined,
    decisaoEm: l.decisaoEm ?? undefined,
    exemplo: l.exemplo === 1,
    criadoEm: l.criadoEm,
  };
}

function linhaParaMensagem(l: LinhaMensagem): MensagemEntrevista {
  return {
    id: l.id,
    entrevistaId: l.entrevistaId,
    papel: l.papel === "candidato" ? "candidato" : "entrevistadora",
    texto: l.texto,
    segundo: l.segundo ?? undefined,
    passo: l.passo ?? undefined,
    criadoEm: l.criadoEm,
  };
}

/**
 * Convites cujo prazo passou viram "expirada". Roda **na leitura**, não em tarefa agendada: o app não
 * tem agendador próprio e um convite esquecido não incomoda ninguém até alguém olhar a lista.
 *
 * `em_andamento` fica de fora de propósito: quem está conversando neste instante não é interrompido
 * porque o prazo do link venceu no meio da frase. Só o que ainda não começou expira.
 */
export function expirarVencidas(): void {
  banco()
    .prepare("UPDATE entrevistas SET status = 'expirada' WHERE status IN ('convidada', 'aberta') AND expiraEm IS NOT NULL AND expiraEm <= ?")
    .run(agora());
}

/**
 * Abre a entrevista de um candidato numa vaga.
 *
 * **Uma por par enquanto ela vale.** Convidar de novo alguém que já foi convidado não cria um segundo
 * histórico: devolve o que já existe, e o gestor reenvia o mesmo link. Cancelada ou expirada libera o
 * par (o índice parcial de lib/banco.ts é quem garante isso no banco, não só esta checagem).
 */
export function criar({
  vagaId,
  candidatoId,
  codigo,
  iniciaEm,
  expiraEm,
  exemplo = false,
  status = "convidada",
}: {
  vagaId: string;
  candidatoId: string;
  codigo?: string;
  iniciaEm?: string;
  expiraEm?: string;
  exemplo?: boolean;
  status?: StatusEntrevista;
}): Entrevista {
  const existente = entrevistaViva(vagaId, candidatoId);
  if (existente) return existente;

  const id = gerarId();
  const momento = agora();
  const periodo = periodoPadrao(new Date(momento));
  banco()
    .prepare(
      `INSERT INTO entrevistas (id, vagaId, candidatoId, codigo, status, convidadaEm, iniciaEm, expiraEm, exemplo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, vagaId, candidatoId, codigo ?? null, status, momento, iniciaEm ?? periodo.iniciaEm, expiraEm ?? periodo.expiraEm, exemplo ? 1 : 0, momento);
  const entrevista = obter(id);
  if (!entrevista) throw new Error("A entrevista recém-criada não foi encontrada no banco.");
  return entrevista;
}

/** A entrevista deste par que ainda vale, se houver. */
export function entrevistaViva(vagaId: string, candidatoId: string): Entrevista | null {
  expirarVencidas();
  const marcadores = STATUS_VIVOS.map(() => "?").join(", ");
  const linha = banco()
    .prepare(`SELECT * FROM entrevistas WHERE vagaId = ? AND candidatoId = ? AND status IN (${marcadores}) ORDER BY criadoEm DESC`)
    .get(vagaId, candidatoId, ...STATUS_VIVOS) as LinhaEntrevista | undefined;
  return linha ? linhaParaEntrevista(linha) : null;
}

export function obter(id: string): Entrevista | null {
  expirarVencidas();
  const linha = banco().prepare("SELECT * FROM entrevistas WHERE id = ?").get(id) as LinhaEntrevista | undefined;
  return linha ? linhaParaEntrevista(linha) : null;
}

/** Pelo código do link público. É por aqui que a sala do candidato descobre de quem e de que vaga ela é. */
export function obterPorCodigo(codigo: string): Entrevista | null {
  expirarVencidas();
  const linha = banco().prepare("SELECT * FROM entrevistas WHERE codigo = ?").get(codigo) as LinhaEntrevista | undefined;
  return linha ? linhaParaEntrevista(linha) : null;
}

export type FiltroEntrevistas = {
  vagaId?: string;
  candidatoId?: string;
  status?: StatusEntrevista | StatusEntrevista[];
  /** Janela de datas ISO sobre `criadoEm`, para os Relatórios (US-023). */
  periodo?: { de?: string; ate?: string };
  limite?: number;
};

export function listar({ vagaId, candidatoId, status, periodo, limite = 200 }: FiltroEntrevistas = {}): Entrevista[] {
  semearDemonstracao();
  expirarVencidas();
  const condicoes: string[] = [];
  const valores: (string | number)[] = [];
  if (vagaId) {
    condicoes.push("vagaId = ?");
    valores.push(vagaId);
  }
  if (candidatoId) {
    condicoes.push("candidatoId = ?");
    valores.push(candidatoId);
  }
  if (status) {
    const lista = Array.isArray(status) ? status : [status];
    condicoes.push(`status IN (${lista.map(() => "?").join(", ")})`);
    valores.push(...lista);
  }
  if (periodo?.de) {
    condicoes.push("criadoEm >= ?");
    valores.push(periodo.de);
  }
  if (periodo?.ate) {
    condicoes.push("criadoEm <= ?");
    valores.push(periodo.ate);
  }
  const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = banco()
    .prepare(`SELECT * FROM entrevistas ${onde} ORDER BY criadoEm DESC LIMIT ?`)
    .all(...valores, limite) as LinhaEntrevista[];
  return linhas.map(linhaParaEntrevista);
}

/** Muda o status e carimba a data correspondente (só na primeira vez que aquele estado acontece). */
export function mudarStatus(id: string, status: StatusEntrevista, extras: { nivelVoz?: NivelVoz } = {}): Entrevista | null {
  const atual = obter(id);
  if (!atual) return null;

  const partes = ["status = ?"];
  const valores: (string | number | null)[] = [status];
  const carimbo = CARIMBO[status];
  if (carimbo && !atual[carimbo]) {
    partes.push(`${carimbo} = ?`);
    valores.push(agora());
  }
  if (extras.nivelVoz) {
    partes.push("nivelVoz = ?");
    valores.push(extras.nivelVoz);
  }
  valores.push(id);
  banco().prepare(`UPDATE entrevistas SET ${partes.join(", ")} WHERE id = ?`).run(...valores);
  return obter(id);
}

/** Define o código do link público depois que o convite foi criado (US-013). */
export function definirCodigo(id: string, codigo: string, expiraEm?: string, iniciaEm?: string): Entrevista | null {
  const { changes } = banco()
    .prepare("UPDATE entrevistas SET codigo = ?, expiraEm = COALESCE(?, expiraEm), iniciaEm = COALESCE(?, iniciaEm) WHERE id = ?")
    .run(codigo, expiraEm ?? null, iniciaEm ?? null, id);
  return Number(changes) > 0 ? obter(id) : null;
}

export function registrarMensagem({
  entrevistaId,
  papel,
  texto,
  segundo,
  passo,
}: {
  entrevistaId: string;
  papel: PapelMensagem;
  texto: string;
  segundo?: number;
  passo?: string;
}): MensagemEntrevista {
  const id = gerarId();
  const criadoEm = agora();
  banco()
    .prepare("INSERT INTO mensagens_entrevista (id, entrevistaId, papel, texto, segundo, passo, criadoEm) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, entrevistaId, papel, texto, segundo ?? null, passo ?? null, criadoEm);
  return { id, entrevistaId, papel, texto, segundo, passo, criadoEm };
}

/** A memória de trabalho da conversa (lib/roteiro.ts), em JSON. `null` enquanto não há anotações. */
export function lerMemoria(id: string): string | null {
  const linha = banco().prepare("SELECT memoria FROM entrevistas WHERE id = ?").get(id) as { memoria: string | null } | undefined;
  return linha?.memoria ?? null;
}

export function salvarMemoria(id: string, memoria: string): void {
  banco().prepare("UPDATE entrevistas SET memoria = ? WHERE id = ?").run(memoria, id);
}

/**
 * O plano da conversa (lib/roteiro.ts), em JSON, escrito na abertura da sala.
 *
 * Fica FORA do tipo `Entrevista` de propósito, como `cvTexto` fica fora de `Candidato`: são alguns
 * milhares de caracteres por entrevista, e uma lista de trinta linhas os carregaria todos para
 * mostrar trinta nomes. Quem precisa do plano pede por aqui.
 */
export function lerRoteiro(id: string): string | null {
  const linha = banco().prepare("SELECT roteiro FROM entrevistas WHERE id = ?").get(id) as { roteiro: string | null } | undefined;
  return linha?.roteiro ?? null;
}

export function salvarRoteiro(id: string, roteiro: string): void {
  banco().prepare("UPDATE entrevistas SET roteiro = ? WHERE id = ?").run(roteiro, id);
}

/** A conversa inteira, na ordem em que aconteceu. */
export function transcricao(entrevistaId: string): MensagemEntrevista[] {
  const linhas = banco()
    .prepare("SELECT * FROM mensagens_entrevista WHERE entrevistaId = ? ORDER BY criadoEm ASC, rowid ASC")
    .all(entrevistaId) as LinhaMensagem[];
  return linhas.map(linhaParaMensagem);
}

/** Liga o parecer gerado (lib/historico.ts) à entrevista e a marca como avaliada. */
export function registrarResultado(id: string, resultadoId: string): Entrevista | null {
  const { changes } = banco()
    .prepare("UPDATE entrevistas SET resultadoId = ?, status = 'avaliada', parecerStatus = 'pronto', concluidaEm = COALESCE(concluidaEm, ?) WHERE id = ?")
    .run(resultadoId, agora(), id);
  return Number(changes) > 0 ? obter(id) : null;
}

/** Em que pé está o preparo do parecer (US-021). Escrito ANTES de a avaliação começar e de novo
 * quando ela falha: é esse campo que a tela do gestor lê para saber se ainda vale esperar. */
export function marcarParecer(id: string, parecerStatus: ParecerStatus): Entrevista | null {
  const { changes } = banco().prepare("UPDATE entrevistas SET parecerStatus = ? WHERE id = ?").run(parecerStatus, id);
  return Number(changes) > 0 ? obter(id) : null;
}

/** Quantas vezes o candidato falou nesta conversa. É o que separa uma entrevista encerrada cedo
 * demais para avaliar de uma que rendeu material — e uma contagem em SQL evita carregar a
 * transcrição inteira só para medir o tamanho dela. */
export function contarRespostasDoCandidato(entrevistaId: string): number {
  const linha = banco()
    .prepare("SELECT COUNT(*) AS total FROM mensagens_entrevista WHERE entrevistaId = ? AND papel = 'candidato'")
    .get(entrevistaId) as { total: number };
  return linha.total;
}

/** A decisão do gestor depois de ler o parecer (US-020). Não muda o status: uma entrevista avaliada
 * continua avaliada; a decisão é uma informação a mais, e pode ser trocada. */
export function decidir(id: string, decisao: Decisao): Entrevista | null {
  const { changes } = banco().prepare("UPDATE entrevistas SET decisao = ?, decisaoEm = ? WHERE id = ?").run(decisao, agora(), id);
  return Number(changes) > 0 ? obter(id) : null;
}

/** Cancela o convite (ex.: ao encerrar a vaga). Libera o par para um convite futuro. */
export function cancelar(id: string): Entrevista | null {
  const { changes } = banco().prepare("UPDATE entrevistas SET status = 'cancelada' WHERE id = ?").run(id);
  return Number(changes) > 0 ? obter(id) : null;
}

/** Quantos candidatos estão em cada etapa de uma vaga. Cancelada e expirada ficam de fora: são
 * convites que não valem mais, e contá-los faria a vaga parecer mais movimentada do que está. */
export type ContagemVaga = { total: number; convidados: number; emAndamento: number; concluidas: number; avaliadas: number };

export const CONTAGEM_VAZIA: ContagemVaga = { total: 0, convidados: 0, emAndamento: 0, concluidas: 0, avaliadas: 0 };

/**
 * A contagem por etapa de TODAS as vagas, numa consulta agregada só.
 *
 * A lista de vagas (US-005) mostra "3 convidados · 2 concluídas · 1 avaliada" em cada cartão: com uma
 * consulta por cartão, trinta vagas abertas viram trinta consultas para mostrar números pequenos.
 */
export function contarPorVaga(): Record<string, ContagemVaga> {
  expirarVencidas();
  const linhas = banco()
    .prepare("SELECT vagaId, status, COUNT(*) AS total FROM entrevistas GROUP BY vagaId, status")
    .all() as { vagaId: string; status: string; total: number }[];

  const contagens: Record<string, ContagemVaga> = {};
  for (const linha of linhas) {
    const etapa =
      linha.status === "convidada" || linha.status === "aberta"
        ? "convidados"
        : linha.status === "em_andamento"
          ? "emAndamento"
          : linha.status === "concluida"
            ? "concluidas"
            : linha.status === "avaliada"
              ? "avaliadas"
              : null;
    if (!etapa) continue;
    const atual = (contagens[linha.vagaId] ??= { ...CONTAGEM_VAZIA });
    atual[etapa] += Number(linha.total);
    atual.total += Number(linha.total);
  }
  return contagens;
}

/** Quantas entrevistas cada candidato tem e qual foi a última vaga dele. */
export type ContagemCandidato = { total: number; ultimaVagaId: string };

/**
 * A contagem por candidato de TODOS os candidatos, em uma consulta agregada só — mesmo motivo de
 * `contarPorVaga()`: a lista de candidatos (US-008) mostra "2 entrevistas · Analista de Customer
 * Success" em cada linha, e uma consulta por linha faria trinta consultas para mostrar números
 * pequenos.
 *
 * Cancelada e expirada ficam de fora, como lá: um convite que não vale mais não é uma entrevista a
 * mais no histórico da pessoa. A "última vaga" é a da entrevista mais recente que sobrou.
 */
export function contarPorCandidato(): Record<string, ContagemCandidato> {
  expirarVencidas();
  // `MAX(criadoEm)` escolhe a linha; o `vagaId` que vem junto é o dessa mesma linha (o SQLite garante
  // isso para uma agregação com um único MAX/MIN na lista de seleção).
  const linhas = banco()
    .prepare(
      `SELECT candidatoId, COUNT(*) AS total, vagaId, MAX(criadoEm) AS ultima
         FROM entrevistas
        WHERE status NOT IN ('cancelada', 'expirada')
        GROUP BY candidatoId`,
    )
    .all() as { candidatoId: string; total: number; vagaId: string; ultima: string }[];

  const contagens: Record<string, ContagemCandidato> = {};
  for (const linha of linhas) {
    contagens[linha.candidatoId] = { total: Number(linha.total), ultimaVagaId: linha.vagaId };
  }
  return contagens;
}

/**
 * Quantas entrevistas existem, sem filtro nenhum.
 *
 * É o que separa "ainda não há nada aqui" (a tela de boas-vindas da US-015, com o caminho para abrir
 * uma vaga) de "nada com estes filtros" (uma linha de texto e os filtros de volta): as duas telas
 * pedem palavras diferentes, e a lista filtrada sozinha não sabe distinguir os dois casos.
 */
export function contarEntrevistas(): number {
  const linha = banco().prepare("SELECT COUNT(*) AS total FROM entrevistas").get() as { total: number };
  return Number(linha.total);
}

/**
 * A "fotografia" que o Início usa (US-022 da PRD): como o processo estava num instante.
 *
 * Três dos quatro números do topo são **fila**, não movimento: "quantas pessoas ainda não
 * responderam" e "quantos pareceres ainda esperam a sua decisão" só querem dizer alguma coisa como
 * estoque. Por isso a mesma consulta é feita duas vezes, uma para agora e outra para trinta dias
 * atrás — a fila daquele dia é reconstruída a partir dos carimbos (`convidadaEm`, `iniciadaEm`,
 * `concluidaEm`, `decisaoEm`), e não do status de hoje: contar o estado atual nas duas pontas faria
 * a fila de um mês atrás parecer sempre vazia, e toda variação nasceria positiva.
 *
 * `concluidas` é o único que é movimento (o que aconteceu entre `desde` e `instante`) — uma conta
 * acumulada de entrevistas concluídas só cresce e não diz nada.
 */
export type FotografiaEntrevistas = {
  /** Convite entregue e conversa ainda não começada naquele instante. */
  aguardando: number;
  /** Conversa concluída e decisão ainda não tomada naquele instante. */
  aDecidir: number;
  /** Conversas concluídas entre `desde` e `instante`. */
  concluidas: number;
  /** Entrevistas que já existiam no instante — é o que separa "não mudou" de "não havia nada". */
  total: number;
};

export function fotografia(instante: string, desde: string): FotografiaEntrevistas {
  expirarVencidas();
  const linha = banco()
    .prepare(
      `SELECT
         COUNT(CASE WHEN convidadaEm IS NOT NULL AND convidadaEm <= ?
                     AND (iniciadaEm IS NULL OR iniciadaEm > ?)
                     AND (concluidaEm IS NULL OR concluidaEm > ?)
                     AND (expiraEm IS NULL OR expiraEm > ?)
                     AND status <> 'cancelada' THEN 1 END) AS aguardando,
         COUNT(CASE WHEN concluidaEm IS NOT NULL AND concluidaEm <= ?
                     AND (decisaoEm IS NULL OR decisaoEm > ?) THEN 1 END) AS aDecidir,
         COUNT(CASE WHEN concluidaEm IS NOT NULL AND concluidaEm <= ? AND concluidaEm > ? THEN 1 END) AS concluidas,
         COUNT(CASE WHEN criadoEm <= ? THEN 1 END) AS total
       FROM entrevistas`,
    )
    .get(instante, instante, instante, instante, instante, instante, instante, desde, instante) as {
    aguardando: number;
    aDecidir: number;
    concluidas: number;
    total: number;
  };
  return {
    aguardando: Number(linha.aguardando),
    aDecidir: Number(linha.aDecidir),
    concluidas: Number(linha.concluidas),
    total: Number(linha.total),
  };
}
