// A cultura da empresa (US-003). Privada: fica fora da lista de rotas públicas de proxy.ts, como
// toda rota do painel.
import { obterCultura, salvarCultura, validarCultura } from "@/lib/cultura";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ cultura: obterCultura() });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const validacao = validarCultura(body);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ cultura: salvarCultura(validacao.cultura) });
}
