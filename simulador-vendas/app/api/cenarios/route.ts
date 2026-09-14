import { listar } from "@/lib/cenarios";

/** Lista os cenários disponíveis (os 3 modelos semeados na primeira leitura, mais eventuais cenários próprios). */
export async function GET() {
  return Response.json({ itens: listar() });
}
