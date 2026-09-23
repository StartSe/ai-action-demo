export class BrainError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 300000)
    throw new BrainError("O conteúdo excede 300 KB.", 413);
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
    return b;
  } catch {
    throw new BrainError("Envie um conteúdo válido.");
  }
}
export function string(value: unknown, max = 100000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new BrainError("Preencha o conteúdo dentro do limite permitido.");
  return value.trim();
}
export async function api(fn: () => unknown | Promise<unknown>) {
  try {
    return Response.json(await fn(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Não foi possível concluir." },
      {
        status: e instanceof BrainError ? e.status : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
