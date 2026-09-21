export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export async function api(fn: () => unknown | Promise<unknown>) {
  try {
    return Response.json(await fn(), {
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
