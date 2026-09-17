import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Rotas acessíveis sem sessão (/setup = tela de primeiro acesso, que cria a
// conta única do Pocket; /app = página pública do Web App publicado;
// /api/v1 e /api/mcp = endpoints de deployment autenticados por chave de API;
// /robots.txt e /sitemap.xml = metadata routes de SEO, que os crawlers leem
// sem sessão). Sem Google/2FA/cadastro no Pocket (PRD US-008) e sem
// convites/waitlist/aceite de política (PRD US-009): só e-mail e senha na
// tela de login, direto para /projects. A decisão "já há conta?" (que manda
// /login → /setup antes da primeira conta e /setup → /login depois) fica nos
// server components de app/login e app/setup, nunca aqui: o proxy roda no
// runtime edge e não abre o SQLite.
const PUBLIC_PATHS = [
  "/setup",
  "/login",
  "/app",
  "/api/v1",
  "/api/mcp",
  "/robots.txt",
  "/sitemap.xml",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (isPublic) {
    return NextResponse.next();
  }

  // Checagem otimista pelo cookie de sessão; a validação real acontece
  // no servidor a cada leitura de dados
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.search = request.nextUrl.search;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Protege tudo exceto as rotas do Better Auth, assets do Next e arquivos estáticos
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
