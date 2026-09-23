import { sincronizarAgendas } from "@/lib/agendas-radar";
import { aiEnabled } from "@/lib/ai";
import { validarMonitoramento, TIPO_MONITORAMENTO, type Monitoramento } from "@/lib/monitoramento";
import { obterRadar, atualizarPesquisa } from "@/lib/radares";
import { atualizarMonitoramento, criar, listar, obter, historicoExecucoes } from "@/lib/rotinas";
import { registrarEnderecoPublico } from "@/lib/setup-comum";

export async function GET(req: Request) {
  try {
    await sincronizarAgendas();
    const radarId = obterRadar(new URL(req.url).searchParams.get("radarId") || undefined).id;
    return Response.json({ execucoes: historicoExecucoes(radarId), itens: listar<Monitoramento>().filter(r => r.tipo === TIPO_MONITORAMENTO && r.parametros.radarId === radarId) });
  } catch { return Response.json({ error: "Radar não encontrado." }, { status: 404 }); }
}

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = await req.json().catch(() => null);
  let parametros: Monitoramento;
  try { parametros = validarMonitoramento(corpo); parametros.radarId = obterRadar(parametros.radarId).id; }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  if (!(await aiEnabled())) return Response.json({ error: "Conecte a IA em Configurações antes de ativar o monitoramento." }, { status: 400 });
  const existente = listar<Monitoramento>().find(r => r.tipo === TIPO_MONITORAMENTO && r.parametros.radarId === parametros.radarId);
  const id = corpo?.id;
  if (id !== undefined && (typeof id !== "string" || obter<Monitoramento>(id)?.tipo !== TIPO_MONITORAMENTO || obter<Monitoramento>(id)?.parametros.radarId !== parametros.radarId)) return Response.json({ error: "Monitoramento não encontrado." }, { status: 404 });
  if (existente && existente.id !== id) return Response.json({ error: "Este radar já tem um monitoramento. Use Editar para alterar os horários." }, { status: 409 });
  const cadastro = obterRadar(parametros.radarId);
  if (!cadastro.pesquisa.acompanhamento) atualizarPesquisa(cadastro.id, { ...cadastro.pesquisa, acompanhamento: true });
  if (id) { atualizarMonitoramento(id, parametros); return Response.json({ id }); }
  return Response.json({ id: criar({ tipo: TIPO_MONITORAMENTO, frequencia: "diaria", hora: parametros.horarios[0], canal: "interno", parametros }) }, { status: 201 });
}
