// Aplica só os campos que a pessoa confirmou na tela — nunca a proposta inteira sem revisão.
import { aplicarAtualizacao, etapaValida, obterNegocio } from "@/lib/negocios";
import type { Etapa, Negocio } from "@/lib/types";

interface CamposConfirmados {
  etapa?: string;
  valor?: number;
  concorrente?: string;
  proximoPasso?: string;
  resumoEvento?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const registro = obterNegocio(id);
  if (!registro) return Response.json({ error: "Negócio não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as CamposConfirmados;
  const campos: Partial<Pick<Negocio, "etapa" | "valor" | "concorrente" | "proximoPasso">> = {};

  if (body.etapa !== undefined) {
    if (!etapaValida(body.etapa)) return Response.json({ error: "Etapa inválida." }, { status: 400 });
    campos.etapa = body.etapa as Etapa;
  }
  if (body.valor !== undefined) {
    if (typeof body.valor !== "number" || !Number.isFinite(body.valor)) return Response.json({ error: "Valor inválido." }, { status: 400 });
    campos.valor = body.valor;
  }
  if (body.concorrente !== undefined) campos.concorrente = String(body.concorrente).trim();
  if (body.proximoPasso !== undefined) campos.proximoPasso = String(body.proximoPasso).trim();

  const resumoEvento = (body.resumoEvento || "").trim() || "Atualizado a partir de uma reunião.";
  const ok = aplicarAtualizacao(id, registro.saida, campos, resumoEvento);
  if (!ok) return Response.json({ error: "Não foi possível salvar a atualização." }, { status: 500 });

  const atualizado = obterNegocio(id);
  return Response.json({ negocio: atualizado?.saida });
}
