// "Tentar de novo" de uma avaliação que não ficou pronta (US-018).
//
// Roda o avaliador de novo sobre a transcrição já gravada: nada da conversa se perde quando a IA falha,
// então refazer o julgamento é tudo o que falta. Conversa já avaliada não é reavaliada — duas notas
// diferentes para o mesmo treino seriam pior que a falha original.
import { avaliarSessao } from "@/lib/avaliacao";
import { obter as obterSessao } from "@/lib/sessoes";
import { ErroIA } from "@/lib/ai";

export async function POST(_req: Request, { params }: RouteContext<"/api/sessoes/[id]/avaliar">) {
  const { id } = await params;
  const sessao = obterSessao(id);
  if (!sessao) return Response.json({ error: "Esta conversa não está mais aqui." }, { status: 404 });
  if (sessao.resultadoId) return Response.json({ id: sessao.resultadoId, jaAvaliada: true });

  try {
    const avaliada = await avaliarSessao(id);
    if (!avaliada) {
      return Response.json({ error: "Esta conversa não tem nenhuma fala do vendedor, então não há o que avaliar." }, { status: 400 });
    }
    return Response.json({ id: avaliada.id, nota: avaliada.avaliacao.notaGeral });
  } catch (err) {
    if (err instanceof ErroIA) {
      return Response.json({ error: err.message, codigo: err.codigo, acao: err.acao }, { status: err.status });
    }
    console.error("Não foi possível avaliar a conversa pendente", err);
    return Response.json({ error: "Não foi possível avaliar esta conversa agora. Tente de novo em alguns instantes." }, { status: 502 });
  }
}
