export function youtubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    return null;
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
export function youtubeThumbnail(url?: string) {
  const id = url ? youtubeId(url) : null;
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}
