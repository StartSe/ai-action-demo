import { criarCobrancasVespera } from "@/lib/cobranca";
import { obter } from "@/lib/historico";
import { motivoCanalIndisponivel } from "@/lib/rotinas";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";
import type { Ata } from "@/lib/types";

/** Botão "Cobrar na véspera": agenda (por ação ainda pendente e com prazo válido) uma rotina única um
 * dia antes do prazo, pelo canal escolhido em Notificações — por e-mail para o responsável (endereço em
 * "E-mails dos participantes") ou para o canal do Slack — citando a ação, o prazo e o link de
 * confirmação (US-065). Sem canal configurado, recusa com 400 e aponta para /setup#notificacoes em vez
 * de fingir que agendou. */
export async function POST(req: Request, { params }: RouteContext<"/api/ata/[id]/cobranca">) {
  const { id } = await params;
  const registro = obter<unknown, Ata, unknown>(id);
  if (!registro || registro.tipo !== "ata") {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }

  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const motivoCanal = motivoCanalIndisponivel(canal);
  if (motivoCanal) {
    return Response.json({ error: motivoCanal, motivo: "notificacoes", acao: { rotulo: "Configurar notificações", url: "/setup#notificacoes" } }, { status: 400 });
  }

  registrarEnderecoPublico(req);
  const resultado = criarCobrancasVespera(id, { canal, base: baseUrl(req) });
  if (!resultado) {
    return Response.json({ error: "Ata não encontrada." }, { status: 404 });
  }
  return Response.json(resultado);
}
