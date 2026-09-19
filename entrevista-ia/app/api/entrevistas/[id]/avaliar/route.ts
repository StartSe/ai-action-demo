// "Preparar o parecer de novo" (US-021): a saída do gestor quando a análise não saiu.
//
// O parecer é preparado sozinho quando a conversa acaba (lib/conclusao.ts), mas ele depende do
// modelo — e uma chamada que falha deixa a entrevista `concluida` com `parecerStatus = "falhou"`. Sem
// esta rota, a única saída seria pedir ao candidato para conversar de novo por causa de uma falha que
// não é dele.
//
// Responde na hora e prepara em segundo plano, como a conclusão: quem clicou fica olhando a lista,
// que se relê sozinha enquanto houver alguém esperando parecer.
import { MINIMO_DE_RESPOSTAS } from "@/lib/avaliacao";
import { prepararParecer } from "@/lib/conclusao";
import { contarRespostasDoCandidato, obter } from "@/lib/entrevistas";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entrevista = obter(id);
  if (!entrevista) return Response.json({ error: "Essa entrevista não existe mais." }, { status: 404 });

  if (entrevista.status !== "concluida" && entrevista.status !== "avaliada") {
    return Response.json(
      { error: "Esta conversa ainda não terminou. O parecer é preparado sozinho assim que ela acabar." },
      { status: 409 },
    );
  }
  if (entrevista.parecerStatus === "em_andamento") {
    return Response.json({ entrevista, emAndamento: true });
  }
  if (contarRespostasDoCandidato(id) < MINIMO_DE_RESPOSTAS) {
    return Response.json(
      { error: "Esta entrevista foi encerrada cedo demais para avaliar: não há respostas suficientes." },
      { status: 409 },
    );
  }

  prepararParecer(id);
  return Response.json({ entrevista: obter(id), emAndamento: true });
}
