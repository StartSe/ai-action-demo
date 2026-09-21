// Um site: GET (sem a imagem; quando pronto, inclui a página com as versões e a proveniência; enquanto gera,
// inclui a prévia parcial montada até aqui), PATCH (nome, slug; marca/instrucoes/briefing/url/stack só em
// rascunho ou falhou) e DELETE.
import { apagar, definirSlug, editarPedido, obter, paginaDoProjeto, progressoDe, ProjetoNaoEncontrado, renomear } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  const projeto = obter(id);
  if (!projeto) return respostaErroSites(new ProjetoNaoEncontrado());
  const salva = projeto.estado === "pronto" ? paginaDoProjeto(projeto) : null;
  const htmlParcial = projeto.estado === "gerando" ? progressoDe(id).htmlParcial : null;
  return Response.json({ projeto, pagina: salva?.pagina ?? null, meta: salva?.meta ?? null, htmlParcial }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  try {
    const corpo = await corpoJson(req);
    if (corpo.nome !== undefined) renomear(id, corpo.nome);
    if (corpo.slug !== undefined) definirSlug(id, corpo.slug);
    const { marca, instrucoes, briefing, stack, url } = corpo;
    if ([marca, instrucoes, briefing, stack, url].some((v) => v !== undefined)) editarPedido(id, { marca, instrucoes, briefing, stack, url });
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
