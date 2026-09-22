import { conversarRadar, carregarConversa } from "@/lib/chat-radar";
import { respostaErro } from "@/lib/ai";
export async function GET(req: Request) {
  try { return Response.json(carregarConversa(new URL(req.url).searchParams.get("resultadoId") || ""), { headers: { "Cache-Control": "no-store" } }); }
  catch(e) { return respostaErro(e); }
}
export async function POST(req: Request) {
  try { return Response.json(await conversarRadar(await req.json().catch(() => null))); }
  catch (e) { return respostaErro(e); }
}
