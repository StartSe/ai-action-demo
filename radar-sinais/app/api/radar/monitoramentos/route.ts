import { aiEnabled } from "@/lib/ai";
import { validarMonitoramento, TIPO_MONITORAMENTO, type Monitoramento } from "@/lib/monitoramento";
import { chavePerfil } from "@/lib/perfil";
import { atualizarMonitoramento, criar, listar, motivoCanalIndisponivel, obter } from "@/lib/rotinas";
import { registrarEnderecoPublico } from "@/lib/setup-comum";
import { getConfig } from "@/lib/store";

export async function GET() {
  return Response.json({ itens: listar<Monitoramento>().filter(r => r.tipo === TIPO_MONITORAMENTO) });
}

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  let parametros: Monitoramento;
  try { parametros = validarMonitoramento(corpo); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (!(await aiEnabled())) return Response.json({ error: "Conecte a IA em Configurações antes de ativar o monitoramento." }, { status: 400 });
  const canal = getConfig("NOTIFICACOES_CANAL") === "slack" ? "slack" : "email";
  const motivo = motivoCanalIndisponivel(canal);
  const destino = canal === "email" ? getConfig("NOTIFICACOES_DESTINO") : undefined;
  if (motivo || (canal === "email" && !destino)) return Response.json({ error: motivo || "Configure o e-mail de destino em Notificações." }, { status: 400 });
  const existente = listar<Monitoramento>().find(r => r.tipo === TIPO_MONITORAMENTO && chavePerfil(r.parametros.temas, r.parametros.setor) === chavePerfil(parametros.temas, parametros.setor));
  const id = corpo?.id;
  if (id !== undefined && (typeof id !== "string" || obter(id)?.tipo !== TIPO_MONITORAMENTO)) return Response.json({ error: "Monitoramento não encontrado." }, { status: 404 });
  if (existente && existente.id !== id) return Response.json({ error: "Estes termos já têm um monitoramento. Use Editar para alterar os horários." }, { status: 409 });
  if (id) { atualizarMonitoramento(id, parametros); return Response.json({ id }); }
  return Response.json({ id: criar({ tipo: TIPO_MONITORAMENTO, frequencia: "diaria", hora: parametros.horarios[0], canal, destino, parametros }) }, { status: 201 });
}
