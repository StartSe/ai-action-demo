// GET obtém um painel salvo · PUT grava um estado sem IA (Desfazer) · DELETE apaga um.
import type { Meta } from "@/lib/ai";
import { apagar, atualizarSaida, obter } from "@/lib/historico";
import type { EspecPainel, PedidoPainel } from "@/lib/types";
import { validarPainel } from "@/lib/validar-painel";

const NAO_EXISTE = () => Response.json({ error: "Este painel não existe mais." }, { status: 404 });

export async function GET(_req: Request, { params }: RouteContext<"/api/painel/[id]">) {
  const { id } = await params;
  const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
  if (!registro || registro.tipo !== "painel") return NAO_EXISTE();
  return Response.json({ painel: registro.saida, pedido: registro.entrada, meta: registro.meta, criadoEm: registro.criadoEm });
}

/** Persiste o estado restaurado pelo botão "Desfazer" (RF-10 a4). Não chama a IA; mantém `refinadoEm` como veio. */
export async function PUT(req: Request, { params }: RouteContext<"/api/painel/[id]">) {
  const { id } = await params;
  const registro = obter<PedidoPainel, EspecPainel, Meta>(id);
  if (!registro || registro.tipo !== "painel") return NAO_EXISTE();
  const corpo = (await req.json().catch(() => ({}))) as { painel?: unknown };
  const painel = validarPainel(corpo.painel);
  if (painel.componentes.length === 0) {
    return Response.json({ error: "O painel enviado não tem nenhum cartão ou gráfico." }, { status: 400 });
  }
  atualizarSaida(id, painel);
  return Response.json({ ok: true, painel });
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/painel/[id]">) {
  const { id } = await params;
  apagar(id);
  return Response.json({ ok: true });
}
