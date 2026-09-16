// Cria a rotina "Radar semanal dos meus temas" a partir do botão "Receber este radar toda semana" (no resultado).
// É o único caminho para criá-la: o cartão genérico "Rotinas" de /setup não oferece o tipo, porque ele exige os
// temas (lib/rotinas-do-app.ts). Não é copiado entre apps.
import { chavePerfil } from "@/lib/perfil";
import { criar, listar, motivoCanalIndisponivel } from "@/lib/rotinas";
import { TIPO_RADAR_SEMANAL } from "@/lib/rotinas-do-app";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";
import type { DadosRadar } from "@/lib/types";

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  const temas = Array.isArray(corpo?.temas) ? corpo.temas.map((t: unknown) => String(t).trim()).filter(Boolean) : [];
  const setor = typeof corpo?.setor === "string" && corpo.setor.trim() ? corpo.setor.trim() : undefined;
  if (temas.length === 0) return Response.json({ error: "A rotina precisa dos temas do radar. Monte um radar e clique em 'Receber este radar toda semana'." }, { status: 400 });

  // Canal e destino vêm do cartão Notificações; sem credencial para o canal, 400 com motivo (a tela leva a /setup#notificacoes).
  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const motivo = motivoCanalIndisponivel(canal);
  if (motivo) return Response.json({ error: motivo, motivo: "notificacoes" }, { status: 400 });
  const destino = canal === "email" ? getConfig("NOTIFICACOES_DESTINO") || undefined : undefined;
  if (canal === "email" && !destino) return Response.json({ error: "Informe o e-mail de destino em Notificações antes de criar a rotina.", motivo: "notificacoes" }, { status: 400 });

  // Já existe uma rotina para este perfil: devolve a existente em vez de duplicar.
  const perfil = chavePerfil(temas, setor);
  const existente = listar<Partial<DadosRadar>>().find((r) => r.tipo === TIPO_RADAR_SEMANAL.tipo && chavePerfil(r.parametros?.temas ?? [], r.parametros?.setor) === perfil);
  if (existente) return Response.json({ id: existente.id, existente: true });

  const id = criar({ tipo: TIPO_RADAR_SEMANAL.tipo, frequencia: "semanal", diaSemana: 1, hora: "08:00", canal, destino, parametros: { temas, setor } });
  return Response.json({ id });
}
