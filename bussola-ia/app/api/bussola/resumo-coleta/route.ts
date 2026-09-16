// Cria a rotina "Resumo da coleta de respostas" (todo dia às 8h) pelo botão do painel. O cartão "Rotinas" de
// /setup também oferece o tipo (sem parâmetros). Idempotente: se já existe uma rotina ativa desse tipo,
// devolve a existente. Sem canal de notificação pronto, 400 com motivo (a tela leva a /setup#notificacoes).
import { canalDeAviso } from "@/lib/notificacoes-do-app";
import { criar, listar } from "@/lib/rotinas";
import { TIPO_RESUMO_COLETA } from "@/lib/rotinas-do-app";
import { registrarEnderecoPublico } from "@/lib/setup-comum";

export async function GET() {
  const existente = listar().find((r) => r.tipo === TIPO_RESUMO_COLETA.tipo && r.ativa);
  return Response.json({ id: existente?.id ?? null });
}

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const { canal, destino, motivo } = canalDeAviso();
  if (motivo) return Response.json({ error: motivo, motivo: "notificacoes" }, { status: 400 });

  const existente = listar().find((r) => r.tipo === TIPO_RESUMO_COLETA.tipo && r.ativa);
  if (existente) return Response.json({ id: existente.id, existente: true });

  const id = criar({ tipo: TIPO_RESUMO_COLETA.tipo, frequencia: "diaria", hora: "08:00", canal, destino, parametros: {} });
  return Response.json({ id });
}
