import { responderErro } from "@/app/api/erros";
import { ACAO_VOZ } from "@/lib/acoes";
import { gerarAudio, ttsEnabled } from "@/lib/voz";

export const dynamic = "force-dynamic";

// Fala a pergunta com a voz da ElevenLabs. Quando a voz não está ligada ou a ElevenLabs recusa a
// chamada, a resposta traz `continuaPorTexto`: a sala segue a entrevista pela voz do navegador (ou só
// por texto), sem interromper a conversa (ver components/Sala.tsx).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const texto = String(searchParams.get("texto") || "").trim();
  if (!texto) {
    return Response.json({ error: "Informe o texto a ser falado." }, { status: 400 });
  }
  if (!ttsEnabled()) {
    return Response.json(
      { error: "A voz da entrevistadora ainda não foi conectada; a entrevista continua por texto.", codigo: "voz_desligada", acao: ACAO_VOZ, continuaPorTexto: true },
      { status: 503 }
    );
  }
  try {
    const audio = await gerarAudio(texto.slice(0, 600));
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    return responderErro(err, "Não foi possível gerar o áudio agora; a entrevista continua por texto.");
  }
}
