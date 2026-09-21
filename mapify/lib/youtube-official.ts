import { load } from "cheerio";
import { AppError } from "./api";
import type { YouTubeOAuth } from "./youtube-oauth";

type Caption = {
  id: string;
  snippet: {
    language: string;
    trackKind?: string;
    status?: string;
    isDraft?: boolean;
  };
};
export function parseSrt(input: string) {
  const result: { text: string; start: number }[] = [];
  for (const block of input
    .replace(/\r\n?/g, "\n")
    .replace(/^\uFEFF/, "")
    .split(/\n\s*\n/)) {
    const match = block.match(
      /(?:^|\n)(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})\s+-->\s+\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3}[^\n]*\n([\s\S]+)/,
    );
    if (!match) continue;
    const $ = load(match[5], {}, false);
    $("br").replaceWith(" ");
    $("script,style").remove();
    const text = $.root().text().replace(/\s+/g, " ").trim();
    const start =
      Number(match[1]) * 3600 +
      Number(match[2]) * 60 +
      Number(match[3]) +
      Number(match[4]) / 1000;
    if (text && Number.isFinite(start)) result.push({ text, start });
  }
  if (!result.length)
    throw new AppError(
      "O YouTube retornou uma legenda vazia ou em formato inválido.",
    );
  return result.sort((a, b) => a.start - b.start);
}
export async function officialCaptions(
  id: string,
  api: Pick<YouTubeOAuth, "api">,
  signal?: AbortSignal,
) {
  if (!/^[\w-]{11}$/.test(id))
    throw new AppError("O vídeo do YouTube é inválido.");
  const response = await api.api(`captions?part=snippet&videoId=${id}`, signal);
  const data = await response.json();
  const languages = ["pt", "pt-br", "en", "en-us", "es"];
  const rank = (track: Caption) => {
    const index = languages.indexOf(track.snippet.language?.toLowerCase());
    return (
      (index < 0 ? languages.length : index) * 2 +
      (track.snippet.trackKind === "ASR" ? 1 : 0)
    );
  };
  const tracks = (Array.isArray(data.items) ? data.items : []) as Caption[];
  const track = tracks
    .filter(
      (t) =>
        typeof t.id === "string" &&
        t.snippet &&
        t.snippet.status !== "failed" &&
        t.snippet.status !== "syncing" &&
        !t.snippet.isDraft,
    )
    .sort((a, b) => rank(a) - rank(b))[0];
  if (!track)
    throw new AppError(
      "Este vídeo não tem legendas disponíveis pela API oficial para a conta conectada. Confira as legendas no YouTube Studio.",
    );
  const caption = await api.api(
    `captions/${encodeURIComponent(track.id)}?tfmt=srt`,
    signal,
  );
  // Bound memory even when Content-Length is absent or incorrect.
  const reader = caption.body?.getReader();
  if (!reader)
    throw new AppError("O YouTube não retornou o conteúdo da legenda.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2_000_000)
        throw new AppError(
          "A legenda excede o tamanho permitido. Use um trecho menor na opção Texto.",
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return parseSrt(Buffer.concat(chunks).toString("utf8"));
}
