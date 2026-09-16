import { gerarCartaz } from "@/lib/cartaz";
import { esperar } from "@/lib/demo";
import { ErroImagem, gerarImagemOpenAI, imagensEnabled } from "@/lib/imagens";
import type { Rede } from "@/lib/types";

const REDES: Rede[] = ["linkedin", "instagram", "x"];

// Gera a imagem do post. Com OPENAI_API_KEY usa gpt-image-1 (ou o modelo escolhido); sem ela, ou com
// `cartaz: true` no corpo (prévia rápida e offline do ?exemplo=1), um cartaz SVG local no acento do app.
// Resposta: { demo, url, aviso?, acao? } — `demo: true` marca o cartaz provisório; `aviso`/`acao` aparecem
// quando a OpenAI falhou por falta de crédito e o app caiu no cartaz sozinho.
// Para trocar de provedor (ex.: Higgsfield), basta alterar lib/imagens.ts mantendo a resposta { url }.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; rede?: Rede; texto?: string; marca?: string; acento?: string; cartaz?: boolean };
  const { prompt, texto, marca, acento } = body;
  const rede: Rede = REDES.includes(body.rede as Rede) ? (body.rede as Rede) : "linkedin";
  if (!prompt && !texto) {
    return Response.json({ error: "Envie a descrição da imagem." }, { status: 400 });
  }
  const cartaz = () => gerarCartaz({ texto: texto || prompt, rede, marca, acento });
  try {
    if (body.cartaz === true) {
      return Response.json({ demo: true, url: cartaz() });
    }
    if (!imagensEnabled()) {
      await esperar(900);
      return Response.json({ demo: true, url: cartaz() });
    }
    const url = await gerarImagemOpenAI({ prompt: prompt || String(texto), rede });
    return Response.json({ demo: false, url });
  } catch (err) {
    if (err instanceof ErroImagem) {
      if (err.usarCartaz) {
        return Response.json({ demo: true, url: cartaz(), aviso: err.message, codigo: err.codigo, acao: err.acao });
      }
      return Response.json({ error: err.message, codigo: err.codigo, acao: err.acao }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Não foi possível gerar a imagem agora. Tente novamente." }, { status: 500 });
  }
}
