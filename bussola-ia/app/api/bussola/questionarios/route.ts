import { listar, salvar } from "@/lib/questionarios";
import type { Questionario } from "@/lib/types";

/** Lista "Meus questionários" (só id/título/data, sem o questionário inteiro). */
export async function GET() {
  return Response.json({ itens: listar(20) });
}

/** Salva uma cópia do questionário editado; devolve o id gerado. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { titulo?: string; questionario?: Questionario };
  if (!corpo.titulo || !corpo.titulo.trim()) return Response.json({ error: "Informe um título para o questionário." }, { status: 400 });
  if (!corpo.questionario || !Array.isArray(corpo.questionario.perguntas) || corpo.questionario.perguntas.length === 0) {
    return Response.json({ error: "O questionário precisa de ao menos uma pergunta." }, { status: 400 });
  }
  const id = salvar({ titulo: corpo.titulo.trim(), questionario: corpo.questionario });
  return Response.json({ id });
}
