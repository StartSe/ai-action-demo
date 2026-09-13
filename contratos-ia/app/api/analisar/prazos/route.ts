// Cria e lista os avisos de "30 dias antes" de um contrato salvo (botão "Avisar 30 dias antes" no
// Resultado). Não é copiado entre apps: a lógica mora em lib/avisos-prazo.ts.
import { criarAvisosPrazo, listarAvisosPrazo } from "@/lib/avisos-prazo";
import { obter } from "@/lib/historico";
import { getConfig } from "@/lib/store";
import type { Analise, EntradaAnalise } from "@/lib/types";

export async function GET(req: Request) {
  const resultadoId = new URL(req.url).searchParams.get("resultadoId") || "";
  return Response.json({ itens: resultadoId ? listarAvisosPrazo(resultadoId) : [] });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => null);
  const resultadoId = typeof corpo?.resultadoId === "string" ? corpo.resultadoId : "";
  if (!resultadoId) return Response.json({ error: "Resultado inválido." }, { status: 400 });

  const registro = obter<EntradaAnalise, Analise, unknown>(resultadoId);
  if (!registro || registro.tipo !== "contrato") return Response.json({ error: "Contrato não encontrado." }, { status: 404 });

  if (!registro.saida.prazos || registro.saida.prazos.length === 0) {
    return Response.json({ error: "Este contrato não tem prazos identificados." }, { status: 400 });
  }

  if (listarAvisosPrazo(resultadoId).length > 0) {
    return Response.json({ error: "Os avisos deste contrato já foram agendados." }, { status: 409 });
  }

  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const destino = getConfig("NOTIFICACOES_DESTINO") || undefined;
  if (canal === "email" && !destino) {
    return Response.json({ error: "Configure um e-mail de destino em Notificações para receber os avisos.", motivo: "notificacoes" }, { status: 400 });
  }

  const itens = criarAvisosPrazo({ resultadoId, tipoContrato: registro.saida.tipo_contrato || "Contrato", prazos: registro.saida.prazos, canal, destino });
  return Response.json({ itens });
}
