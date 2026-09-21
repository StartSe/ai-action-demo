// Remove uma imagem do site. O HTML que já a referencia continua apontando para o endereço (que passa a 404):
// o agente ou a próxima edição troca a referência.
import { apagar, listar } from "@/lib/assets";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: RouteContext<"/api/sites/[id]/imagens/[assetId]">) {
  const { id, assetId } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  if (!apagar(id, assetId)) return Response.json({ error: "Essa imagem não existe mais." }, { status: 404 });
  return Response.json({ ok: true, itens: listar(id) });
}
