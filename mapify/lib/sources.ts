import { load } from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { extractText } from "unpdf";
import { download, publicUrl } from "./network";
import { AppError } from "./api";
import type { Source, Segment } from "./types";
const exec = promisify(execFile);
export const MAX_CHARACTERS = 160000;
function finish(source: Omit<Source, "characters">): Source {
  const segments = source.segments.filter((s) => s.text.trim());
  const characters = segments.reduce((n, s) => n + s.text.length, 0);
  if (characters < 80)
    throw new AppError(
      "Não encontramos texto suficiente. Cole pelo menos 80 caracteres ou envie um PDF com texto selecionável.",
    );
  if (characters > MAX_CHARACTERS)
    throw new AppError(
      "Essa fonte tem mais de 160 mil caracteres. Divida o conteúdo em arquivos menores.",
    );
  return { ...source, segments, characters };
}
export function textSource(text: string, title = "Minhas anotações"): Source {
  return finish({
    kind: "text",
    title,
    segments:
      text
        .match(/[\s\S]{1,4000}/g)
        ?.map((text, i) => ({
          id: `s${i + 1}`,
          label: `Trecho ${i + 1}`,
          text,
        })) || [],
  });
}
export function htmlSource(html: string, url: string): Source {
  const $ = load(html);
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    new URL(url).hostname;
  $(
    'script,style,noscript,nav,footer,header,svg,form,iframe,[hidden],[aria-hidden="true"]',
  ).remove();
  const main = $("main").length
    ? $("main").first()
    : $("article").length
      ? $("article").first()
      : $("body");
  main.find("br,p,div,section,h1,h2,h3,h4,li,tr").each((_, el) => {
    $(el).append("\n");
  });
  const text = main
    .text()
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
  return { ...textSource(text, title.trim().slice(0, 180)), kind: "web", url };
}
export async function pdfSource(
  bytes: Uint8Array,
  title: string,
  url?: string,
): Promise<Source> {
  if (bytes.length > 15 * 1024 * 1024)
    throw new AppError("O PDF deve ter até 15 MB.");
  if (Buffer.from(bytes.slice(0, 5)).toString() !== "%PDF-")
    throw new AppError("O arquivo não é um PDF válido.");
  try {
    const result = await extractText(bytes, { mergePages: false });
    return finish({
      kind: "pdf",
      title,
      url,
      segments: result.text.map((text, i) => ({
        id: `p${i + 1}`,
        label: `Página ${i + 1}`,
        page: i + 1,
        text,
      })),
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "Não foi possível ler o PDF. Remova a senha ou envie um PDF com texto selecionável.",
    );
  }
}
export function youtubeId(input: string): string | null {
  const url = publicUrl(input);
  const host = url.hostname.replace(/^www\./, "");
  const value =
    host === "youtu.be"
      ? url.pathname.slice(1).split("/")[0]
      : ["youtube.com", "m.youtube.com"].includes(host)
        ? url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
        : null;
  return value && /^[\w-]{11}$/.test(value) ? value : null;
}
export function captionSegments(
  items: { text: string; start: number }[],
): Segment[] {
  const segments: Segment[] = [];
  for (const item of items) {
    if (typeof item.text !== "string" || !Number.isFinite(item.start)) continue;
    let last = segments.at(-1);
    if (
      !last ||
      item.start - (last.seconds || 0) >= 60 ||
      last.text.length > 2400
    ) {
      const seconds = Math.max(0, Math.floor(item.start));
      last = {
        id: `t${segments.length + 1}`,
        label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
        seconds,
        text: "",
      };
      segments.push(last);
    }
    last.text += `${item.text} `;
  }
  return segments;
}
export async function youtubeSource(
  url: string,
  signal?: AbortSignal,
): Promise<Source> {
  const id = youtubeId(url);
  if (!id)
    throw new AppError("Use um link válido de um vídeo público do YouTube.");
  let data;
  try {
    const result = await exec(
      process.env.PYTHON_PATH || "python3",
      [join(process.cwd(), "scripts/transcript.py"), id],
      { timeout: 45000, maxBuffer: 2 * 1024 * 1024, signal },
    );
    data = JSON.parse(result.stdout);
  } catch {
    throw new AppError(
      "O YouTube não liberou a transcrição. O vídeo pode não ter legendas ou bloquear este servidor. Cole a transcrição na opção Texto para continuar.",
    );
  }
  let title = "Vídeo do YouTube";
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) title = (await response.json()).title || title;
  } catch {
    /* captions remain useful */
  }
  return finish({
    kind: "youtube",
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    segments: captionSegments(data.segments || []),
  });
}
export async function linkSource(
  input: string,
  kind: string,
  signal?: AbortSignal,
) {
  if (kind === "youtube" || youtubeId(input))
    return youtubeSource(input, signal);
  const result = await download(input, signal);
  if (
    result.type.includes("application/pdf") ||
    result.bytes.subarray(0, 5).toString() === "%PDF-"
  )
    return pdfSource(
      new Uint8Array(result.bytes),
      new URL(result.url).pathname.split("/").pop() || "Documento PDF",
      result.url,
    );
  if (!/text\/(html|plain)|application\/xhtml/.test(result.type))
    throw new AppError("Esse link não contém uma página, texto ou PDF.");
  return result.type.includes("text/plain")
    ? {
        ...textSource(result.bytes.toString(), new URL(result.url).hostname),
        url: result.url,
      }
    : htmlSource(result.bytes.toString(), result.url);
}
