// Lógica de avaliação da entrevista e do link público por candidato, compartilhada entre a rota HTTP
// (app/api/entrevista/avaliar/route.ts) e o link do candidato (app/api/entrevista/candidato/[token]/route.ts),
// para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, mensagemEncerramento, proximaPerguntaDemo, scorecardDemo } from "./demo";
import { criar, type ParametrosPublicos } from "./formularios";
import { listar, obter, salvar } from "./historico";
import type { CandidatoRanking, Ranking, Recomendacao, Scorecard, Troca, Vaga } from "./types";

const SYSTEM_AVALIAR = `Você é uma especialista em recrutamento e seleção que avalia a transcrição de uma entrevista de triagem conduzida por uma IA, para apoiar a decisão do gestor de contratação.
Regras:
- Baseie a avaliação apenas no que foi dito na conversa e nos requisitos da vaga.
- Seja honesta: se a conversa foi curta ou rasa, isso deve refletir em notas mais baixas e pontos de atenção.
- "nota_geral" é um número de 0 a 10 (pode ter uma casa decimal).
- "criterios" deve conter de 3 a 5 critérios derivados dos principais requisitos da vaga, cada um com nota de 0 a 10 e uma evidência curta extraída da conversa.
- Cada critério também deve trazer "pergunta": o número da pergunta (conforme numerada na transcrição abaixo) cuja resposta sustenta a evidência. Se nenhuma pergunta específica sustentar bem o critério, omita "pergunta".
- Máximo de 4 pontos fortes, 4 pontos de atenção e 4 próximos passos.
- "recomendacao" deve ser exatamente um destes valores: "avançar", "avaliar com o gestor" ou "não avançar".
Formato de saída (JSON):
{
  "nota_geral": 0,
  "resumo": "2 a 3 frases sobre o desempenho geral do candidato na triagem",
  "criterios": [{"criterio": "", "nota": 0, "evidencia": "", "pergunta": 0}],
  "pontos_fortes": [""],
  "pontos_atencao": [""],
  "recomendacao": "avançar|avaliar com o gestor|não avançar",
  "proximos_passos": [""]
}`;

const SYSTEM_PERGUNTA = `Você é uma entrevistadora de IA que conduz a primeira triagem por voz e texto de candidatos para vagas de empresas brasileiras, no lugar do gestor de contratação.
Regras:
- Faça UMA pergunta por vez, curta (no máximo 2 frases), em português do Brasil.
- Baseie as perguntas nos principais requisitos da vaga e no que já foi respondido. Não repita um tema já coberto.
- Se a última resposta do candidato foi vaga, genérica ou muito curta, faça uma pergunta de follow-up pedindo um exemplo concreto em vez de mudar de assunto.
- Adapte o tom: "acolhedor" é mais caloroso e usa frases de transição; "objetivo" é direto e enxuto.
- Nunca inclua saudação de encerramento nem mencione avaliação, nota ou scorecard.
Formato de saída (JSON): {"pergunta": "texto da pergunta"}`;

export function normalizarHistorico(historico: unknown): Troca[] {
  if (!Array.isArray(historico)) return [];
  return historico.filter(
    (h): h is Troca => Boolean(h) && (h.papel === "entrevistadora" || h.papel === "candidato") && Boolean(h.texto)
  );
}

/** Numera as perguntas da entrevistadora na ordem em que aparecem, para o modelo poder referenciá-las em "pergunta". */
function formatarHistorico(historico: Troca[]): string {
  if (!historico.length) return "(nenhuma troca ainda)";
  let n = 0;
  return historico
    .map((h) => (h.papel === "entrevistadora" ? `Pergunta ${++n}: ${h.texto}` : `Candidato: ${h.texto}`))
    .join("\n");
}

function construirPromptAvaliacao({ vaga, historico }: { vaga: Vaga; historico: Troca[] }) {
  return `Vaga: ${vaga.titulo}
Principais requisitos:
${vaga.requisitos}
Nome do candidato: ${vaga.candidato || "não informado"}

Transcrição completa da entrevista:
${formatarHistorico(historico)}

Gere o scorecard da triagem.`;
}

/** Gera o scorecard a partir da vaga e da transcrição, e salva no histórico; tipo/expiraEmDias deixam distinguir um scorecard gerado pelo gestor de um gerado por um link de candidato. */
export async function gerarScorecard(
  vaga: Vaga,
  historico: Troca[],
  opts: { tipo?: string; expiraEmDias?: number } = {}
): Promise<{ demo: boolean; scorecard: Scorecard; meta: Meta; id: string }> {
  const tipo = opts.tipo ?? "entrevista";
  const insumo = "toda a conversa e os requisitos da vaga";
  if (!aiEnabled()) {
    await esperar(1200);
    const scorecard = scorecardDemo({ vaga, historico });
    const metaGerada = meta({ demo: true, insumo });
    const id = salvar({ tipo, titulo: `Scorecard de ${vaga.candidato}`, entrada: { vaga, historico }, saida: scorecard, meta: metaGerada, expiraEmDias: opts.expiraEmDias });
    return { demo: true, scorecard, meta: metaGerada, id };
  }
  const prompt = construirPromptAvaliacao({ vaga, historico });
  const scorecard = await askJSON<Scorecard>({ system: SYSTEM_AVALIAR, prompt, maxTokens: 2000 });
  const metaGerada = meta({ demo: false, insumo });
  const id = salvar({ tipo, titulo: `Scorecard de ${vaga.candidato}`, entrada: { vaga, historico }, saida: scorecard, meta: metaGerada, expiraEmDias: opts.expiraEmDias });
  return { demo: false, scorecard, meta: metaGerada, id };
}

