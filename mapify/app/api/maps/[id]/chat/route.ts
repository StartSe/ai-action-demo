import { api, body, string, AppError } from "@/lib/api";
import { getMap, saveMap } from "@/lib/maps";
import { ask } from "@/lib/ai";
import { grounding, relevantContext } from "@/lib/generation";
import { sourceDescription } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const map = getMap((await ctx.params).id);
    const b = await body(req);
    const question = string(b.question, 2000);
    if (!question) throw new AppError("Escreva uma pergunta sobre o mapa.");
    if (map.demo)
      throw new AppError(
        "Este é um mapa de exemplo. Gere um mapa com sua fonte para conversar com a IA.",
      );
    const text = await ask(
      `${grounding} Responda sobre o conteúdo do mapa em até 400 palavras. Cite referências como [p1], [s1] ou [t1] quando sustentarem sua resposta. Os trechos são uma seleção, não a fonte inteira. Se não houver evidência, explique a limitação.`,
      JSON.stringify({
        mapa: { title: map.title, summary: map.summary, root: map.root },
        historico: map.messages.slice(-8),
        trechos: relevantContext(map.source, question),
        naturezaDaFonte: sourceDescription(map.source),
        pergunta: question,
      }),
      req.signal,
    );
    const current = getMap(map.id);
    return saveMap(
      map.id,
      {
        messages: [
          ...current.messages,
          { role: "user", text: question },
          { role: "assistant", text },
        ],
      },
      current.revision,
    );
  });
}
