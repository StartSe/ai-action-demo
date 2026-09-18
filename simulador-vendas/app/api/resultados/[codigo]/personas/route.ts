// A leitura por tipo de cliente de um treino (US-024): a frase de "Onde o time mais trava".
//
// A lista de personas já vem no painel (`GET /api/resultados/<código>`), porque é cálculo puro e sai
// de graça. Só a **frase** mora aqui, numa rota própria buscada quando a aba Personas abre: pendurá-la
// na resposta do painel gastaria uma chamada de IA por abertura de tela — inclusive para o gestor que
// nunca sai da visão geral, que já tem a frase dela.
import { dificuldadeComPersona, montarPainelSimulacao } from "@/lib/painel-simulacao";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const painel = montarPainelSimulacao(codigo);
  if (!painel) {
    return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  }
  const dificuldade = await dificuldadeComPersona(painel);
  return Response.json({ dificuldade });
}
