// Publica uma versão: { n } (padrão: a última). /s/<slug> passa a servir essa versão; as edições seguintes
// criam versões novas sem mexer no que está no ar até a próxima publicação.
import { publicar } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: RouteContext<"/api/sites/[id]">) {
  const { id } = await params;
  try {
    const corpo = await corpoJson(req);
    const { projeto, versao } = publicar(id, corpo.n);
    return Response.json({ projeto, versao: versao.n });
  } catch (err) {
    return respostaErroSites(err);
  }
}
