import { gerarLeitura } from "@/lib/leitura";
import type { Periodo } from "@/lib/types";
import { responderErro } from "../erros";

export const dynamic = "force-dynamic";

const PERIODOS_VALIDOS: Periodo[] = ["mes", "3meses", "ano"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bruto = url.searchParams.get("periodo");
  const periodo: Periodo = PERIODOS_VALIDOS.includes(bruto as Periodo) ? (bruto as Periodo) : "mes";

  try {
    const { leitura, faturas, meta, id } = await gerarLeitura(periodo);
    return Response.json({ leitura, faturas, meta, id });
  } catch (err) {
    return responderErro(err, "Não foi possível ler o gasto agora. Tente de novo em instantes.");
  }
}
