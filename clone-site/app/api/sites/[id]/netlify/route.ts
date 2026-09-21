// Publicação externa de um site na Netlify: GET estado (conectada? já publicado? qual versão?), POST publica a
// versão que está no ar aqui (ou { n }) e devolve o endereço, DELETE apaga o site lá e desfaz o vínculo.
import { ErroDePedido } from "@/lib/gerador";
import { netlifyConectada, publicarNaNetlify, removerDaNetlify } from "@/lib/netlify";
import { definirPublicacaoExterna, obter, paginaDoProjeto, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]/netlify">) {
  const { id } = await params;
  const projeto = obter(id);
  if (!projeto) return respostaErroSites(new ProjetoNaoEncontrado());
  return Response.json({ conectada: netlifyConectada(), publicacao: projeto.netlify ?? null, versaoPublicada: projeto.versaoPublicada ?? null });
}

export async function POST(req: Request, { params }: RouteContext<"/api/sites/[id]/netlify">) {
  const { id } = await params;
  try {
    const projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (!netlifyConectada()) throw new ErroDePedido("Conecte a Netlify em Configurações antes de publicar lá.");
    const salva = paginaDoProjeto(projeto);
    if (projeto.estado !== "pronto" || !salva) throw new ErroDePedido("O site ainda não foi gerado. Publique depois de ficar pronto.");
    const corpo = await corpoJson(req);
    const versoes = salva.pagina.versoes;
    const alvo = corpo.n === undefined || corpo.n === null
      ? versoes.find((v) => v.n === projeto.versaoPublicada) ?? versoes[versoes.length - 1]
      : versoes.find((v) => v.n === Number(corpo.n));
    if (!alvo) throw new ErroDePedido("Essa versão não existe.");
    let publicacao;
    try {
      publicacao = await publicarNaNetlify(projeto, alvo.html, alvo.n);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Não foi possível publicar na Netlify." }, { status: 502 });
    }
    const atualizado = definirPublicacaoExterna(id, publicacao);
    return Response.json({ conectada: true, publicacao, versaoPublicada: atualizado.versaoPublicada ?? null, projeto: atualizado });
  } catch (err) {
    return respostaErroSites(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/sites/[id]/netlify">) {
  const { id } = await params;
  try {
    const projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (projeto.netlify?.siteId) await removerDaNetlify(projeto.netlify.siteId);
    const atualizado = definirPublicacaoExterna(id, null);
    return Response.json({ conectada: netlifyConectada(), publicacao: null, versaoPublicada: atualizado.versaoPublicada ?? null, projeto: atualizado });
  } catch (err) {
    return respostaErroSites(err);
  }
}
