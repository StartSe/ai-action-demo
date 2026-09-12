import { transcrever } from "@/lib/transcricao";

export const dynamic = "force-dynamic";

const TAMANHO_MAX = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!audio || !(audio instanceof File)) {
    return Response.json({ error: "Envie um arquivo de áudio (mp3, m4a, wav, webm ou ogg) de até 25 MB." }, { status: 400 });
  }
  if (audio.size > TAMANHO_MAX) {
    return Response.json({ error: "O áudio passa de 25 MB. Envie um arquivo menor ou use a transcrição em texto." }, { status: 400 });
  }
  try {
    const buffer = await audio.arrayBuffer();
    const { transcricao, fonte } = await transcrever({ buffer, filename: audio.name, mimetype: audio.type });
    return Response.json({ transcricao, fonte });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível transcrever o áudio agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
