// Uma vaga: ler, editar e apagar (US-005).
import { CONTAGEM_VAZIA, contarPorVaga } from "@/lib/entrevistas";
import { apagar, atualizar, obter, validarVaga } from "@/lib/vagas";

export const dynamic = "force-dynamic";

const SUMIU = { error: "Essa vaga não existe mais." };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vaga = obter(id);
  if (!vaga) return Response.json(SUMIU, { status: 404 });
  return Response.json({ vaga, candidatos: contarPorVaga()[id] ?? CONTAGEM_VAZIA });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  const validacao = validarVaga(corpo);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ vaga: atualizar(id, validacao.campos) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });
  // Apagar a vaga leva as entrevistas dela junto (lib/vagas.ts); o parecer de cada uma continua no
  // histórico, porque ele é o registro do que foi decidido e não pertence à vaga.
  apagar(id);
  return Response.json({ ok: true });
}
