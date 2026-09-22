import { sessaoAtual } from "@/lib/conta";
import { baseUrl } from "@/lib/setup-comum";
import { removerConjuntoDeExemplo } from "@/lib/exemplos";
import { getConfig, setConfig } from "@/lib/store";
export async function DELETE(req: Request) {
  if (process.env.CONTA_DESLIGADA !== "1" && !sessaoAtual(req)) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  if (req.headers.get("origin") !== new URL(baseUrl(req)).origin) return Response.json({ error: "Abra Configurações para remover os exemplos." }, { status: 403 });
  removerConjuntoDeExemplo();
  setConfig("DEMO_REMOVIDA", "1");
  return Response.json({ ok: true });
}

export async function GET(req: Request) {
  if (process.env.CONTA_DESLIGADA !== "1" && !sessaoAtual(req)) return Response.json({ error: "Entre na sua conta." }, { status: 401 });
  return Response.json({ removidos: getConfig("DEMO_REMOVIDA") === "1" }, { headers: { "Cache-Control": "no-store" } });
}
