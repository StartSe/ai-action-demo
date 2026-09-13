import { criarCobrancasVespera } from "@/lib/cobranca";
import { obter } from "@/lib/historico";
import type { Ata } from "@/lib/types";

/** Botão "Cobrar na véspera": agenda (por ação ainda pendente, com prazo válido e e-mail encontrado em
 * "E-mails dos participantes") uma rotina única um dia antes do prazo, para o e-mail do responsável,
 * citando a ação, o prazo e o link de confirmação (US-065). */
export async function POST(_req: Request, { params }: RouteContext<"/api/ata/[id]/cobranca">) {
  const { id } = await params;
  const registro = obter<unknown, Ata, unknown>(id);
  if (!registro || registro.tipo !== "ata") {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }

  const resultado = criarCobrancasVespera(id);
  if (!resultado) {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }
  return Response.json(resultado);
}
