import { getConfig } from "./store";
import { urlPublica } from "./brightdata";
import type { Achado } from "./busca";
export class ChaveSearchAPIRecusada extends Error {}
export async function consultarSearchAPI(consulta: string, dias: number, chave = getConfig("SEARCHAPI_API_KEY")): Promise<Achado[]> {
  if (!chave) throw new Error("Conecte a SearchAPI em Configurações.");
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ engine: "google", q: `${consulta} after:${desde}`, gl: "br", hl: "pt" });
  const r = await fetch(`https://www.searchapi.io/api/v1/search?${params}`, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(15000) });
  if (r.status === 401 || r.status === 403) throw new ChaveSearchAPIRecusada("A SearchAPI recusou a chave.");
  if (!r.ok) throw new Error("SearchAPI indisponível. Confira a cota e tente novamente.");
  const dados = await r.json();
  if (dados.error || !Array.isArray(dados.organic_results)) {
    if (dados.search_information?.organic_results_state === "Fully empty") return [];
    throw new Error("A SearchAPI não retornou resultados válidos.");
  }
  return dados.organic_results.slice(0, 15).flatMap((v: { title?: string; link?: string; snippet?: string }) => {
    if (!urlPublica(v.link) || typeof v.title !== "string") return [];
    return [{ titulo: v.title.slice(0, 500), url: v.link, trecho: typeof v.snippet === "string" ? v.snippet.slice(0, 1500) : "", veiculo: new URL(v.link).hostname, publicadoEm: "", pontuacao: 4, fonte: "searchapi" as const }];
  });
}
