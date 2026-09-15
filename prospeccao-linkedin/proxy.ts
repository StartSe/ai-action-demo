// Garante Cache-Control: no-store nas telas e rotas de formulário público (dados sensíveis por link,
// nunca devem ficar em cache do navegador/CDN). Copie este arquivo sem alterar ao replicar formulários.
import { NextResponse } from "next/server";

export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/f/:path*", "/api/f/:path*"] };
