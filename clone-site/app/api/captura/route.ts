// Confere um endereço colado na caixa de criação antes de criar o site: um endereço terminado em .png/.jpg é
// baixado e devolvido como captura; qualquer outro é o site de referência, lido pelo próprio app (lib/captura.ts,
// sem serviço externo), e a resposta traz título, descrição e quantas seções ele tem — o suficiente para a
// pessoa confirmar que é a página certa. A leitura completa acontece de novo na hora de gerar.
import { ErroCaptura, baixarImagem, lerReferencia, pareceImagem } from "@/lib/captura";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof corpo?.url === "string" ? corpo.url.trim() : "";
  if (!url) return Response.json({ error: "Cole o endereço da captura ou do site de referência." }, { status: 400 });

  try {
    if (pareceImagem(url)) return Response.json({ tipo: "imagem", imagem: await baixarImagem(url) });
    const r = await lerReferencia(url);
    return Response.json({ tipo: "site", url: r.url, titulo: r.titulo, descricao: r.descricao, secoes: r.secoes, cores: r.cores.slice(0, 4), fontes: r.fontes });
  } catch (err) {
    if (err instanceof ErroCaptura) return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Não foi possível ler esse endereço. Tente de novo." }, { status: 500 });
  }
}
