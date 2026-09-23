import { api, body, AppError } from "@/lib/api";
import {
  geminiVideoStatus,
  saveGeminiVideo,
  removeGeminiVideo,
} from "@/lib/gemini-video";
export const dynamic = "force-dynamic";

export async function GET() {
  return api(geminiVideoStatus);
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    if (b.action !== undefined)
      throw new AppError(
        "Configure a chave Gemini para importar vídeos públicos.",
      );
    await saveGeminiVideo(
      typeof b.key === "string" ? b.key : "",
      typeof b.model === "string" ? b.model : "",
      req.signal,
    );
    return geminiVideoStatus();
  });
}
export async function DELETE() {
  return api(async () => {
    await removeGeminiVideo();
    return geminiVideoStatus();
  });
}
