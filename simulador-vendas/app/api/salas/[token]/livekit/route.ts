import { conectarLivekit, livekitDisponivel } from "@/lib/livekit";
import { conversaAberta, restanteSeg } from "@/lib/sala-do-vendedor";
import { prepararRoteiro } from "@/lib/roteiro";
import { banco } from "@/lib/banco";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contexto = conversaAberta(req, token);
  if (contexto instanceof Response) return contexto;
  const { sessao, simulacao } = contexto;
  if (!simulacao.permiteVoz || !livekitDisponivel()) return Response.json({ error: "O serviço de voz está indisponível. Use a voz do navegador para continuar." }, { status: 409 });
  if (restanteSeg(sessao, simulacao.duracaoMin) === 0) return Response.json({ error: "O tempo desta conversa terminou." }, { status: 409 });
  prepararRoteiro(sessao, simulacao);
  try {
    const conexao = await conectarLivekit(sessao);
    banco().prepare("UPDATE sessoes_treino SET modo = 'voz-agente' WHERE id = ? AND status = 'em_andamento'").run(sessao.id);
    return Response.json(conexao, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Não foi possível conectar a voz. Tente novamente." }, { status: 502 });
  }
}
