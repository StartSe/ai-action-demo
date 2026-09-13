// Lógica de avaliação da entrevista e do link público por candidato, compartilhada entre a rota HTTP
// (app/api/entrevista/avaliar/route.ts) e o link do candidato (app/api/entrevista/candidato/[token]/route.ts),
// para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, scorecardDemo } from "./demo";
import { criar, type ParametrosPublicos } from "./formularios";
import { salvar } from "./historico";
import type { Scorecard, Troca, Vaga } from "./types";

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
