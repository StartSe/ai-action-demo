import { ErroPublicacao, programarPublicacao } from "@/lib/publicacao";
import type { Rede } from "@/lib/types";

const REDES: Rede[] = ["linkedin", "instagram", "x"];

/** "Programar publicação": manda { rede, texto, hashtags, horario, imagem } ao webhook do Zapier/Make configurado. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { rede?: string; texto?: string; hashtags?: unknown; horario?: string; imagem?: string | null };
  const rede = REDES.includes(body.rede as Rede) ? (body.rede as Rede) : null;
  const texto = String(body.texto || "").trim();
  if (!rede || !texto) {
    return Response.json({ error: "Envie a rede e o texto do post." }, { status: 400 });
  }
  const hashtags = Array.isArray(body.hashtags) ? body.hashtags.map((h) => String(h)) : [];
  const imagem = typeof body.imagem === "string" && body.imagem.startsWith("data:image/") ? body.imagem : null;
  try {
    await programarPublicacao({ rede, texto, hashtags, horario: String(body.horario || ""), imagem });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ErroPublicacao) {
      return Response.json({ error: err.message, acao: err.acao }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Não foi possível programar a publicação agora. Tente novamente." }, { status: 500 });
  }
}
