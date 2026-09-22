import { configurarVoz, listarVozes, statusVoz, verificarVoz } from "@/lib/voz";
import { AppError } from "@/lib/voz-erro";
function erro(e: unknown) { return Response.json({ error: e instanceof AppError ? e.message : "Não foi possível acessar a conversa por voz." }, { status: e instanceof AppError ? e.status : 500 }); }
export async function GET(req: Request) {
  try { return Response.json({ ...statusVoz(), ...(new URL(req.url).searchParams.has("vozes") ? { vozes: await listarVozes() } : {}) }); } catch(e) { return erro(e); }
}
export async function PUT(req: Request) {
  try { const b = await req.json(); await configurarVoz(b); return Response.json(typeof b.vozId === "string" && b.vozId && !b.desconectar ? await verificarVoz(req.signal) : statusVoz()); } catch(e) { return erro(e); }
}
export async function POST(req: Request) {
  try { return Response.json(await verificarVoz(req.signal)); } catch(e) { return erro(e); }
}
