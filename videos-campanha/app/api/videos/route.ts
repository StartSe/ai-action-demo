// Geração do vídeo pelo Higgsfield: POST com { campanhaId, conceitoId, efeito?, confirmar } devolve o plano
// (custo e saldo) quando confirmar não é true, e cria o vídeo quando é; GET ?campanhaId= lista os vídeos da campanha.
// A lógica vive em lib/videos.ts, compartilhada com as ferramentas MCP gerar_video e estado_video.
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { iniciarVideo, listarPorCampanha, planoVideo } from "@/lib/videos";
import { responderErro } from "./erros";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  registrarEnderecoPublico(req);
  const corpo = (await req.json().catch(() => ({}))) as { campanhaId?: unknown; conceitoId?: unknown; efeito?: unknown; confirmar?: unknown };
  const campanhaId = String(corpo.campanhaId || "").trim();
  const conceitoId = String(corpo.conceitoId || "").trim();
  const efeito = typeof corpo.efeito === "string" && corpo.efeito.trim() ? corpo.efeito.trim() : undefined;
  if (!campanhaId || !conceitoId) return Response.json({ error: "Escolha um conceito antes de gerar o vídeo." }, { status: 400 });
  try {
    if (corpo.confirmar === true) {
      const origem = baseUrl(req);
      const video = await iniciarVideo({ campanhaId, conceitoId, efeito, origemPublica: origem.startsWith("https://") ? origem : undefined });
      return Response.json({ video }, { status: 202 });
    }
    return Response.json({ plano: await planoVideo({ campanhaId, conceitoId, efeito }) });
  } catch (err) {
    return responderErro(err, "Não foi possível pedir o vídeo agora. Tente novamente.");
  }
}

export async function GET(req: Request) {
  const campanhaId = new URL(req.url).searchParams.get("campanhaId")?.trim() || "";
  if (!campanhaId) return Response.json({ error: "Informe a campanha." }, { status: 400 });
  return Response.json({ videos: listarPorCampanha(campanhaId) });
}
