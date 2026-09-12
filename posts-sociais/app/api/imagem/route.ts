import { gerarCartaz } from "@/lib/cartaz";
import { esperar } from "@/lib/demo";
import { getConfig } from "@/lib/store";
import type { Rede } from "@/lib/types";

const imagensEnabled = () => Boolean(getConfig("OPENAI_API_KEY"));

// Gera a imagem do post. Com OPENAI_API_KEY usa gpt-image-1; sem ela, um cartaz SVG local.
// Para trocar de provedor (ex.: Higgsfield), basta alterar esta rota mantendo a resposta { url }.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string; rede?: Rede; texto?: string; marca?: string };
  const { prompt, rede, texto, marca } = body;
  if (!prompt && !texto) {
    return Response.json({ error: "Envie a descrição da imagem." }, { status: 400 });
  }
  try {
    if (!imagensEnabled()) {
      await esperar(900);
      return Response.json({ demo: true, url: gerarCartaz({ texto: texto || prompt, rede, marca }) });
    }
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getConfig("OPENAI_API_KEY")}` },
      body: JSON.stringify({ model: getConfig("OPENAI_IMAGE_MODEL") || "gpt-image-1", prompt, size: rede === "instagram" ? "1024x1024" : "1536x1024", n: 1 }),
    });
    if (r.status === 401) {
      return Response.json({ error: "A chave da OpenAI é inválida. Confira em /setup." }, { status: 502 });
    }
    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("OpenAI images", r.status, detalhe);
      return Response.json({ error: "O provedor de imagens não respondeu. Verifique a chave em /setup e tente novamente." }, { status: 502 });
    }
    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("O provedor de imagens devolveu uma resposta vazia.");
    return Response.json({ demo: false, url: `data:image/png;base64,${b64}` });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a imagem agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
