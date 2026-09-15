// Cria e lista os lembretes de check-in de 30/60/90 dias de um PDI salvo (botão "Lembrar dos
// check-ins" no Resultado). Não é copiado entre apps: a lógica mora em lib/checkins.ts.
import { criarLembretesCheckin, listarLembretesCheckin } from "@/lib/checkins";
import { obter } from "@/lib/historico";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";
import type { DadosPDI, PDI } from "@/lib/types";

export async function GET(req: Request) {
  const resultadoId = new URL(req.url).searchParams.get("resultadoId") || "";
  return Response.json({ itens: resultadoId ? listarLembretesCheckin(resultadoId) : [] });
}

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  const resultadoId = typeof corpo?.resultadoId === "string" ? corpo.resultadoId : "";
  if (!resultadoId) return Response.json({ error: "Resultado inválido." }, { status: 400 });

  const registro = obter<DadosPDI, PDI, unknown>(resultadoId);
  if (!registro || registro.tipo !== "pdi") return Response.json({ error: "PDI não encontrado." }, { status: 404 });

  if (listarLembretesCheckin(resultadoId).length > 0) {
    return Response.json({ error: "Os check-ins deste PDI já foram agendados." }, { status: 409 });
  }

  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (canal === "email" && !destino) {
    return Response.json({ error: "Configure um e-mail de destino em Notificações para receber os lembretes.", motivo: "notificacoes" }, { status: 400 });
  }

  const itens = criarLembretesCheckin({ resultadoId, nome: registro.entrada.nome, pdi: registro.saida, desde: registro.entrada.dataConversa, canal, destino });
  return Response.json({ itens });
}
