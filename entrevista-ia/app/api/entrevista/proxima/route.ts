import { aiEnabled, askJSON } from "@/lib/ai";
import { esperar, mensagemEncerramento, proximaPerguntaDemo } from "@/lib/demo";
import type { Troca, Vaga } from "@/lib/types";

const SYSTEM_PERGUNTA = `Você é uma entrevistadora de IA que conduz a primeira triagem por voz e texto de candidatos para vagas de empresas brasileiras, no lugar do gestor de contratação.
Regras:
- Faça UMA pergunta por vez, curta (no máximo 2 frases), em português do Brasil.
- Baseie as perguntas nos principais requisitos da vaga e no que já foi respondido. Não repita um tema já coberto.
- Se a última resposta do candidato foi vaga, genérica ou muito curta, faça uma pergunta de follow-up pedindo um exemplo concreto em vez de mudar de assunto.
- Adapte o tom: "acolhedor" é mais caloroso e usa frases de transição; "objetivo" é direto e enxuto.
- Nunca inclua saudação de encerramento nem mencione avaliação, nota ou scorecard.
Formato de saída (JSON): {"pergunta": "texto da pergunta"}`;

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

function construirPromptPergunta({
  vaga,
  historico,
  perguntasFeitas,
  numeroPerguntas,
}: {
  vaga: Vaga;
  historico: Troca[];
  perguntasFeitas: number;
  numeroPerguntas: number;
}) {
  return `Vaga: ${vaga.titulo}
Principais requisitos:
${vaga.requisitos}
Tom da entrevista: ${vaga.tom || "acolhedor"}
Nome do candidato: ${vaga.candidato || "não informado"}
Esta será a pergunta número ${perguntasFeitas + 1} de ${numeroPerguntas}.

Conversa até agora:
${formatarHistorico(historico)}

Gere a próxima pergunta da entrevista.`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vaga, historico } = (body || {}) as { vaga?: Vaga; historico?: unknown };
  if (!vaga || !vaga.titulo || !vaga.requisitos) {
    return Response.json({ error: "Informe ao menos o título da vaga e os principais requisitos." }, { status: 400 });
  }
  const hist = normalizarHistorico(historico);
  const numeroPerguntas = Math.min(6, Math.max(4, Number(vaga.numero_perguntas) || 5));
  const perguntasFeitas = hist.filter((h) => h.papel === "entrevistadora").length;

  try {
    if (perguntasFeitas >= numeroPerguntas) {
      return Response.json({ pergunta: mensagemEncerramento({ vaga }), encerrar: true });
    }
    if (!aiEnabled()) {
      await esperar(700);
      return Response.json({
        pergunta: proximaPerguntaDemo({ vaga, historico: hist, perguntasFeitas }),
        encerrar: false,
      });
    }
    const prompt = construirPromptPergunta({ vaga, historico: hist, perguntasFeitas, numeroPerguntas });
    const resposta = await askJSON<{ pergunta: string }>({ system: SYSTEM_PERGUNTA, prompt, maxTokens: 500 });
    return Response.json({ pergunta: resposta.pergunta, encerrar: false });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a próxima pergunta agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
