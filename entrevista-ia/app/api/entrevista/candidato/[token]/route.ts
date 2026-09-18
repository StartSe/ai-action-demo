// Recebe a transcrição concluída pelo candidato na sala pública (app/entrevista/[token]) e gera o
// scorecard. Não reaproveita app/api/f/[token]/route.ts porque a transcrição não cabe no modelo
// genérico de campos texto/textarea (ver lib/formularios.ts) nem no limite de 4000 caracteres por campo.
//
// Aceita os dois tipos de link (o convite de hoje e os `scorecard` antigos) pela mesma porta:
// `resolverConvite()`, em lib/convite.ts. Quando o link é um convite, o parecer gerado fica ligado à
// entrevista — é assim que a vaga e o candidato passam de "Link aberto" para "Avaliada".
import { NextResponse } from "next/server";
import { FECHADO, resolverConvite } from "@/lib/convite";
import { gerarScorecard, normalizarHistorico } from "@/lib/entrevista";
import { registrarResultado } from "@/lib/entrevistas";
import { responder } from "@/lib/formularios";

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]">) {
  const { token } = await params;
  const resolucao = resolverConvite(token);
  if (!resolucao.ok) {
    const { titulo, status } = FECHADO[resolucao.motivo];
    return NextResponse.json({ error: `${titulo}.` }, { status, headers: { "Cache-Control": "no-store" } });
  }

  const body = await request.json().catch(() => null);
  const historico = normalizarHistorico((body as { historico?: unknown } | null)?.historico);
  if (!historico.length) {
    return NextResponse.json({ error: "É preciso ao menos uma resposta para concluir a entrevista." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { id } = await gerarScorecard(resolucao.sala.vaga, historico, { tipo: "scorecard", expiraEmDias: 90 });
    responder(token, {}, id);
    if (resolucao.sala.entrevistaId) registrarResultado(resolucao.sala.entrevistaId, id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Não foi possível concluir a entrevista agora. Tente novamente." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
