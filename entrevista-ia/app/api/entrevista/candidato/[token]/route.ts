// Recebe a transcrição concluída pelo candidato na sala pública (app/entrevista/[token]) e gera o
// scorecard. Não reaproveita app/api/f/[token]/route.ts porque a transcrição não cabe no modelo
// genérico de campos texto/textarea (ver lib/formularios.ts) nem no limite de 4000 caracteres por campo.
import { NextResponse } from "next/server";
import { gerarScorecard, normalizarHistorico, type ParametrosCandidato } from "@/lib/entrevista";
import { expirou, listarRespostas, obter, responder } from "@/lib/formularios";

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]">) {
  const { token } = await params;
  const formulario = obter<ParametrosCandidato>(token);
  if (!formulario || formulario.tipo !== "scorecard") {
    return NextResponse.json({ error: "Link inválido." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (expirou(formulario)) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }
  if (formulario.limite !== null && listarRespostas(token).length >= formulario.limite) {
    return NextResponse.json({ error: "Este link já foi usado." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  }

  const body = await request.json().catch(() => null);
  const historico = normalizarHistorico((body as { historico?: unknown } | null)?.historico);
  if (!historico.length) {
    return NextResponse.json({ error: "É preciso ao menos uma resposta para concluir a entrevista." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { id } = await gerarScorecard(formulario.parametros.vaga, historico, { tipo: "scorecard", expiraEmDias: 90 });
    responder(token, {}, id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Não foi possível concluir a entrevista agora. Tente novamente." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
