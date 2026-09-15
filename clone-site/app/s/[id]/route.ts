// Página publicada: serve o HTML da versão atual de uma página salva como text/html puro, num link que sai
// do app (/s/<id>) e abre em qualquer navegador. Cabeçalhos restritivos: a Content-Security-Policy só deixa
// carregar o que o gerador permite (Tailwind pela CDN, fontes do Google, imagens https/data), a página não
// entra em buscadores (X-Robots-Tag: noindex) nem em cache (no-store). O HTML já passou por sanitizarHtml ao
// ser gravado; a CSP é a segunda camada, caso algo escape do filtro. Quando o id não existe, responde 404
// com uma página amigável, com os mesmos cabeçalhos.
import { PaginaNaoEncontrada, versaoAtual } from "@/lib/gerador";

export const dynamic = "force-dynamic";

/** Mantenha em sincronia com sanitizarHtml (lib/gerador.ts): tudo que o gerador deixa passar precisa estar liberado aqui. */
const CSP = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src https://cdn.tailwindcss.com 'unsafe-inline'; img-src data: https:";

function cabecalhos(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP,
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

const PAGINA_404 = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Esta página não existe mais</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #111827; }
  main { max-width: 420px; padding: 32px 24px; text-align: center; }
  h1 { font-size: 24px; margin: 0 0 12px; }
  p { margin: 0; color: #6b7280; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>Esta página não existe mais</h1>
  <p>O link pode ter expirado ou o endereço está incorreto. Peça um link novo para quem publicou a página.</p>
</main>
</body>
</html>
`;

export async function GET(_req: Request, { params }: RouteContext<"/s/[id]">) {
  const { id } = await params;
  try {
    const { versao } = versaoAtual(id);
    return new Response(versao.html, { status: 200, headers: cabecalhos() });
  } catch (err) {
    if (!(err instanceof PaginaNaoEncontrada)) console.error(err);
    return new Response(PAGINA_404, { status: 404, headers: cabecalhos() });
  }
}
