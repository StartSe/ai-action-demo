import { aiEnabled, askJSON } from "@/lib/ai";
import { esperar, scorecardDemo } from "@/lib/demo";
import type { Scorecard, Troca, Vaga } from "@/lib/types";

const SYSTEM_AVALIAR = `Você é uma especialista em recrutamento e seleção que avalia a transcrição de uma entrevista de triagem conduzida por uma IA, para apoiar a decisão do gestor de contratação.
Regras:
- Baseie a avaliação apenas no que foi dito na conversa e nos requisitos da vaga.
- Seja honesta: se a conversa foi curta ou rasa, isso deve refletir em notas mais baixas e pontos de atenção.
- "nota_geral" é um número de 0 a 10 (pode ter uma casa decimal).
- "criterios" deve conter de 3 a 5 critérios derivados dos principais requisitos da vaga, cada um com nota de 0 a 10 e uma evidência curta extraída da conversa.
- Máximo de 4 pontos fortes, 4 pontos de atenção e 4 próximos passos.
- "recomendacao" deve ser exatamente um destes valores: "avançar", "avaliar com o gestor" ou "não avançar".
Formato de saída (JSON):
{
  "nota_geral": 0,
  "resumo": "2 a 3 frases sobre o desempenho geral do candidato na triagem",
  "criterios": [{"criterio": "", "nota": 0, "evidencia": ""}],
  "pontos_fortes": [""],
  "pontos_atencao": [""],
  "recomendacao": "avançar|avaliar com o gestor|não avançar",
  "proximos_passos": [""]
}`;

function normalizarHistorico(historico: unknown): Troca[] {
  if (!Array.isArray(historico)) return [];
  return historico.filter(
    (h): h is Troca => Boolean(h) && (h.papel === "entrevistadora" || h.papel === "candidato") && Boolean(h.texto)
  );
}

function formatarHistorico(historico: Troca[]): string {
  if (!historico.length) return "(nenhuma troca ainda)";
  return historico.map((h) => `${h.papel === "entrevistadora" ? "Entrevistadora" : "Candidato"}: ${h.texto}`).join("\n");
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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vaga, historico } = (body || {}) as { vaga?: Vaga; historico?: unknown };
  if (!vaga || !vaga.titulo || !vaga.requisitos) {
    return Response.json({ error: "Informe ao menos o título da vaga e os principais requisitos." }, { status: 400 });
  }
  const hist = normalizarHistorico(historico);
  if (!hist.length) {
    return Response.json({ error: "É preciso ter ao menos uma resposta do candidato para gerar o scorecard." }, { status: 400 });
  }
  try {
    if (!aiEnabled()) {
      await esperar(1200);
      return Response.json({ demo: true, scorecard: scorecardDemo({ vaga }) });
    }
    const prompt = construirPromptAvaliacao({ vaga, historico: hist });
    const scorecard = await askJSON<Scorecard>({ system: SYSTEM_AVALIAR, prompt, maxTokens: 2000 });
    return Response.json({ demo: false, scorecard });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar o scorecard agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
