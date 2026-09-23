// Publicação externa de um site na Netlify: GET estado (conectada? já publicado? qual versão?), POST publica a
// versão que está no ar aqui (ou { n }) e devolve o endereço, DELETE apaga o site lá e desfaz o vínculo.
import { listarPublicacoes } from "@/lib/publicacoes";
import { ErroDePedido } from "@/lib/gerador";
import { netlifyConectada, publicarNaNetlify, removerDaNetlify, consultarPublicacao } from "@/lib/netlify";
import { definirPublicacaoExterna, obter, paginaDoProjeto, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";
const publicando = new Set<string>();

export async function GET(_req: Request, { params }: RouteContext<"/api/sites/[id]/netlify">) {
  const { id } = await params;
  let projeto = obter(id);
  if (!projeto) return respostaErroSites(new ProjetoNaoEncontrado());
  try {
    if (projeto.netlify?.estado === "publicando" && !publicando.has(id)) {
      const pub = await consultarPublicacao(projeto.netlify);
      if (pub.estado !== "publicando") projeto = definirPublicacaoExterna(id, pub);
    }
    return Response.json({ conectada: netlifyConectada(), publicacao: projeto.netlify ?? null, versaoPublicada: projeto.versaoPublicada ?? null, projeto });
  } catch (err) { return respostaErroSites(err); }
}

export async function POST(req: Request, { params }: RouteContext<"/api/sites/[id]/netlify">) {
  const { id } = await params;
  if (publicando.has(id)) return Response.json({ error: "Uma publicação já está em andamento. Aguarde a conclusão." }, { status: 409 });
  publicando.add(id);
  try {
    const projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (!netlifyConectada()) throw new ErroDePedido("Conecte a Netlify em Configurações antes de publicar lá.");
    if (projeto.netlify?.estado === "publicando") return Response.json({ projeto, publicacao: projeto.netlify, conectada: true, versaoPublicada: projeto.versaoPublicada ?? null }, { status: 202 });
    const salva = paginaDoProjeto(projeto);
    if (projeto.estado !== "pronto" || !salva) throw new ErroDePedido("O site ainda não foi gerado. Publique depois de ficar pronto.");
    const corpo = await corpoJson(req);
    const versoes = salva.pagina.versoes;
    const alvo = corpo.n === undefined || corpo.n === null
      ? versoes.find((v) => v.n === projeto.versaoPublicada) ?? versoes[versoes.length - 1]
      : versoes.find((v) => v.n === Number(corpo.n));
    if (!alvo) throw new ErroDePedido("Essa versão não existe.");
    if (corpo.rollback === true && !listarPublicacoes(id).some((p) => p.destino === "netlify" && p.versao === alvo.n)) throw new ErroDePedido("Escolha uma versão já publicada na Netlify.");
    let publicacao;
    try {
      publicacao = await publicarNaNetlify(projeto, alvo.html, alvo.n, (pub) => definirPublicacaoExterna(id, pub));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Não foi possível publicar na Netlify." }, { status: 502 });
    }
    const atualizado = definirPublicacaoExterna(id, publicacao);
    return Response.json({ conectada: true, publicacao, versaoPublicada: atualizado.versaoPublicada ?? null, projeto: atualizado }, { status: publicacao.estado === "publicando" ? 202 : 200 });
  } catch (err) {
    return respostaErroSites(err);
  } finally { publicando.delete(id); }
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
