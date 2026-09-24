import { ConflitoEdicao, ErroDePedido, novaVersao } from "@/lib/gerador";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (!projeto.paginaId || projeto.estado !== "pronto") throw new ErroDePedido("Aguarde o site ficar pronto para editar.");
    const { html, versaoBase, modo } = await corpoJson(req);
    if (typeof html !== "string" || html.length > 1_000_000 || !Number.isInteger(versaoBase)) throw new ErroDePedido("Envie uma página HTML de até 1 MB e a versão que você está editando.");
    return Response.json(novaVersao(projeto.paginaId, html, modo === "codigo" ? "HTML ajustado no editor" : "Textos ajustados diretamente na página", Number(versaoBase)));
  } catch (err) {
    if (err instanceof ConflitoEdicao) return Response.json({ error: err.message }, { status: 409 });
    return respostaErroSites(err);
  }
}
