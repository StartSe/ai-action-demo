// Cria e lista os lembretes de check-in de 30/60/90 dias de um PDI salvo (botão "Lembrar dos
// check-ins" no Resultado). Não é copiado entre apps: a lógica mora em lib/checkins.ts.
import { criarLembretesCheckin, listarLembretesCheckin } from "@/lib/checkins";
import { obter } from "@/lib/historico";
import { canalDoLider } from "@/lib/notificacoes-do-app";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import type { DadosPDI, PDI } from "@/lib/types";

/** Lembretes já agendados e se as notificações já entregam (o botão explica antes do clique o que vai acontecer). */
export async function GET(req: Request) {
  const resultadoId = new URL(req.url).searchParams.get("resultadoId") || "";
  const { canal, motivo } = canalDoLider();
  return Response.json({ itens: resultadoId ? listarLembretesCheckin(resultadoId) : [], notificacoes: { prontas: !motivo, canal } });
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

  // Canal Slack sem webhook, ou e-mail sem destino/credencial: 400 com motivo "notificacoes" (a tela leva a /setup#notificacoes).
  const { canal, destino, motivo } = canalDoLider();
  if (motivo) return Response.json({ error: motivo, motivo: "notificacoes" }, { status: 400 });

  const itens = criarLembretesCheckin({ resultadoId, nome: registro.entrada.nome, pdi: registro.saida, desde: registro.entrada.dataConversa, canal, destino, base: baseUrl(req) });
  return Response.json({ itens });
}
