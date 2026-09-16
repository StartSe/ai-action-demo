// Próxima fala da entrevistadora na sala do gestor. A conversa pelo link público do candidato usa
// app/api/entrevista/candidato/[token]/proxima (mesma lógica, vaga lida do próprio link).
import { responderErro } from "@/app/api/erros";
import { normalizarHistorico, proximaPergunta } from "@/lib/entrevista";
import type { Vaga } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { vaga, historico } = (body || {}) as { vaga?: Vaga; historico?: unknown };
  if (!vaga || !vaga.titulo || !vaga.requisitos) {
    return Response.json({ error: "Informe ao menos o título da vaga e os principais requisitos." }, { status: 400 });
  }
  try {
    return Response.json(await proximaPergunta(vaga, normalizarHistorico(historico)));
  } catch (err) {
    return responderErro(err, "Não foi possível escrever a próxima pergunta agora. Tente de novo em alguns segundos.");
  }
}
