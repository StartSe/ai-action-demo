import { api, body, string } from "@/lib/api";
import {
  geminiVideoStatus,
  saveGeminiVideo,
  removeGeminiVideo,
  setYouTubeMode,
  analyzeYouTubeVideo,
} from "@/lib/gemini-video";
import { youtubeId } from "@/lib/sources";
import { AppError } from "@/lib/api";
export const dynamic = "force-dynamic";

export async function GET() {
  return api(geminiVideoStatus);
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.action === "mode") await setYouTubeMode(b.mode);
    else await saveGeminiVideo(string(b.key, 301), string(b.model, 120));
    return geminiVideoStatus();
  });
}
export async function DELETE() {
  return api(async () => {
    await removeGeminiVideo();
    return geminiVideoStatus();
  });
}
export async function POST(req: Request) {
  return api(async () => {
    const b = await body(req);
    const id = youtubeId(string(b.url, 2000));
    if (!id)
      throw new AppError("Informe um link válido do YouTube para testar.");
    const source = await analyzeYouTubeVideo(id, req.signal);
    return {
      message: `Vídeo analisado pelo Gemini: ${source.title}.`,
      title: source.title,
      segments: source.segments.length,
      characters: source.characters,
      preview: source.segments[0].text.slice(0, 600),
    };
  });
}
