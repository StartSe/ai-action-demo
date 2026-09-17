// O painel de uma simulação (US-022): os agregados e a frase da principal oportunidade do time.
//
// Os números vêm de `montarPainelSimulacao`, que é cálculo puro sobre as conversas já avaliadas. A
// frase é a única parte escrita pela IA, e ela é guardada por uma hora ou até chegar conversa nova —
// por isso as duas saem na mesma resposta: abrir a tela não pode custar uma chamada de IA por vez.
import { montarPainelSimulacao, oportunidadeDoTime } from "@/lib/painel-simulacao";

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const painel = montarPainelSimulacao(codigo);
  if (!painel) {
    return Response.json({ error: "Esse treino não existe mais." }, { status: 404 });
  }
  const oportunidade = await oportunidadeDoTime(painel);
  return Response.json({ painel, oportunidade });
}
