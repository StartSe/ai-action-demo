// Sites (projetos): cria um (POST; com `gerar: true` já dispara a geração em segundo plano) e lista (GET ?estado=).
import { criar, iniciarGeracao, listar } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const corpo = await corpoJson(req);
    let projeto = criar(corpo);
    if (corpo.gerar === true) projeto = iniciarGeracao(projeto.id);
    return Response.json({ projeto }, { status: 201 });
  } catch (err) {
    return respostaErroSites(err);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const estado = url.searchParams.get("estado") ?? undefined;
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 50, 1), 200);
  return Response.json({ itens: listar({ estado, limite }) });
}
