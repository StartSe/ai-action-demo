// Site publicado: serve o HTML da VERSÃO PUBLICADA de um projeto (por slug ou id) como text/html puro, num
// link que sai do app (/s/<slug>) e abre em qualquer navegador. Por compatibilidade com links antigos, um id
// de página do histórico (sem projeto) continua servindo a última versão dela. Cabeçalhos, CSP e a página
// 404 amigável moram em lib/publicacao.ts (o Next só aceita GET/POST/... como exports de um route.ts).
import { cabecalhosSite, htmlPublicado, PAGINA_404 } from "@/lib/publicacao";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: RouteContext<"/s/[id]">) {
  const { id } = await params;
  const publicado = htmlPublicado(id);
  if (!publicado) return new Response(PAGINA_404, { status: 404, headers: cabecalhosSite() });
  return new Response(publicado.html, { status: 200, headers: cabecalhosSite() });
}
