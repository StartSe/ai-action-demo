import type { Note } from "./types";
export type SourceMessage = {
  text: string;
  author: string;
  when: string;
  url: string;
};
export function sourcePreview(note: Pick<Note, "title" | "content" | "tags">) {
  const collected =
    note.tags.includes("coleta") &&
    note.content.includes("## Conteúdo original\n");
  if (!collected)
    return {
      title: note.title,
      origin: "Texto",
      text: note.content,
      messages: [] as SourceMessage[],
      collected: false,
    };
  const original = note.content
    .split("## Conteúdo original\n")
    .slice(1)
    .join("## Conteúdo original\n");
  const origin = /slack/i.test(
    note.content.slice(0, note.content.indexOf("## Conteúdo original")),
  )
    ? "Slack"
    : "Coleta";
  const messages: SourceMessage[] = [];
  const texts: string[] = [];
  const seen = new Set<string>();
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  function walk(value: unknown, depth = 0) {
    if (depth > 12 || messages.length + texts.length >= 500) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (/^[\[{]/.test(trimmed)) {
        try {
          walk(JSON.parse(trimmed), depth + 1);
          return;
        } catch {
          /* Plain text is also a valid tool result. */
        }
      }
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        texts.push(trimmed);
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
    } else if (value && typeof value === "object") {
      const v = value as Record<string, unknown>;
      const text = str(v.text) || str(v.body) || str(v.message);
      if (text && (v.user || v.author || v.ts || v.timestamp)) {
        const author = str(v.user) || str(v.author);
        const when = str(v.ts) || str(v.timestamp);
        const key = JSON.stringify([text, author, when]);
        if (!seen.has(key)) {
          seen.add(key);
          messages.push({
            text,
            author,
            when,
            url: str(v.permalink) || str(v.url),
          });
        }
        if (v.replies) walk(v.replies, depth + 1);
      } else {
        // Traverse payload containers without promoting IDs or operational metadata to content.
        for (const [key, child] of Object.entries(v)) {
          if (
            [
              "content",
              "structuredContent",
              "text",
              "body",
              "message",
              "messages",
              "data",
              "result",
              "results",
              "items",
              "output",
              "response",
              "replies",
            ].includes(key) ||
            (child && typeof child === "object")
          )
            walk(child, depth + 1);
        }
      }
    }
  }
  walk(original);
  const text = messages.length
    ? messages.map((m) => m.text).join("\n\n")
    : texts.join("\n\n") || original;
  const title = messages.length
    ? `${origin} · ${messages.length} ${messages.length === 1 ? "mensagem" : "mensagens"}`
    : `${origin} · ${text.replace(/\s+/g, " ").slice(0, 90) || "Conteúdo coletado"}`;
  return { title, origin, text, messages, collected: true };
}
