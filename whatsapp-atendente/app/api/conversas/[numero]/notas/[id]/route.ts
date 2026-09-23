import { CONVERSA_SUMIU, responderConversa } from "../../comum";
import { apagarNota, obterRegistro } from "@/lib/conversas";

export const dynamic = "force-dynamic";

type Parametros = { params: Promise<{ numero: string; id: string }> };

/** Apaga uma nota interna (a tela pergunta antes). Só nota: nenhuma mensagem da conversa sai por aqui. */
export async function DELETE(_req: Request, { params }: Parametros) {
  const { numero, id } = await params;
  if (!obterRegistro(numero)) return Response.json({ error: CONVERSA_SUMIU }, { status: 404 });
  if (!apagarNota(numero, Number(id))) return Response.json({ error: "Essa nota não está mais aqui." }, { status: 404 });
  return responderConversa(numero);
}
