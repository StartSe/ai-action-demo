import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { assets } from "@/lib/flow/store";
import { assetPath } from "@/lib/flow/media";
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const asset = assets().find((a) => a.id === id);
  if (!asset?.mimeType)
    return new Response("Arquivo não encontrado.", { status: 404 });
  try {
    const file = assetPath(id);
    const info = await stat(file);
    const headers = new Headers({
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    let start = 0,
      end = info.size - 1;
    const range = req.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (start > end || start >= info.size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    }
    headers.set("Content-Length", String(end - start + 1));
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream,
      { status: range ? 206 : 200, headers },
    );
  } catch {
    return new Response("Arquivo não encontrado.", { status: 404 });
  }
}
