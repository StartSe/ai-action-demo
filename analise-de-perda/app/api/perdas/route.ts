import { apagarTodos, listar } from "@/lib/historico";
import { analisarCSV } from "@/lib/perdas";
import { responderErro } from "../erros";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { csv?: string; nomeArquivo?: string; colunaNota?: string; guardar?: boolean };
  const csv = String(body.csv || "");
  if (!csv.trim()) {
    return Response.json({ error: "Envie o CSV com as notas de perda." }, { status: 400 });
  }
  try {
    const resultado = await analisarCSV(csv, { nomeArquivo: body.nomeArquivo, colunaNota: body.colunaNota, guardar: Boolean(body.guardar) });
    return Response.json(resultado);
  } catch (err) {
    return responderErro(err, "Não foi possível analisar o CSV agora. Tente de novo em um minuto.");
  }
}

/** Últimas análises salvas, para a lista "Últimos resultados" no painel. */
export async function GET() {
  return Response.json({ itens: listar(10) });
}

/** Apaga todo o histórico salvo (botão "Apagar tudo"). */
export async function DELETE() {
  apagarTodos();
  return Response.json({ ok: true });
}
