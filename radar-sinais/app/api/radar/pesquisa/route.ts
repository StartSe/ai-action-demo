import { sincronizarAgendas } from "@/lib/agendas-radar";
import { lerPesquisa, salvarPesquisa } from "@/lib/pesquisa-store";
import { COLETORES } from "@/lib/pesquisa";
import { getConfig } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return Response.json({ pesquisa: lerPesquisa(new URL(req.url).searchParams.get("radarId") || undefined), coletores: COLETORES.map(p => ({ ...p, configurado: !p.chave || Boolean(getConfig(p.chave)) })) }); } catch { return Response.json({ error: "Radar não encontrado." }, { status: 404 }); }
}
export async function PUT(req: Request) {
  try { const pesquisa = salvarPesquisa(await req.json(), new URL(req.url).searchParams.get("radarId") || undefined); await sincronizarAgendas(); return Response.json({ pesquisa }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Configuração inválida." }, { status: 400 }); }
}
