// Situação das fontes de busca antes de montar um radar (linha "Fontes desta rodada" sob o formulário).
// Sonda as fontes sem chave uma vez a cada 15 minutos por processo; ver lib/busca.ts.
import { estadoDasFontes } from "@/lib/busca";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ fontes: await estadoDasFontes() });
}
