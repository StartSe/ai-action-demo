import { conversarRadar } from "@/lib/chat-radar";
import { respostaErro } from "@/lib/ai";
export async function POST(req: Request) {
  try { return Response.json(await conversarRadar(await req.json().catch(() => null))); }
  catch (e) { return respostaErro(e); }
}
