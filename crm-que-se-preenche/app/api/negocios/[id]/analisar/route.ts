// Prévia sem efeito colateral: analisa a transcrição e devolve a proposta, mas NUNCA aplica no
// negócio (quem aplica é POST /api/negocios/[id]/atualizar, sempre depois da pessoa revisar).
import { respostaErro } from "@/lib/ai";
import { analisarReuniao } from "@/lib/analise";
import { obterNegocio } from "@/lib/negocios";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const registro = obterNegocio(id);
  if (!registro) return Response.json({ error: "Negócio não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { transcricao?: string };
  const transcricao = (body.transcricao || "").trim();
  if (!transcricao) return Response.json({ error: "Cole, envie ou grave a transcrição da reunião antes de analisar." }, { status: 400 });

  try {
    const { proposta, meta: metaGerada } = await analisarReuniao(transcricao, registro.saida);
    return Response.json({ proposta, meta: metaGerada });
  } catch (err) {
    return respostaErro(err);
  }
}
