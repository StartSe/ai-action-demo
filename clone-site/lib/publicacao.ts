// O que /s/<slug> serve: a versão publicada do projeto (por slug ou id) ou, por compatibilidade com links
// antigos, a última versão de uma página do histórico sem projeto. Cabeçalhos e página 404 ficam aqui para
// app/s/[id]/route.ts só exportar GET (o Next não aceita outros exports num route.ts).
import { PaginaNaoEncontrada, versaoAtual } from "./gerador";
import { obterPorSlug, versaoPublicadaDe } from "./projetos";

/** Mantenha em sincronia com sanitizarHtml (lib/gerador.ts): tudo que o gerador deixa passar precisa estar liberado aqui. 'self' em img-src é para os assets do próprio app (/s/<id>/a/<asset>). */
export const CSP_SITE = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src https://cdn.tailwindcss.com 'unsafe-inline'; img-src 'self' data: https:";

export function cabecalhosSite(): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": CSP_SITE,
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export const PAGINA_404 = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Este site não existe mais</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #f6f7f9; color: #111827; }
  main { max-width: 420px; padding: 32px 24px; text-align: center; }
  h1 { font-size: 24px; margin: 0 0 12px; }
  p { margin: 0; color: #6b7280; line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>Este site não existe mais</h1>
  <p>O link pode ter expirado, o site ainda não foi publicado ou o endereço está incorreto. Peça um link novo para quem publicou.</p>
</main>
</body>
</html>
`;

export type Publicado = { html: string; projetoId?: string; titulo: string };

/** O HTML que está no ar para um slug/id, ou null quando não há nada publicado com esse endereço. */
export function htmlPublicado(slugOuId: string): Publicado | null {
  const projeto = obterPorSlug(slugOuId);
  if (projeto) {
    const publicada = versaoPublicadaDe(projeto);
    return publicada ? { html: publicada.versao.html, projetoId: projeto.id, titulo: publicada.titulo } : null;
  }
  try {
    const { titulo, versao } = versaoAtual(slugOuId);
    return { html: versao.html, titulo };
  } catch (err) {
    if (!(err instanceof PaginaNaoEncontrada)) console.error(err);
    return null;
  }
}
