import { NextResponse, type NextRequest } from "next/server";
import { existeConta, sessaoAtual } from "@/lib/conta";
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const origin = req.headers.get("origin");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    origin &&
    new URL(origin).host !== req.headers.get("host")
  )
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const publicRoute =
    ["/api/health", "/conta", "/entrar", "/icon.svg"].includes(p) ||
    p.startsWith("/_next/") ||
    p === "/api/conta" ||
    p.startsWith("/api/conta/");
  if (publicRoute || process.env.CONTA_DESLIGADA === "1" || sessaoAtual(req)) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "same-origin");
    res.headers.set("X-Frame-Options", "DENY");
    return res;
  }
  if (p.startsWith("/api/"))
    return NextResponse.json(
      { error: "Entre na sua conta para continuar." },
      { status: 401 },
    );
  return NextResponse.redirect(
    new URL(existeConta() ? "/entrar" : "/conta", req.url),
  );
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
