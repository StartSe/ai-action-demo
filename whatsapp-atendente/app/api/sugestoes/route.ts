import { aprovarSugestao, criarLink, descartarSugestao, linkExistente, sugestoesPendentes } from "@/lib/sugestoes";

export const dynamic = "force-dynamic";

/** Código do link já existente (ou null) e as sugestões da equipe ainda pendentes. */
export async function GET() {
  return Response.json({ codigo: linkExistente(), itens: sugestoesPendentes() });
}

/** Cria o link do formulário uma única vez; se já existir, devolve o código já gerado (idempotente). */
export async function POST() {
  return Response.json({ codigo: criarLink() });
}

/** Aprova (entra na base) ou descarta uma sugestão recebida pelo formulário. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; acao?: string };
  const id = String(body.id || "");
  if (!id || (body.acao !== "aprovar" && body.acao !== "descartar")) {
    return Response.json({ error: "Informe o id e a ação (aprovar ou descartar)." }, { status: 400 });
  }
  const resultado = body.acao === "aprovar" ? aprovarSugestao(id) : descartarSugestao(id);
  if (!resultado.ok) return Response.json({ error: "Sugestão não encontrada." }, { status: 404 });
  return Response.json({ itens: sugestoesPendentes() });
}