/** Parâmetros do link de candidato: a vaga inteira, para a sala de entrevista e a avaliação usarem os mesmos dados. */
export type ParametrosCandidato = ParametrosPublicos & { vaga: Vaga };

/** Cria o link público (/entrevista/<código>) que o candidato usa para conversar sozinho com a entrevistadora. */
export function criarLinkCandidato(vaga: Vaga, expiraEmDias: number): string {
  const parametros: ParametrosCandidato = {
    marca: "E",
    nome: "Entrevistadora IA",
    titulo: `Entrevista para ${vaga.titulo}`,
    descricao: `Converse com a entrevistadora de IA sobre a vaga de ${vaga.titulo}. Leva poucos minutos, por voz ou texto.`,
    vaga,
  };
  return criar({ tipo: "scorecard", campos: [], parametros, expiraEmDias, limite: 1 });
}

export type CandidatoDaVaga = { id: string; candidato: string; nota_geral: number; recomendacao: Recomendacao; criadoEm: string };

type EntradaScorecard = { vaga: Vaga; historico: Troca[] };

/** Scorecards já salvos (pelo gestor ou por link de candidato) da mesma vaga, sem os campos pesados; não há um id de vaga próprio, então o agrupamento é pelo título digitado. */
function registrosDaVaga(tituloVaga: string) {
  const titulo = tituloVaga.trim().toLowerCase();
  if (!titulo) return [];
  return listar(200)
    .filter((r) => r.tipo === "entrevista" || r.tipo === "scorecard")
    .map((r) => obter<EntradaScorecard, Scorecard, Meta>(r.id))
    .filter((r): r is NonNullable<typeof r> => r !== null && r.entrada.vaga.titulo.trim().toLowerCase() === titulo);
}

/** Candidatos desta vaga, mais recentes primeiro, para o bloco "Candidatos desta vaga" no painel. */
export function listarCandidatosDaVaga(tituloVaga: string): CandidatoDaVaga[] {
  return registrosDaVaga(tituloVaga).map((r) => ({
    id: r.id,
    candidato: r.entrada.vaga.candidato,
    nota_geral: r.saida.nota_geral,
    recomendacao: r.saida.recomendacao,
    criadoEm: r.criadoEm,
  }));
}

/** Gera e salva o ranking dos candidatos desta vaga, ordenado por nota (maior primeiro); null se houver menos de 2 candidatos avaliados. */
export function gerarRanking(tituloVaga: string): { ranking: Ranking; meta: Meta; id: string } | null {
  const registros = registrosDaVaga(tituloVaga);
  if (registros.length < 2) return null;
  const candidatos: CandidatoRanking[] = registros
    .map((r) => ({
      id: r.id,
      candidato: r.entrada.vaga.candidato,
      nota_geral: r.saida.nota_geral,
      recomendacao: r.saida.recomendacao,
      pontos_fortes: r.saida.pontos_fortes,
      pontos_atencao: r.saida.pontos_atencao,
    }))
    .sort((a, b) => b.nota_geral - a.nota_geral);
  const ranking: Ranking = { vagaTitulo: tituloVaga.trim(), candidatos };
  const metaGerada = meta({ demo: !aiEnabled(), insumo: "toda a lista de scorecards desta vaga" });
  const id = salvar({ tipo: "ranking", titulo: `Ranking de ${ranking.vagaTitulo}`, entrada: { vagaTitulo: ranking.vagaTitulo }, saida: ranking, meta: metaGerada });
  return { ranking, meta: metaGerada, id };
}

/** Quantas perguntas a entrevista tem, dentro dos limites aceitos (4 a 6). */
export function numeroDePerguntas(vaga: Vaga): number {
  return Math.min(6, Math.max(4, Number(vaga.numero_perguntas) || 5));
}

function construirPromptPergunta({ vaga, historico, perguntasFeitas, numeroPerguntas }: { vaga: Vaga; historico: Troca[]; perguntasFeitas: number; numeroPerguntas: number }) {
  const conversa = historico.length
    ? historico.map((h) => `${h.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}: ${h.texto}`).join("\n")
    : "(nenhuma troca ainda)";
  return `Vaga: ${vaga.titulo}
Principais requisitos:
${vaga.requisitos}
Tom da entrevista: ${vaga.tom || "acolhedor"}
Nome do candidato: ${vaga.candidato || "não informado"}
Esta será a pergunta número ${perguntasFeitas + 1} de ${numeroPerguntas}.

Conversa até agora:
${conversa}

Gere a próxima pergunta da entrevista.`;
}

/** Próxima fala da entrevistadora, compartilhada pela rota do gestor (app/api/entrevista/proxima) e
 * pela rota pública do candidato (app/api/entrevista/candidato/[token]/proxima), para o prompt e a
 * regra de encerramento existirem uma vez só. */
export async function proximaPergunta(vaga: Vaga, historico: Troca[]): Promise<{ pergunta: string; encerrar: boolean }> {
  const numeroPerguntas = numeroDePerguntas(vaga);
  const perguntasFeitas = historico.filter((h) => h.papel === "entrevistadora").length;
  if (perguntasFeitas >= numeroPerguntas) {
    return { pergunta: mensagemEncerramento({ vaga }), encerrar: true };
  }
  if (!aiEnabled()) {
    await esperar(700);
    return { pergunta: proximaPerguntaDemo({ vaga, historico, perguntasFeitas }), encerrar: false };
  }
  const prompt = construirPromptPergunta({ vaga, historico, perguntasFeitas, numeroPerguntas });
  const resposta = await askJSON<{ pergunta: string }>({ system: SYSTEM_PERGUNTA, prompt, maxTokens: 500 });
  return { pergunta: resposta.pergunta, encerrar: false };
}
