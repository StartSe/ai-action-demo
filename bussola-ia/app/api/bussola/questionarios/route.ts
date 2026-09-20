import { validarQuestionario } from "@/lib/assessment-input";
import { guardarQuestionario } from "@/lib/link-avaliacao";
import { listar } from "@/lib/questionarios";
import type { Questionario } from "@/lib/types";

/** Lista "Meus questionários" (só id/título/data, sem o questionário inteiro). */
export async function GET() {
  return Response.json({ itens: listar(20) });
}

/** Salva o questionário editado: o mesmo título atualiza o salvo em vez de duplicar (lib/link-avaliacao.ts:guardarQuestionario). */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as {
    titulo?: string;
    questionario?: Questionario;
  };
  if (
    typeof corpo.titulo !== "string" ||
    !corpo.titulo.trim() ||
    corpo.titulo.length > 200
  )
    return Response.json(
      { error: "Informe um título para o questionário." },
      { status: 400 },
    );
  if (!validarQuestionario(corpo.questionario)) {
    return Response.json(
      { error: "O questionário precisa de ao menos uma pergunta." },
      { status: 400 },
    );
  }
  const { id, atualizado } = guardarQuestionario({
    titulo: corpo.titulo,
    questionario: { ...corpo.questionario, titulo: corpo.titulo.trim() },
  });
  return Response.json({ id, atualizado });
}
