import { api, AppError } from "@/lib/api";
import { startJob } from "@/lib/generation";
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
    const focus = String(form.get("focus") || "").slice(0, 1000);
    if (text.length > MAX_CHARACTERS)
      throw new AppError("Use até 160 mil caracteres.");
    if (
      kind === "pdf" &&
      (!(file instanceof File) || file.size > 15 * 1024 * 1024)
    )
      throw new AppError("Selecione um PDF de até 15 MB.");
    const bytes =
      file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
    return startJob(
      async (signal) =>
        kind === "pdf" && bytes
          ? pdfSource(bytes, (file as File).name)
          : kind === "text"
            ? textSource(text)
            : linkSource(url, kind, signal),
      detail,
      focus,
    );
  });
}
