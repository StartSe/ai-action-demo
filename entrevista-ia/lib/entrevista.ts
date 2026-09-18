// O scorecard antigo: a avaliação da transcrição e o agrupamento por título de vaga, de antes de
// Vaga → Candidato → Entrevista existirem como registros (US-002).
//
// **A condução da conversa saiu daqui na US-016**: `SYSTEM_PERGUNTA`, `proximaPergunta()` e
// `numeroDePerguntas()` foram substituídos por `lib/roteiro.ts`, que conhece a vaga inteira, a
// cultura e a ficha do candidato — e não só um título e uma lista de requisitos digitada num
// formulário. **A avaliação de uma entrevista saiu daqui na US-022**: o parecer de hoje é
// `lib/avaliacao.ts` (três passos, cruzando a conversa com a vaga, a cultura e a ficha do
// candidato). `gerarScorecard` continua de pé só para os caminhos que não têm entrevista no banco —
// a prévia do gestor (`POST /api/entrevista/avaliar`) e os links `scorecard` criados antes da
// US-014, que podem ser removidos a partir de 17/12/2026 junto com o resto daquele tipo.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, scorecardDemo } from "./demo";
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

/** O aviso de conversa interrompida, quando ela foi. Vai no prompt E no resumo pedido ao modelo: uma
 * entrevista encerrada no meio rendeu menos material, e o gestor precisa ler isso em vez de uma nota
 * baixa sem explicação. */
const ENTREVISTA_PARCIAL = `Atenção: esta conversa foi encerrada antes do fim — o candidato respondeu menos perguntas do que o combinado.
Diga isso na primeira frase do "resumo", não penalize o candidato por assuntos que a entrevistadora nem chegou a perguntar, e registre em "pontos_atencao" o que ficou por conversar.`;

function construirPromptAvaliacao({ vaga, historico, parcial }: { vaga: Vaga; historico: Troca[]; parcial?: boolean }) {
  return `${parcial ? `${ENTREVISTA_PARCIAL}

` : ""}Vaga: ${vaga.titulo}
Principais requisitos:
${vaga.requisitos}
Nome do candidato: ${vaga.candidato || "não informado"}

Transcrição completa da entrevista:
${formatarHistorico(historico)}

Gere o scorecard da triagem.`;
}

/** Gera o scorecard a partir da vaga e da transcrição, e salva no histórico; tipo/expiraEmDias deixam
 * distinguir um scorecard gerado pelo gestor de um gerado por um link de candidato. `parcial` marca a
 * conversa encerrada antes do fim (US-021) e fica guardado na entrada, para quem reler o resultado
 * saber de que tamanho de conversa ele saiu. */
export async function gerarScorecard(
  vaga: Vaga,
  historico: Troca[],
  opts: { tipo?: string; expiraEmDias?: number; parcial?: boolean } = {}
): Promise<{ demo: boolean; scorecard: Scorecard; meta: Meta; id: string }> {
  const tipo = opts.tipo ?? "entrevista";
  const insumo = "toda a conversa e os requisitos da vaga";
  if (!aiEnabled()) {
    await esperar(1200);
    const scorecard = scorecardDemo({ vaga, historico });
    const metaGerada = meta({ demo: true, insumo });
    const id = salvar({ tipo, titulo: `Scorecard de ${vaga.candidato}`, entrada: { vaga, historico, parcial: opts.parcial }, saida: scorecard, meta: metaGerada, expiraEmDias: opts.expiraEmDias });
    return { demo: true, scorecard, meta: metaGerada, id };
  }
  const prompt = construirPromptAvaliacao({ vaga, historico, parcial: opts.parcial });
  const scorecard = await askJSON<Scorecard>({ system: SYSTEM_AVALIAR, prompt, maxTokens: 2000 });
  const metaGerada = meta({ demo: false, insumo });
  const id = salvar({ tipo, titulo: `Scorecard de ${vaga.candidato}`, entrada: { vaga, historico, parcial: opts.parcial }, saida: scorecard, meta: metaGerada, expiraEmDias: opts.expiraEmDias });
  return { demo: false, scorecard, meta: metaGerada, id };
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
