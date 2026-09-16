import { respostaErro } from "@/lib/ai";
import { gerarQuestionarioParaSetor } from "@/lib/bussola";

/** Gera um questionário adaptado a um setor (e porte), para preencher o editor. Nada é salvo aqui.
 * Erros da IA saem com causa/código/ação (respostaErro); a tela deixa seguir com o questionário modelo. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { setor?: string; porte?: string };
  if (!corpo.setor || !corpo.setor.trim()) return Response.json({ error: "Informe o setor da empresa." }, { status: 400 });
  try {
    const resultado = await gerarQuestionarioParaSetor({ setor: corpo.setor, porte: corpo.porte });
    return Response.json(resultado);
  } catch (err) {
    return respostaErro(err);
  }
}
