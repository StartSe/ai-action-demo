// Sondada a cada poucos segundos pela sala de simulação por voz (app/simular/[token]), enquanto espera
// o aviso automático de pós-conversa da ElevenLabs terminar de analisar a ligação e registrar o
// resultado (lib/salas.ts:registrarResultado). "desde" é o último resultado que a página já conhecia
// (vazio na primeira sondagem), para não confundir uma análise antiga desta mesma sala com a atual.
import { obter } from "@/lib/salas";

export async function GET(req: Request, { params }: RouteContext<"/api/salas/[token]/ultima">) {
  const { token } = await params;
  const sala = obter(token);
  if (!sala) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }
  const desde = new URL(req.url).searchParams.get("desde") || null;
  const pronto = Boolean(sala.ultimoResultadoId) && sala.ultimoResultadoId !== desde;
  return Response.json({ pronto, id: pronto ? sala.ultimoResultadoId : null });
}
