import { INTEGRACOES } from "@/lib/integracoes";
import { lerConfig } from "@/lib/setup-comum";

export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const integracao = INTEGRACOES.find((i) => i.id === id);
  if (!integracao) return Response.json({ ok: false, mensagem: "Integração desconhecida." }, { status: 400 });
  if (!integracao.testar) return Response.json({ ok: true, mensagem: "Esta integração não tem teste automático. Use o app para conferir." });
  try {
    return Response.json(await integracao.testar(lerConfig(integracao)));
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, mensagem: err instanceof Error ? err.message : "Falha ao testar a conexão." });
  }
}
