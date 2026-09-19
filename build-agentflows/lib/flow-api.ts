import { FlowError } from "./flow-store";
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 300000)
    throw new FlowError("O arquivo excede 300 KB.", 413);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new FlowError("Envie um objeto JSON válido.");
  }
}
export async function api(fn: () => unknown | Promise<unknown>) {
  try {
    return Response.json(await fn(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Não foi possível concluir." },
      { status: e instanceof FlowError ? e.status : 500 },
    );
  }
}
