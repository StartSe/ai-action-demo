// URL pública do webhook e verify token gerado, para a tela mostrar o passo a passo da Meta.
import { verifyTokenWhatsApp } from "@/lib/integracoes";
import { baseUrl } from "@/lib/setup-comum";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json({
    url: `${baseUrl(req)}/webhook`,
    verifyToken: verifyTokenWhatsApp(),
  });
}
