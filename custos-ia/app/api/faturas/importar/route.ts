// Clique "Ler as notas do e-mail" (US-021/US-034): POST {dias: 30|90|365, provedor?: "gmail"|"outlook"}.
// Sem `provedor`, lê todas as caixas conectadas. A lógica mora em lib/importacao.ts, compartilhada com a
// rotina de fechamento mensal e com a ferramenta MCP importar_notas.
import { importarNotas } from "@/lib/importacao";
import { responderErro } from "../../erros";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dias?: unknown; provedor?: unknown };
  try {
    return Response.json(await importarNotas(body.dias, body.provedor));
  } catch (err) {
    return responderErro(err, "Não conseguimos ler a caixa agora. Tente de novo; se persistir, reconecte em Configurações.");
  }
}
