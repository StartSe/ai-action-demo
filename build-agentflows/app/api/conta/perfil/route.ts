import { sessaoAtual } from "@/lib/conta";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const usuario = sessaoAtual(req);
  return Response.json(usuario ? { usuario: { nome: usuario.nome } } : { error: "Entre na sua conta." }, {
    status: usuario ? 200 : 401, headers: { "Cache-Control": "private, no-store" },
  });
}
