import { respostaErro } from "@/lib/ai";
import { criarAcao, listarAcoes } from "@/lib/acoes";

export async function GET() {
  return Response.json({ itens: listarAcoes() });
}

/** Cadastro manual de uma ação (form "Nova ação"): dono e prazo nunca são obrigatórios, só o título. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { titulo?: string; dono?: string; prazo?: string };
  const titulo = (corpo.titulo ?? "").trim();
  if (!titulo) {
    return Response.json({ error: "Diga o que precisa ser feito." }, { status: 400 });
  }
  if (corpo.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(corpo.prazo)) {
    return Response.json({ error: "O prazo precisa ser uma data válida." }, { status: 400 });
  }
  try {
    const acao = criarAcao({ titulo, dono: corpo.dono, prazo: corpo.prazo, origem: "manual" });
    return Response.json({ acao }, { status: 201 });
  } catch (err) {
    return respostaErro(err);
  }
}
