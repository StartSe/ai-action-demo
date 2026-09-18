// Um turno da conversa do candidato (US-018): ele diz uma coisa, a entrevistadora responde a
// próxima. Substitui a rota `proxima` desta mesma pasta, que recebia a conversa inteira do navegador.
//
// É uma rota própria (e não a do gestor, app/api/entrevista/proxima) porque quem abre o link não tem
// conta de administrador: a autenticação é o próprio código do link. A vaga vem do link, nunca do
// corpo enviado pelo navegador.
//
// **A conversa mora no servidor.** O navegador manda só a última resposta e recebe de volta a
// transcrição inteira, lida de `mensagens_entrevista`: recarregar a página no meio da entrevista não
// perde nada. O `historico` continua sendo aceito no corpo para os links antigos (tipo `scorecard`,
// ver lib/convite.ts), que não têm entrevista no banco e carregam a conversa consigo.
//
// A mensagem de erro daqui fala com o CANDIDATO, não com quem administra o app: nenhuma frase manda
// conectar nada em Configurações (ver a regra registrada na US-032 da suíte).
import { NextResponse } from "next/server";
import { FECHADO, resolverConvite } from "@/lib/convite";
import { normalizarHistorico } from "@/lib/entrevista";
import { proximaFala, proximaFalaDeLinkAntigo } from "@/lib/roteiro";
import type { NivelVoz } from "@/lib/entrevistas";

const SEM_CACHE = { "Cache-Control": "no-store" };

type Corpo = { resposta?: unknown; ordem?: unknown; nivel?: unknown; historico?: unknown };

/** Como esta pessoa está conversando, para a tela de quem acompanha o processo poder dizer. O nível 1
 * (o agente da ElevenLabs) não passa por aqui: ele conversa por fora e devolve a transcrição depois. */
function nivelDoCorpo(bruto: unknown): NivelVoz | undefined {
  return bruto === "navegador" || bruto === "texto" ? bruto : undefined;
}

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/falar">) {
  const { token } = await params;
  const resolucao = resolverConvite(token);
  if (!resolucao.ok) {
    const { titulo, status } = FECHADO[resolucao.motivo];
    return NextResponse.json({ error: `${titulo}.` }, { status, headers: SEM_CACHE });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as Corpo;
  const resposta = typeof body.resposta === "string" ? body.resposta : "";
  const ordem = typeof body.ordem === "number" && Number.isFinite(body.ordem) ? body.ordem : undefined;
  const { entrevistaId, vaga } = resolucao.sala;
  try {
    const fala = entrevistaId
      ? await proximaFala(entrevistaId, resposta, ordem, { nivelVoz: nivelDoCorpo(body.nivel) })
      : await proximaFalaDeLinkAntigo(vaga, normalizarHistorico(body.historico));
    return NextResponse.json(fala, { headers: SEM_CACHE });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "A entrevistadora não conseguiu responder agora. Espere alguns segundos e tente de novo." },
      { status: 502, headers: SEM_CACHE }
    );
  }
}
