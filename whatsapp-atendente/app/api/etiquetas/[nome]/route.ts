import { apagarEtiqueta, etiquetasEmUso } from "@/lib/conversas";

export const dynamic = "force-dynamic";

type Parametros = { params: Promise<{ nome: string }> };

/**
 * Apaga uma etiqueta da conta e de todas as conversas em que ela estava. A tela pergunta antes, com a
 * contagem de conversas afetadas (ela vem do `GET`): apagar aqui não desfaz, e as conversas em si
 * continuam todas onde estão — só a palavra sai delas.
 */
export async function DELETE(_req: Request, { params }: Parametros) {
  const { nome } = await params;
  const quantas = apagarEtiqueta(decodeURIComponent(nome));
  return Response.json({ itens: etiquetasEmUso(), conversas: quantas });
}
