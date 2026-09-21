// POST refina um painel a partir de um pedido em texto; grava o resultado quando `id` é informado.
import { respostaErro } from "@/lib/ai";
import { refinarPainel } from "@/lib/painel";
import type { EspecPainel } from "@/lib/types";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { painel?: EspecPainel; pedido?: unknown; id?: unknown };
  const pedido = typeof corpo.pedido === "string" ? corpo.pedido.trim() : "";
  if (pedido.length < 3) {
    return Response.json({ error: "Diga o que você quer mudar no painel." }, { status: 400 });
  }
  if (!corpo.painel || !Array.isArray(corpo.painel.componentes) || corpo.painel.componentes.length === 0) {
    return Response.json({ error: "Gere um painel antes de pedir um ajuste." }, { status: 400 });
  }
  try {
    const id = typeof corpo.id === "string" && corpo.id ? corpo.id : undefined;
    return Response.json(await refinarPainel(corpo.painel, pedido.slice(0, 500), id));
  } catch (err) {
    return respostaErro(err);
  }
}
