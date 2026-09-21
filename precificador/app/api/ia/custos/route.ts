// Prompt 2 — o interrogatório de custos esquecidos, disparado a partir da ficha do item.
import { respostaErro } from "@/lib/ai";
import { precificarItem } from "@/lib/carteira";
import { interrogarCustos } from "@/lib/ia";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { itemId?: string; canalId?: string } | null;
  if (!corpo?.itemId) return Response.json({ error: "Informe o item." }, { status: 400 });

  const atual = precificarItem(corpo.itemId, corpo.canalId);
  if (!atual) return Response.json({ error: "Este item não existe mais." }, { status: 404 });

  try {
    const { custos, meta } = await interrogarCustos(atual.cenario, atual.precificacao);
    return Response.json({ custos, meta });
  } catch (err) {
    return respostaErro(err);
  }
}
