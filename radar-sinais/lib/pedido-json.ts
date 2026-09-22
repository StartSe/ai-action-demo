/** Pedidos autenticados do navegador; credenciais de provedores nunca entram aqui. */
export async function pedidoJSON<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const dados = await res.json();
  if (!res.ok) throw new Error(dados.error || "Não foi possível concluir. Tente novamente.");
  return dados as T;
}
