import { gerarQuestionarioParaSetor } from "@/lib/bussola";

/** Gera um questionário adaptado a um setor (e porte), para preencher o editor. Nada é salvo aqui. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => ({}))) as { setor?: string; porte?: string };
  if (!corpo.setor || !corpo.setor.trim()) return Response.json({ error: "Informe o setor da empresa." }, { status: 400 });
  try {
    const resultado = await gerarQuestionarioParaSetor({ setor: corpo.setor, porte: corpo.porte });
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Não foi possível gerar o questionário agora. Tente novamente." }, { status: 500 });
  }
}
