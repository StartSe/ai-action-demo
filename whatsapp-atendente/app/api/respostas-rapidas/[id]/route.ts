import { normalizarAtalho } from "@/lib/atalhos";
import { apagarRespostaRapida, atualizarRespostaRapida, erroDeRespostaRapida, listarRespostasRapidas } from "@/lib/respostas-rapidas";

export const dynamic = "force-dynamic";

type Parametros = { params: Promise<{ id: string }> };

const SUMIU = "Essa resposta rápida não está mais aqui.";

/** Corrige o atalho e o texto de uma resposta rápida já cadastrada. */
export async function PUT(req: Request, { params }: Parametros) {
  const id = Number((await params).id);
  const corpo = (await req.json().catch(() => ({}))) as { atalho?: string; texto?: string };
  const atalho = normalizarAtalho(String(corpo.atalho || ""));
  const texto = String(corpo.texto || "").trim();

  const erro = erroDeRespostaRapida({ atalho, texto, exceto: id });
  if (erro) return Response.json({ error: erro }, { status: 400 });

  const item = atualizarRespostaRapida(id, { atalho, texto });
  if (!item) return Response.json({ error: SUMIU }, { status: 404 });
  return Response.json({ item, itens: listarRespostasRapidas() });
}

/** Apaga uma resposta rápida (a tela pergunta antes). */
export async function DELETE(_req: Request, { params }: Parametros) {
  const id = Number((await params).id);
  if (!apagarRespostaRapida(id)) return Response.json({ error: SUMIU }, { status: 404 });
  return Response.json({ ok: true, itens: listarRespostasRapidas() });
}
