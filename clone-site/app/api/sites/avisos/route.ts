// Avisos do sino do cabeçalho: sites que ficaram prontos ou falharam e ainda não foram abertos
// (formato NotificacaoTopbar de components/ui.tsx: { id, texto, url }).
import { avisos } from "@/lib/projetos";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ itens: avisos() }, { headers: { "Cache-Control": "no-store" } });
}
