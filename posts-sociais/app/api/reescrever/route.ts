import { respostaErro } from "@/lib/ai";
import { reescreverPost } from "@/lib/posts";
import type { Rede } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { texto?: string; rede?: Rede; instrucao?: string };
  const { texto, rede, instrucao } = body;
  if (!texto) {
    return Response.json({ error: "Envie o texto do post para reescrever." }, { status: 400 });
  }
  try {
    return Response.json(await reescreverPost({ texto, rede, instrucao }));
  } catch (err) {
    return respostaErro(err);
  }
}
