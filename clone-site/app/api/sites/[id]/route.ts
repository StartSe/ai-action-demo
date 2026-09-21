// Um site: GET (sem a imagem; quando pronto, inclui a página com as versões e a proveniência),
// PATCH (nome, slug; marca/instrucoes/briefing/stack só em rascunho ou falhou) e DELETE.
import { apagar, definirSlug, editarPedido, obter, paginaDoProjeto, ProjetoNaoEncontrado, renomear } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  const projeto = obter(id);
  if (!projeto) return respostaErroSites(new ProjetoNaoEncontrado());
  const salva = projeto.estado === "pronto" ? paginaDoProjeto(projeto) : null;
  return Response.json({ projeto, pagina: salva?.pagina ?? null, meta: salva?.meta ?? null });
}

export async function PATCH(req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  try {
    const corpo = await corpoJson(req);
    if (corpo.nome !== undefined) renomear(id, corpo.nome);
    if (corpo.slug !== undefined) definirSlug(id, corpo.slug);
    const { marca, instrucoes, briefing, stack } = corpo;
    if ([marca, instrucoes, briefing, stack].some((v) => v !== undefined)) editarPedido(id, { marca, instrucoes, briefing, stack });
    const projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    return Response.json({ projeto });
  } catch (err) {
    return respostaErroSites(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  apagar(id);
  return Response.json({ ok: true });
}
