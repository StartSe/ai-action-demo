// Clique "Ler as notas do e-mail" (US-021/US-034): POST {dias: 30|90|365, provedor?: "gmail"|"outlook"}.
// Sem `provedor`, lê todas as caixas conectadas. A lógica mora em lib/importacao.ts, compartilhada com a
// rotina de fechamento mensal e com a ferramenta MCP importar_notas.
import { ErroEmail } from "@/lib/email";
import { ErroImportacao, importarNotas } from "@/lib/importacao";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { dias?: unknown; provedor?: unknown };
  try {
    return Response.json(await importarNotas(body.dias, body.provedor));
  } catch (err) {
    if (err instanceof ErroImportacao) return Response.json({ error: err.message }, { status: 400 });
    console.error("Falha na importação do e-mail", err);
    if (err instanceof ErroEmail) return Response.json({ error: err.message }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : "Falha inesperada ao ler o e-mail." }, { status: 500 });
  }
}
