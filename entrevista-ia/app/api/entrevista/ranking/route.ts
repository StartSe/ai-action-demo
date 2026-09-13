import { gerarRanking } from "@/lib/entrevista";

/** Gera o ranking dos candidatos da vaga (botão "Comparar"), a partir dos scorecards já salvos. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vagaTitulo } = (body || {}) as { vagaTitulo?: string };
  if (!vagaTitulo || !vagaTitulo.trim()) {
    return Response.json({ error: "Informe o título da vaga." }, { status: 400 });
  }
  const resultado = gerarRanking(vagaTitulo);
  if (!resultado) {
    return Response.json({ error: "É preciso ter ao menos 2 candidatos avaliados nesta vaga para comparar." }, { status: 400 });
  }
  return Response.json(resultado);
}
