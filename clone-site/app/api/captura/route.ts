// Traz a captura de referência a partir de um endereço colado no formulário, sem a pessoa precisar do
// arquivo: endereço terminado em .png/.jpg é baixado direto; qualquer outro é o site a fotografar pelo
// serviço de captura configurado em /setup (integração opcional "captura").
import { ErroCaptura, baixarImagem, capturaConfigurada, capturarSite, pareceImagem } from "@/lib/captura";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof corpo?.url === "string" ? corpo.url.trim() : "";
  if (!url) return Response.json({ error: "Cole o endereço da captura ou do site de referência." }, { status: 400 });

  try {
    const imagem = pareceImagem(url) ? await baixarImagem(url) : await capturarSite(url);
    return Response.json({ imagem, origem: pareceImagem(url) ? "imagem" : "site" });
  } catch (err) {
    if (err instanceof ErroCaptura) {
      return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Não foi possível trazer a captura desse endereço. Tente de novo." }, { status: 500 });
  }
}

/** A tela usa isto para saber se pode oferecer "cole o endereço do site" além do endereço de uma imagem. */
export async function GET() {
  return Response.json({ servicoConectado: capturaConfigurada() });
}
