// Fontes que já responderam numa rodada em andamento (o Loading da tela consulta a cada segundo).
import { fontesRespondidas, rodadaValida } from "@/lib/andamento";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rodada = rodadaValida(new URL(req.url).searchParams.get("rodada"));
  if (!rodada) return Response.json({ error: "Rodada inválida." }, { status: 400 });
  return Response.json({ respondidas: fontesRespondidas(rodada) });
}
