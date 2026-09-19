import { sessaoAtual } from "@/lib/conta";
import { baseUrl } from "@/lib/setup-comum";
import { cancelarConexaoLivekit, consultarConexaoLivekit, ErroConexaoLivekit, iniciarConexaoLivekit } from "@/lib/livekit-cloud-auth";

const COOKIE = "lk_cloud_auth";
function validar(req: Request) {
  if (process.env.CONTA_DESLIGADA !== "1" && !sessaoAtual(req)) return Response.json({ error: "Entre na sua conta para conectar o LiveKit." }, { status: 401 });
  if (req.headers.get("origin") !== new URL(baseUrl(req)).origin) return Response.json({ error: "Abra Configurações para conectar o LiveKit." }, { status: 403 });
}
function id(req: Request) { return /(?:^|;\s*)lk_cloud_auth=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get("cookie") || "")?.[1]; }
function cookie(req: Request, valor: string, maxAge: number) {
  return `${COOKIE}=${valor}; Path=/api/setup/livekit-cloud; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${baseUrl(req).startsWith("https:") ? "; Secure" : ""}`;
}
function erro(err: unknown) {
  return Response.json({ error: err instanceof ErroConexaoLivekit ? err.message : "Não foi possível conectar ao LiveKit." }, { status: err instanceof ErroConexaoLivekit ? err.status : 502, headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const negado = validar(req); if (negado) return negado;
  try {
    const anterior = id(req); if (anterior) cancelarConexaoLivekit(anterior);
    const auth = await iniciarConexaoLivekit();
    return Response.json({ url: auth.url, expira: auth.expira }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie(req, auth.id, 900) } });
  } catch (err) { return erro(err); }
}
export async function PUT(req: Request) {
  const negado = validar(req); if (negado) return negado;
  const codigo = id(req);
  if (!codigo) return Response.json({ error: "Inicie a conexão neste navegador." }, { status: 401 });
  try { return Response.json(await consultarConexaoLivekit(codigo), { headers: { "Cache-Control": "no-store" } }); }
  catch (err) { return erro(err); }
}
export async function DELETE(req: Request) {
  const negado = validar(req); if (negado) return negado;
  const codigo = id(req); if (codigo) cancelarConexaoLivekit(codigo);
  return Response.json({ cancelada: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie(req, "", 0) } });
}
