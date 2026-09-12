import { gerarAudio, ttsEnabled } from "@/lib/voz";

export const dynamic = "force-dynamic";

// Fala a pergunta com a voz da ElevenLabs. O frontend só chama esta rota quando
// /api/status -> integrations.tts é true; caso contrário usa o sintetizador do navegador.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const texto = String(searchParams.get("texto") || "").trim();
  if (!texto) {
    return Response.json({ error: "Informe o texto a ser falado no parâmetro texto." }, { status: 400 });
  }
  if (!ttsEnabled()) {
    return Response.json({ error: "Voz da ElevenLabs não configurada. Conecte a chave em /setup." }, { status: 503 });
  }
  try {
    const audio = await gerarAudio(texto.slice(0, 600));
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar o áudio agora.";
    return Response.json({ error: mensagem }, { status: 502 });
  }
}
