import { criarLinkPlanilhaMensal } from "@/lib/csv-mensal";
import { getConfig, setConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Código do link já existente, ou null quando ninguém criou o link ainda. */
export async function GET() {
  return Response.json({ codigo: getConfig("PLANILHA_MENSAL_CODIGO") || null });
}

/** Cria o link uma única vez; se já existir, devolve o código já gerado (idempotente). */
export async function POST() {
  const existente = getConfig("PLANILHA_MENSAL_CODIGO");
  if (existente) return Response.json({ codigo: existente });
  const codigo = criarLinkPlanilhaMensal();
  setConfig("PLANILHA_MENSAL_CODIGO", codigo);
  return Response.json({ codigo });
}
