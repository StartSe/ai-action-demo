import { contextoRadar } from "@/lib/chat-radar";
import { sessaoVoz } from "@/lib/voz";
import { AppError } from "@/lib/voz-erro";
import { aiEnabled, respostaErro } from "@/lib/ai";
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (typeof b?.resultadoId !== "string") throw new AppError("Abra uma análise salva.");
    const c = contextoRadar(b.resultadoId);
    if (!(await aiEnabled())) throw new AppError("Conecte a IA para analisar os sinais durante a conversa por voz.", 409);
    const sessao = await sessaoVoz(req.signal);
    return Response.json({ ...sessao, contexto: JSON.stringify({ radarId: c.radarId, nome: c.nome, palavrasChave: c.palavrasChave, destaques: c.destaques, conversa: c.conversa, analise: { geradoEm: c.analise.geradoEm, sinais: c.analise.sinais.map(s => ({ titulo: s.titulo, resumo: s.resumo })), leituras: c.analise.conexoes } }) }, { headers: { "Cache-Control": "no-store" } });
  } catch(e) { return e instanceof AppError ? Response.json({ error: e.message }, { status: e.status }) : respostaErro(e); }
}
