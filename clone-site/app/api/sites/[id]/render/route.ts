import { listarPublicacoes } from "@/lib/publicacoes";
import { ErroDePedido } from "@/lib/gerador";
import { consultarRender, publicarNoRender, renderConectado } from "@/lib/render";
import { definirPublicacaoExterna, obter, paginaDoProjeto, ProjetoNaoEncontrado } from "@/lib/projetos";
import { corpoJson, respostaErroSites } from "@/lib/resposta-sites";

export const dynamic = "force-dynamic";
const publicando = new Set<string>();
type Contexto = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Contexto) {
  const { id } = await params;
  try {
    let projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (projeto.render?.estado === "publicando" && !publicando.has(id)) {
      const antes = JSON.stringify(projeto.render);
      const pub = await consultarRender(projeto.render);
      const atual = obter(id);
      if (!atual) throw new ProjetoNaoEncontrado();
      projeto = JSON.stringify(atual.render) === antes && JSON.stringify(pub) !== antes ? definirPublicacaoExterna(id, pub, "render") : atual;
    }
    return Response.json({ conectada: renderConectado(), publicacao: projeto.render ?? null, projeto }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return respostaErroSites(err); }
}

export async function POST(req: Request, { params }: Contexto) {
  const { id } = await params;
  if (publicando.has(id)) return Response.json({ error: "Aguarde a publicação em andamento." }, { status: 409 });
  publicando.add(id);
  try {
    let projeto = obter(id);
    if (!projeto) throw new ProjetoNaoEncontrado();
    if (!renderConectado()) throw new ErroDePedido("Conecte o Render em Configurações.");
    if (projeto.render?.estado === "publicando") {
      projeto = definirPublicacaoExterna(id, await consultarRender(projeto.render), "render");
      if (projeto.render?.estado === "publicando") return Response.json({ conectada: true, projeto, publicacao: projeto.render }, { status: 202 });
    }
    const salva = paginaDoProjeto(projeto);
    if (projeto.estado !== "pronto" || !salva) throw new ErroDePedido("Gere o site antes de publicar.");
    const corpo = await corpoJson(req);
    const alvo = corpo.n === undefined ? salva.pagina.versoes.at(-1) : salva.pagina.versoes.find((v) => v.n === Number(corpo.n));
    if (!alvo) throw new ErroDePedido("Essa versão não existe.");
    if (corpo.rollback === true && !listarPublicacoes(id).some((p) => p.destino === "render" && p.versao === alvo.n)) throw new ErroDePedido("Escolha uma versão já publicada no Render.");
    const publicacao = await publicarNoRender(projeto, alvo.html, alvo.n, (pub) => definirPublicacaoExterna(id, pub, "render"), corpo.rollback === true);
    return Response.json({ conectada: true, publicacao, projeto: obter(id) }, { status: 202 });
  } catch (err) { return respostaErroSites(err); }
  finally { publicando.delete(id); }
}
