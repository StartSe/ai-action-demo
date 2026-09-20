import { respostaErro } from "@/lib/ai";
import { gerarQuestionarioParaSetor } from "@/lib/bussola";
import { lerContexto } from "@/lib/assessment-input";
export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo.setor !== "string" || !corpo.setor.trim()) return Response.json({ error: "Informe o setor da empresa." }, { status: 400 });
  let contexto;
  try { contexto = lerContexto(corpo); } catch (err) { return Response.json({ error: (err as Error).message }, { status: 400 }); }
  try { return Response.json(await gerarQuestionarioParaSetor({ setor: corpo.setor, porte: contexto.porte, objetivo: contexto.objetivo, grupoNome: contexto.grupoNome })); }
  catch (err) { return respostaErro(err); }
}
