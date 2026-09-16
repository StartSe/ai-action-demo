import { responderPergunta } from "@/lib/perguntar";
import { responderErro } from "../erros";
import type { LancamentoResumo, Resumo } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { resumo?: Resumo; amostra?: LancamentoResumo[]; pergunta?: string };
  const { resumo, amostra, pergunta } = body;
  if (!resumo || !pergunta) {
    return Response.json({ error: "Envie o resumo da planilha e a pergunta." }, { status: 400 });
  }
  try {
    const { demo, resposta } = await responderPergunta({ resumo, amostra: amostra || [], pergunta });
    return Response.json({ demo, resposta });
  } catch (err) {
    return responderErro(err, "Não foi possível responder agora. Tente de novo em um minuto.");
  }
}
