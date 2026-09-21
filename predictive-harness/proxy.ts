import { NextResponse, type NextRequest } from "next/server";
import { existeConta, sessaoAtual } from "./lib/conta";
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (origin && new URL(origin).host !== host)
      return NextResponse.json(
        { error: "Origem da solicitação inválida." },
        { status: 403 },
      );
  }
  const publicRoute =
    path === "/api/health" ||
    path === "/entrar" ||
    path === "/icon.svg" ||
    path === "/api/auth" ||
    path.startsWith("/_next/");
  if (publicRoute || process.env.CONTA_DESLIGADA === "1" || sessaoAtual(req)) {
    const response = NextResponse.next();
    if (path.startsWith("/api/"))
      response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "same-origin");
    response.headers.set("X-Frame-Options", "DENY");
    return response;
  }
  if (path.startsWith("/api/"))
    return NextResponse.json(
      { error: "Entre na sua conta para continuar." },
      { status: 401 },
    );
  return NextResponse.redirect(
    new URL(`/entrar${existeConta() ? "" : "?criar=1"}`, req.url),
  );
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
