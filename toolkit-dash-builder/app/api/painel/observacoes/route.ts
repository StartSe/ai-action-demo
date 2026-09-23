// POST analisa o painel e devolve até três observações (anomalia, tendência, sugestão). Nunca é chamado sozinho.
import { respostaErro } from "@/lib/ai";
import { observarPainel } from "@/lib/painel";
import type { EspecPainel } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { painel?: EspecPainel };
  if (!corpo.painel || !Array.isArray(corpo.painel.componentes) || corpo.painel.componentes.length === 0) {
    return Response.json({ error: "Gere um painel antes de pedir uma análise." }, { status: 400 });
  }
  try {
    return Response.json(await observarPainel(corpo.painel));
  } catch (err) {
    return respostaErro(err);
  }
}
