// Próxima fala da entrevistadora na sala pública do candidato. É uma rota própria (e não a do gestor,
// app/api/entrevista/proxima) porque quem abre o link não tem conta de administrador: a autenticação é
// o próprio código do link. A vaga vem do link, nunca do corpo enviado pelo navegador.
//
// A mensagem de erro daqui fala com o CANDIDATO, não com quem administra o app: nenhuma frase manda
// conectar nada em Configurações (ver a regra registrada na US-032 da suíte).
import { NextResponse } from "next/server";
import { normalizarHistorico, proximaPergunta, type ParametrosCandidato } from "@/lib/entrevista";
import { expirou, listarRespostas, obter } from "@/lib/formularios";

const SEM_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/proxima">) {
  const { token } = await params;
  const formulario = obter<ParametrosCandidato>(token);
  if (!formulario || formulario.tipo !== "scorecard") {
    return NextResponse.json({ error: "Link inválido." }, { status: 404, headers: SEM_CACHE });
  }
  if (expirou(formulario)) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410, headers: SEM_CACHE });
  }
  if (formulario.limite !== null && listarRespostas(token).length >= formulario.limite) {
    return NextResponse.json({ error: "Este link já foi usado." }, { status: 410, headers: SEM_CACHE });
  }

  const body = await request.json().catch(() => null);
  const historico = normalizarHistorico((body as { historico?: unknown } | null)?.historico);
  try {
    return NextResponse.json(await proximaPergunta(formulario.parametros.vaga, historico), { headers: SEM_CACHE });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "A entrevistadora não conseguiu responder agora. Espere alguns segundos e tente de novo." },
      { status: 502, headers: SEM_CACHE }
    );
  }
}
