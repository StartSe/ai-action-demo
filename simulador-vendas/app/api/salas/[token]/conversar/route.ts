// Uma fala do vendedor na sala de simulação por texto (app/simular/[token]): devolve a próxima fala
// do cliente simulado. Reaproveita lib/simulacao.ts, a mesma lógica usada em modo demonstração e com IA.
import { obter as obterSala, expirou } from "@/lib/salas";
import { obter as obterCenario } from "@/lib/cenarios";
import { responderComoCliente } from "@/lib/simulacao";
import { ErroIA } from "@/lib/ai";
import type { LinhaTranscricao } from "@/lib/types";

export async function POST(req: Request, { params }: RouteContext<"/api/salas/[token]/conversar">) {
  const { token } = await params;
  const sala = obterSala(token);
  if (!sala || expirou(sala)) {
    return Response.json({ error: "Esta sala não está mais disponível." }, { status: 404 });
  }

  const corpo = await req.json().catch(() => null);
  const transcricao = Array.isArray(corpo?.transcricao) ? (corpo.transcricao as LinhaTranscricao[]) : [];
  if (transcricao.length === 0 || transcricao[transcricao.length - 1]?.papel !== "vendedor") {
    return Response.json({ error: "Escreva uma fala antes de continuar." }, { status: 400 });
  }

  const cenario = sala.cenarioId ? obterCenario(sala.cenarioId) : null;
  try {
    const texto = await responderComoCliente(transcricao, cenario);
    return Response.json({ texto });
  } catch (err) {
    // Quem está desta ponta é o vendedor treinando, não o gestor: ele não configura nada e não pode
    // receber "conecte a IA em Configurações". Sempre a mesma frase, com o detalhe só no log.
    console.error("Sala de treino: o cliente simulado não respondeu", err instanceof ErroIA ? err.codigo : err);
    return Response.json({ error: "O cliente simulado não conseguiu responder agora. Tente enviar a fala de novo em alguns instantes." }, { status: 502 });
  }
}
