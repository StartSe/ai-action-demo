import { lerPesquisa, salvarPesquisa } from "@/lib/pesquisa-store";
import { COLETORES } from "@/lib/pesquisa";
import { getConfig } from "@/lib/store";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ pesquisa: lerPesquisa(), coletores: COLETORES.map(p => ({ ...p, configurado: !p.chave || Boolean(getConfig(p.chave)) })) });
}
export async function PUT(req: Request) {
  try { return Response.json({ pesquisa: salvarPesquisa(await req.json()) }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Configuração inválida." }, { status: 400 }); }
}
