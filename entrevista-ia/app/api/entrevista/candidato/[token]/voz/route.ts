// Voz da entrevistadora na sala pública do candidato. É uma rota própria (e não /api/tts, que exige
// sessão) porque quem abre o link não tem conta de administrador: a autenticação é o próprio código do
// link. Sem link válido, nenhum áudio é gerado — assim o crédito de voz não fica aberto a qualquer um.
//
// Nenhuma resposta daqui manda o candidato configurar coisa alguma: quando a voz falha, a resposta traz
// `continuaPorTexto` e a sala segue pela voz do navegador (ou só por texto), sem interromper a conversa.
import { NextResponse } from "next/server";
import { resolverConvite } from "@/lib/convite";
import { gerarAudio, ttsEnabled } from "@/lib/voz";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };
const SEM_VOZ = { error: "A voz não está disponível agora; a entrevista continua por texto.", continuaPorTexto: true };

export async function GET(request: Request, { params }: RouteContext<"/api/entrevista/candidato/[token]/voz">) {
  const { token } = await params;
  if (!resolverConvite(token).ok) {
    return NextResponse.json({ error: "Link inválido." }, { status: 404, headers: SEM_CACHE });
  }
  const texto = new URL(request.url).searchParams.get("texto")?.trim();
  if (!texto) return NextResponse.json({ error: "Informe o texto a ser falado." }, { status: 400, headers: SEM_CACHE });
  if (!ttsEnabled()) return NextResponse.json(SEM_VOZ, { status: 503, headers: SEM_CACHE });
  try {
    return new Response(await gerarAudio(texto.slice(0, 600)), { headers: { "Content-Type": "audio/mpeg", ...SEM_CACHE } });
  } catch (err) {
    console.error(err);
    return NextResponse.json(SEM_VOZ, { status: 502, headers: SEM_CACHE });
  }
}
