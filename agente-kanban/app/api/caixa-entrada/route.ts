import { criarLink, pedidosRecebidos } from "@/lib/caixa-entrada";
import { getConfig, setConfig } from "@/lib/store";
import { visitanteId } from "@/lib/visitante";

export const dynamic = "force-dynamic";

/** Código do link já existente, ou null quando ninguém criou a caixa de entrada ainda. */
export async function GET() {
  const codigo = getConfig("CAIXA_ENTRADA_CODIGO") || null;
  const itens = codigo
    ? pedidosRecebidos(codigo).map((r) => ({ id: r.id, quemPede: r.dados.quemPede, oQuePrecisa: r.dados.oQuePrecisa, resultadoId: r.resultadoId, criadoEm: r.criadoEm }))
    : [];
  return Response.json({ codigo, itens });
}

/** Cria a caixa de entrada uma única vez; se já existir, devolve o código já gerado (idempotente). */
export async function POST() {
  const existente = getConfig("CAIXA_ENTRADA_CODIGO");
  if (existente) return Response.json({ codigo: existente });
  const idVisitante = await visitanteId();
  const codigo = criarLink(idVisitante);
  setConfig("CAIXA_ENTRADA_CODIGO", codigo);
  return Response.json({ codigo });
}
