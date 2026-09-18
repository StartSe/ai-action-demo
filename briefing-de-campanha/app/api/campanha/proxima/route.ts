// Próxima pergunta da conversa de descoberta.
import { respostaErro } from "@/lib/ai";
import { normalizarHistorico, proximaPergunta } from "@/lib/campanha";
import type { Campanha } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { campanha, historico } = (body || {}) as { campanha?: Campanha; historico?: unknown };
  if (!campanha || !campanha.nome || !campanha.objetivo || !campanha.produto) {
    return Response.json({ error: "Informe ao menos o nome, o objetivo e o produto da campanha." }, { status: 400 });
  }
  try {
    return Response.json(await proximaPergunta(campanha, normalizarHistorico(historico)));
  } catch (err) {
    return respostaErro(err);
  }
}
