import { bloquearTentativaAntiga } from "@/lib/tentativa";
import { conferirSala } from "@/lib/sala-do-candidato";
import { lerRoteiroGravado } from "@/lib/roteiro";
import { tokenDaEntrevista } from "@/lib/livekit";

export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bloqueio = bloquearTentativaAntiga(req, token);
  if (bloqueio) return bloqueio;
  const resultado = conferirSala(token, req.headers.get("cookie"));
  if (!resultado.ok) return Response.json({ error: resultado.descricao }, { status: resultado.status });
  if (!resultado.mesmoAparelho) return Response.json({ error: "Comece a entrevista neste aparelho antes de conectar a voz." }, { status: 403 });
  const entrevista = resultado.entrevista;
  if (!entrevista || !lerRoteiroGravado(entrevista.id)) return Response.json({ error: "Esta entrevista ainda não está pronta. Entre em contato com quem enviou o convite." }, { status: 409 });
  try {
    const worker = await fetch("http://127.0.0.1:8091/", { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (!worker.ok) throw new Error("Agente indisponível");
    return Response.json(await tokenDaEntrevista(entrevista.id, entrevista.tentativa), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "A conexão de voz não está disponível agora. Tente conectar novamente ou continue por texto." }, { status: 503 });
  }
}
