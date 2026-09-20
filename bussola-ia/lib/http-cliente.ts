export async function requisitar<T>(url: string, options?: RequestInit): Promise<T> {
  const r = await fetch(url, options);
  const d = await r.json();
  if (!r.ok) { throw new Error(d.error || "Não foi possível concluir. Tente novamente."); }
  return d as T;
}
