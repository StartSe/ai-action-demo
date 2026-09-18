// Próxima fala da entrevistadora na sala pública do candidato. É uma rota própria (e não a do gestor,
// app/api/entrevista/proxima) porque quem abre o link não tem conta de administrador: a autenticação é
// o próprio código do link. A vaga vem do link, nunca do corpo enviado pelo navegador.
//
// **A conversa mora no servidor (US-016).** O navegador manda só a última resposta e recebe de volta
// a transcrição inteira, lida de `mensagens_entrevista`: recarregar a página no meio da entrevista
// não perde nada. O `historico` continua sendo aceito no corpo para os links antigos (tipo
// `scorecard`, ver lib/convite.ts), que não têm entrevista no banco e carregam a conversa consigo.
//
// A mensagem de erro daqui fala com o CANDIDATO, não com quem administra o app: nenhuma frase manda
// conectar nada em Configurações (ver a regra registrada na US-032 da suíte).
import { NextResponse } from "next/server";
import { FECHADO, resolverConvite } from "@/lib/convite";
import { normalizarHistorico } from "@/lib/entrevista";
import { proximaFala, proximaFalaDeLinkAntigo } from "@/lib/roteiro";
import type { Troca } from "@/lib/types";

const SEM_CACHE = { "Cache-Control": "no-store" };

/**
 * A última coisa que o candidato disse, e de que número ela é.
 *
 * A sala manda a conversa inteira; ao servidor só interessa o que ele ainda não gravou. A ORDEM vai
 * junto porque é ela que distingue "a minha terceira resposta" de "a terceira resposta de novo,
 * porque a sua resposta não chegou" — ver `proximaFala()` em lib/roteiro.ts.
 */
function ultimaResposta(historico: Troca[]): { texto: string; ordem: number } {
  const respostas = historico.filter((h) => h.papel === "candidato");
  return { texto: respostas[respostas.length - 1]?.texto ?? "", ordem: respostas.length };
}

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/proxima">) {
  const { token } = await params;
  const resolucao = resolverConvite(token);
  if (!resolucao.ok) {
    const { titulo, status } = FECHADO[resolucao.motivo];
    return NextResponse.json({ error: `${titulo}.` }, { status, headers: SEM_CACHE });
  }

  const body = await request.json().catch(() => null);
  const historico = normalizarHistorico((body as { historico?: unknown } | null)?.historico);
  const { entrevistaId, vaga } = resolucao.sala;
  try {
    const { texto, ordem } = ultimaResposta(historico);
    const fala = entrevistaId ? await proximaFala(entrevistaId, texto, ordem) : await proximaFalaDeLinkAntigo(vaga, historico);
    return NextResponse.json(fala, { headers: SEM_CACHE });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "A entrevistadora não conseguiu responder agora. Espere alguns segundos e tente de novo." },
      { status: 502, headers: SEM_CACHE }
    );
  }
}
