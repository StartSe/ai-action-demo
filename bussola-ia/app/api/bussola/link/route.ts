// "Criar link de avaliação": salva o questionário atual do editor e cria o formulário público
// (lib/link-avaliacao.ts) a partir dele. GET lista "Avaliações em andamento" no painel.
import { salvar as salvarQuestionario } from "@/lib/questionarios";
import { criarLinkAvaliacao, listarAvaliacoesEmAndamento } from "@/lib/link-avaliacao";
import type { Questionario } from "@/lib/types";

const PRAZOS_VALIDOS = [7, 30, 90];
const LIMITES_VALIDOS = [10, 50, 200];

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const questionario = corpo?.questionario as Questionario | undefined;
  const titulo = typeof corpo?.titulo === "string" ? corpo.titulo.trim() : "";
  const empresa = typeof corpo?.empresa === "string" ? corpo.empresa.trim() : "";
  const expiraEmDias = PRAZOS_VALIDOS.includes(Number(corpo?.expiraEmDias)) ? Number(corpo.expiraEmDias) : 30;
  const limiteBruto = corpo?.limite;
  const limite = limiteBruto === null ? undefined : LIMITES_VALIDOS.includes(Number(limiteBruto)) ? Number(limiteBruto) : 50;

  if (!empresa) return Response.json({ error: "Informe o nome da empresa." }, { status: 400 });
  if (!titulo) return Response.json({ error: "Informe o título da avaliação." }, { status: 400 });
  if (!questionario || !Array.isArray(questionario.perguntas) || questionario.perguntas.length === 0) {
    return Response.json({ error: "O questionário precisa de ao menos uma pergunta." }, { status: 400 });
  }

  try {
    const questionarioId = salvarQuestionario({ titulo: questionario.titulo, questionario });
    const codigo = criarLinkAvaliacao({ questionarioId, titulo, empresa, expiraEmDias, limite });
    return Response.json({ codigo });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível criar o link de avaliação.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}

/** "Avaliações em andamento" no painel. */
export async function GET() {
  return Response.json({ itens: listarAvaliacoesEmAndamento() });
}
