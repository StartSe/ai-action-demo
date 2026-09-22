import { etiquetasEmUso } from "@/lib/conversas";

export const dynamic = "force-dynamic";

/**
 * As etiquetas desta conta, com quantas conversas usam cada uma. É o que alimenta as sugestões do
 * painel do contato e a linha de chips que filtra a lista de Conversas — a contagem é o que deixa o
 * diálogo dizer de quantas conversas uma etiqueta sairia antes de alguém apagá-la.
 */
export async function GET() {
  return Response.json({ itens: etiquetasEmUso() });
}
