import { api, AppError } from "@/lib/api";
import { startJob } from "@/lib/generation";
import { youtubeId } from "@/lib/youtube-link";
import { sourceLabels, type SourceKind } from "@/lib/types";
import {
  textSource,
  pdfSource,
  linkSource,
  MAX_CHARACTERS,
} from "@/lib/sources";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return api(async () => {
    if (Number(req.headers.get("content-length") || 0) > 16 * 1024 * 1024)
      throw new AppError("Envie um arquivo de até 15 MB.", 413);
    const form = await req.formData();
    const kind = String(form.get("kind") || "text");
    const text = String(form.get("text") || "");
    const url = String(form.get("url") || "");
    const file = form.get("file");
    const detail = String(form.get("detail") || "balanced");
    if (!["brief", "balanced", "deep"].includes(detail))
      throw new AppError("Escolha um nível de detalhe válido.");
    const focus = String(form.get("focus") || "").slice(0, 1000);
    if (text.length > MAX_CHARACTERS)
      throw new AppError("Use até 160 mil caracteres.");
    if (
      kind === "pdf" &&
      (!(file instanceof File) || file.size > 15 * 1024 * 1024)
    )
      throw new AppError("Selecione um PDF de até 15 MB.");
    if (!Object.hasOwn(sourceLabels, kind))
      throw new AppError("Escolha uma fonte válida.");
    const videoId = ["youtube", "web"].includes(kind) ? youtubeId(url) : null;
    if (kind === "youtube" && !videoId)
      throw new AppError("Use um link válido de um vídeo do YouTube.");
    const sourceKind: SourceKind = videoId ? "youtube" : (kind as SourceKind);
    const bytes =
      file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
    return startJob(
      async (signal, progress) =>
        kind === "pdf" && bytes
          ? pdfSource(bytes, (file as File).name)
          : kind === "text"
            ? textSource(text)
            : linkSource(url, kind, signal, progress),
      detail,
      focus,
      {
        kind: sourceKind,
        title:
          sourceKind === "youtube"
            ? "Seu vídeo do YouTube"
            : file instanceof File
              ? file.name
              : sourceLabels[sourceKind],
        url: videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : sourceKind === "web"
            ? url
            : undefined,
      },
    );
  });
}
