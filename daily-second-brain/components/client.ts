export async function request<T>(
  url: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Não foi possível concluir.");
  return j;
}
