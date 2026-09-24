export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function api(fn: () => unknown | Promise<unknown>) {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível concluir. Tente novamente.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 1_500_000)
    throw new AppError("O conteúdo excede o limite permitido.", 413);
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("Dados inválidos.");
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Bound multipart bodies even without Content-Length, before parsing files into memory. */
export async function formDataLimitado(req: Request, limite: number, mensagem: string): Promise<FormData> {
  if (Number(req.headers.get("content-length")) > limite) throw new AppError(mensagem, 413);
  if (!req.body) throw new AppError("Envie um arquivo.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) { await reader.cancel(); throw new AppError(mensagem, 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return await new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData(); }
  catch { throw new AppError("Não foi possível ler o envio. Escolha o arquivo novamente."); }
}
