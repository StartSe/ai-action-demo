import { conversaAberta } from "@/lib/sala-do-vendedor";
import { transcricao } from "@/lib/sessoes";
import { orientarTurno } from "@/lib/coaching";

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/dica">) {
  const { token } = await params;
  const contexto = conversaAberta(req, token);
  if (contexto instanceof Response) return contexto;
  const corpo = await req.json().catch(() => ({}));
  const ultima = transcricao(contexto.sessao.id).at(-1);
  if (!ultima || ultima.papel !== "cliente" || (corpo?.mensagemId && corpo.mensagemId !== ultima.id)) {
    return Response.json({ error: "Esta fala já mudou. Aguarde a próxima resposta." }, { status: 409 });
  }
  const dica = await orientarTurno(contexto, ultima.id);
  return Response.json({ ...dica, mensagemId: ultima.id }, { headers: { "Cache-Control": "no-store" } });
}
