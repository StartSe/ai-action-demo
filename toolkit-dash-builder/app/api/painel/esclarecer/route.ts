// POST avalia o pedido: heurística local primeiro, IA só no caso duvidoso. Nunca bloqueia a geração.
import { esclarecer } from "@/lib/esclarecer";
import { lerPedido } from "@/lib/pedido";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { descricao?: unknown };
  const pedido = lerPedido(corpo);
  if (pedido instanceof Response) return pedido;
  return Response.json(await esclarecer(pedido.descricao));
}
