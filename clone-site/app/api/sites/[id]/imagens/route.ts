// Logo e imagens de um site: GET lista (sem os dados), POST recebe multipart/form-data
// (`arquivo`, `papel` = logo|imagem, `descricao` opcional) e grava em lib/assets.ts.
import { adicionar, listar } from "@/lib/assets";
import { ErroDePedido } from "@/lib/gerador";
import { obter, ProjetoNaoEncontrado } from "@/lib/projetos";
import { respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]/imagens">) {
  const { id } = await params;
  if (!obter(id)) return respostaErroSites(new ProjetoNaoEncontrado());
  return Response.json({ itens: listar(id) });
}

export async function POST(req: Request, { params }: RouteContext<"/api/sites/[id]/imagens">) {
  const { id } = await params;
  try {
    if (!obter(id)) throw new ProjetoNaoEncontrado();
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) throw new ErroDePedido("Envie o arquivo da imagem.");
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const asset = adicionar(id, { papel: form?.get("papel"), nome: arquivo.name, buffer, descricao: form?.get("descricao") });
    return Response.json({ asset, itens: listar(id) }, { status: 201 });
  } catch (err) {
    return respostaErroSites(err);
  }
}
