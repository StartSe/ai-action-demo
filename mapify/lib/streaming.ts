import { AppError } from "./api";

/** SSE framing, shared by providers. Handles split UTF-8, CRLF and multiline data. */
export async function* sseData(response: Response, signal?: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError("O provedor retornou uma resposta vazia.");
  const decoder = new TextDecoder();
  let buffer = "",
    bytes = 0,
    data: string[] = [];
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      bytes += chunk.value?.length || 0;
      if (bytes > 2_000_000)
        throw new AppError("A resposta excedeu o tamanho permitido.");
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      // Process only complete lines; a trailing CR may be half of a CRLF.
      while (true) {
        const end = buffer.search(/[\r\n]/);
        if (
          end < 0 ||
          (!chunk.done && end === buffer.length - 1 && buffer[end] === "\r")
        )
          break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(
          end + (buffer.slice(end, end + 2) === "\r\n" ? 2 : 1),
        );
        if (!line) {
          if (data.length) yield data.join("\n");
          data = [];
        } else if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (chunk.done) break;
    }
    // SSE dispatch requires a blank line. An unfinished final event is not success.
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Read only fully received JSON strings/scalars, while allowing open containers.
 * Preview only: final output must still pass JSON.parse and domain validation. */
export function partialJSON(input: string): unknown {
  const text = input.trimStart().replace(/^```(?:json)?\s*/, "");
  if (text.length > 500000) return null;
  let i = 0;
  const missing = Symbol("missing");
  const space = () => {
    while (/\s/.test(text[i] || "x")) i++;
  };
  function value(depth: number): unknown {
    if (depth > 24) return missing;
    space();
    if (text[i] === '"') {
      const start = i++;
      let escaped = false;
      while (i < text.length) {
        const char = text[i++];
        if (!escaped && char === '"') {
          try {
            return JSON.parse(text.slice(start, i));
          } catch {
            return missing;
          }
        }
        if (char === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
      return missing;
    }
    if (text[i] === "{") {
      i++;
      const result: Record<string, unknown> = Object.create(null);
      while (i < text.length) {
        space();
        if (text[i] === "}") {
          i++;
          return result;
        }
        if (text[i] !== '"') return result;
        const key = value(depth + 1);
        if (typeof key !== "string") return result;
        space();
        if (text[i++] !== ":") return result;
        const item = value(depth + 1);
        if (item === missing) return result;
        result[key] = item;
        space();
        if (text[i] === "}") {
          i++;
          return result;
        }
        if (text[i++] !== ",") return result;
      }
      return result;
    }
    if (text[i] === "[") {
      i++;
      const result: unknown[] = [];
      while (i < text.length && result.length < 1000) {
        space();
        if (text[i] === "]") {
          i++;
          return result;
        }
        const item = value(depth + 1);
        if (item === missing) return result;
        result.push(item);
        space();
        if (text[i] === "]") {
          i++;
          return result;
        }
        if (text[i++] !== ",") return result;
      }
      return result;
    }
    const start = i;
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
    if (i === text.length || i === start) return missing;
    try {
      return JSON.parse(text.slice(start, i));
    } catch {
      return missing;
    }
  }
  const result = value(0);
  return result === missing ? null : result;
}
