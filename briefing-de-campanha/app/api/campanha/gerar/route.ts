// Gera e salva o briefing a partir da campanha e da conversa completa.
import { respostaErro } from "@/lib/ai";
import { gerarBriefing, normalizarHistorico } from "@/lib/campanha";
import type { Campanha } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { campanha, historico } = (body || {}) as { campanha?: Campanha; historico?: unknown };
  if (!campanha || !campanha.nome || !campanha.objetivo || !campanha.produto) {
    return Response.json({ error: "Informe ao menos o nome, o objetivo e o produto da campanha." }, { status: 400 });
  }
  try {
    return Response.json(await gerarBriefing(campanha, normalizarHistorico(historico)));
  } catch (err) {
    return respostaErro(err);
  }
}
