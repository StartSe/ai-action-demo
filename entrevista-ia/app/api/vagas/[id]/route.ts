// Uma vaga: ler, editar, encerrar/reabrir e apagar (US-005/US-007).
import { CONTAGEM_VAZIA, contarPorVaga } from "@/lib/entrevistas";
import { apagar, atualizar, encerrar, obter, reabrir, validarVaga } from "@/lib/vagas";

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

/** Encerrar ou reabrir a vaga. Só o status entra por aqui; o resto do cadastro continua no `PUT`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  if (corpo?.status !== "aberta" && corpo?.status !== "encerrada") {
    return Response.json({ error: "Diga se a vaga fica aberta ou encerrada." }, { status: 400 });
  }
  // Encerrar cancela os convites que ainda esperavam o candidato; quem já está conversando ou já foi
  // avaliado fica como está (lib/vagas.ts).
  if (corpo.status === "encerrada") {
    const { vaga, convitesCancelados } = encerrar(id);
    return Response.json({ vaga, convitesCancelados });
  }
  return Response.json({ vaga: reabrir(id), convitesCancelados: 0 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });
  // Apagar a vaga leva as entrevistas dela junto (lib/vagas.ts); o parecer de cada uma continua no
  // histórico, porque ele é o registro do que foi decidido e não pertence à vaga.
  apagar(id);
  return Response.json({ ok: true });
}
