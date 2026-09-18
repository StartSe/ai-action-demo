// A conversa que o servidor tem desta entrevista (US-018), lida sem gravar nada.
//
// É o primeiro pedido que a sala faz ao abrir: quem recarregou a página no meio da entrevista volta
// com as falas já trocadas na tela e na pergunta em que parou. Sem ela, a sala desenharia só o que
// aconteceu desde que montou — depois de um F5, uma bolha sozinha.
//
// Os links antigos (tipo `scorecard`, ver lib/convite.ts) não têm entrevista no banco: a conversa
// deles mora no navegador de quem responde, e aqui eles recebem uma conversa vazia, que é a verdade.
import { NextResponse } from "next/server";
import { FECHADO, resolverConvite } from "@/lib/convite";
import { conversaAtual } from "@/lib/roteiro";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };
const VAZIA = { pergunta: "", encerrar: false, indice: 0, total: 0, transcricao: [] };

export async function GET(_request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/conversa">) {
  const { token } = await params;
  const resolucao = resolverConvite(token);
  if (!resolucao.ok) {
    const { titulo, status } = FECHADO[resolucao.motivo];
    return NextResponse.json({ error: `${titulo}.` }, { status, headers: SEM_CACHE });
  }

  const { entrevistaId } = resolucao.sala;
  if (!entrevistaId) return NextResponse.json(VAZIA, { headers: SEM_CACHE });
  try {
    return NextResponse.json((await conversaAtual(entrevistaId)) ?? VAZIA, { headers: SEM_CACHE });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Não conseguimos abrir a sua entrevista agora. Espere alguns segundos e tente de novo." },
      { status: 502, headers: SEM_CACHE }
    );
  }
}
