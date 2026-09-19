import { createHash } from "node:crypto";
import { getConfig } from "./store";
import type { Achado } from "./busca";

const TTL = 300;
export async function comandoRedis(comando: (string | number)[], config?: Record<string, string | undefined>): Promise<unknown> {
  const url = config?.UPSTASH_REDIS_REST_URL ?? getConfig("UPSTASH_REDIS_REST_URL");
  const token = config?.UPSTASH_REDIS_REST_TOKEN ?? getConfig("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Redis não configurado.");
  const destino = new URL(url);
  if (destino.protocol !== "https:" || !destino.hostname.endsWith(".upstash.io") || destino.username || destino.password || destino.port) throw new Error("Use o endpoint HTTPS do Upstash Redis.");
  const r = await fetch(destino.origin, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(comando), signal: AbortSignal.timeout(2000) });
  if (!r.ok) throw new Error("Redis indisponível.");
  const data = await r.json();
  if (data.error) throw new Error("Redis recusou o comando.");
  return data.result;
}
export async function buscarComCache(chave: unknown, executar: () => Promise<Achado[]>): Promise<{ achados: Achado[]; coletadoEm: string; cache: boolean }> {
  const habilitado = Boolean(getConfig("UPSTASH_REDIS_REST_URL") && getConfig("UPSTASH_REDIS_REST_TOKEN"));
  const id = `radar:busca:v1:${createHash("sha256").update(JSON.stringify(chave)).digest("hex")}`;
  if (habilitado) {
    try {
      const bruto = await comandoRedis(["GET", id]);
      if (typeof bruto === "string") {
        const c = JSON.parse(bruto);
        const idade = Date.now() - Date.parse(c.coletadoEm);
        if (idade >= 0 && idade < TTL * 1000 && Array.isArray(c.achados) && c.achados.every((a: Achado) => a && typeof a.url === "string" && typeof a.titulo === "string" && typeof a.trecho === "string" && typeof a.publicadoEm === "string" && typeof a.veiculo === "string" && typeof a.fonte === "string" && Number.isFinite(a.pontuacao))) return { ...c, cache: true };
      }
    } catch { /* O cache nunca bloqueia a busca; não registra endpoints nem credenciais. */ }
  }
  const achados = await executar();
  const resultado = { achados, coletadoEm: new Date().toISOString(), cache: false };
  if (habilitado && achados.length) {
    try { await comandoRedis(["SET", id, JSON.stringify(resultado), "EX", TTL]); } catch { /* segue sem cache */ }
  }
  return resultado;
}
