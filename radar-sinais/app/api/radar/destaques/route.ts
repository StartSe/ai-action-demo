import { listarDestaques, salvarDestaque } from "@/lib/destaques";
export async function GET(req: Request) {
  try { return Response.json({ itens: listarDestaques(new URL(req.url).searchParams.get("radarId") || "") }); }
  catch { return Response.json({ error: "Radar não encontrado." }, { status: 404 }); }
}
export async function POST(req: Request) {
  try { return Response.json({ itens: salvarDestaque(await req.json()) }); }
  catch(e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
