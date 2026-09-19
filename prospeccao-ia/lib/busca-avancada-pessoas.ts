// Contrato oficial: brightdata/brightdata-mcp, search_dataset_schema.js e server.js.
import { brightDataAtiva } from "./brightdata";
import { buscarNaWeb, executarAcaoPesquisa, listarAcoesPesquisa, TetoConsultasAtingido, type RespostaBusca } from "./descoberta";

export const DATASET_PESSOAS = "gd_l1viktl72bvl7bjuj0";
export type FiltrosPessoas = { cargo?: string; empresa?: string; localizacao?: string; setor?: string };
type Campo = { name: string; type?: string };
type Filtro = { name: string; operator: string; value: string } | { operator: "and" | "or"; filters: Filtro[] };
const objeto = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const texto = (v: unknown) => typeof v === "string" ? v.trim() : "";

/** Não presume campos: só usa os nomes confirmados por list_dataset_fields. */
export function filtroPessoas(campos: Campo[], criterios: FiltrosPessoas): Filtro | null {
  const nomes = new Set(campos.filter(c => !c.type || /^(text|string|str|keyword)$/i.test(c.type)).map(c => c.name));
  const filtros: Filtro[] = [];
  for (const [criterio, bruto] of Object.entries(criterios)) {
    if (!bruto?.trim()) continue;
    const brasil = criterio === "localizacao" && /^(brasil|brazil|br)$/i.test(bruto.trim());
    const alternativas: Record<string, string[]> = {
      cargo: ["position", "current_position", "job_title", "title"],
      empresa: ["current_company_name", "company_name", "current_company.name"],
      setor: ["company_industry", "industry"],
      localizacao: brasil ? ["country_code", "country", "location"] : ["location", "city"],
    };
    const campo = alternativas[criterio]?.find(n => nomes.has(n));
    // Sem campo compatível, a busca web recebe todos os critérios originais.
    if (!campo) return null;
    const termos = bruto.split(/\s+(?:ou|or)\s+|\s*;\s*/i).map(s => s.trim()).filter(Boolean).slice(0, 8);
    const folhas = termos.map(termo => ({ name: campo, operator: campo === "country_code" || campo === "country" ? "=" : "includes", value: brasil ? campo === "country_code" ? "BR" : "Brazil" : termo }));
    filtros.push(folhas.length === 1 ? folhas[0] : { operator: "or", filters: folhas });
  }
  return filtros.length > 1 ? { operator: "and", filters: filtros } : filtros[0] ?? null;
}

export function perfisDoDataset(hits: unknown): RespostaBusca["itens"] {
  if (!Array.isArray(hits)) return [];
  return hits.flatMap(hit => {
    const registro = objeto(hit);
    const dados = registro._source ? objeto(registro._source) : registro;
    const nome = texto(dados.name) || [texto(dados.first_name), texto(dados.last_name)].filter(Boolean).join(" ");
    const url = texto(dados.url) || texto(dados.linkedin_url);
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || !(u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) || !/^\/in\/[^/]+/.test(u.pathname) || u.username || u.password) return [];
    } catch { return []; }
    if (!nome) return [];
    const cargo = texto(dados.position) || texto(dados.job_title);
    const empresa = texto(dados.current_company_name) || texto(objeto(dados.current_company).name) || texto(dados.company_name);
    return [{ titulo: [nome, cargo, empresa].filter(Boolean).join(" - "), url, resumo: [texto(dados.about), texto(dados.location), texto(dados.city), texto(dados.country_code)].filter(Boolean).join(" · ").slice(0, 3000) }];
  });
}

/** Busca estruturada primeiro; indisponibilidade, campos incompatíveis ou lista vazia usam a web. */
export async function buscarPessoasAvancada(consulta: string, filtros: FiltrosPessoas, prospeccaoId: string): Promise<RespostaBusca> {
  if (brightDataAtiva()) {
    try {
      const acoes = await listarAcoesPesquisa();
      if (acoes.some(a => a.nome === "search_dataset") && acoes.some(a => a.nome === "list_dataset_fields")) {
        const campos = await executarAcaoPesquisa("list_dataset_fields", { dataset_id: DATASET_PESSOAS }, prospeccaoId);
        const filtro = filtroPessoas(Array.isArray(campos) ? campos.filter(c => typeof c?.name === "string") : [], filtros);
        if (filtro) {
          const itens: RespostaBusca["itens"] = [];
          const vistos = new Set<string>();
          const cursores = new Set<string>();
          let cursor: unknown[] | undefined;
          for (let pagina = 0; pagina < 2; pagina++) {
            const resposta = objeto(await executarAcaoPesquisa("search_dataset", { dataset_id: DATASET_PESSOAS, filter: filtro, size: 10, sort: "default", ...(cursor ? { search_after: cursor } : {}) }, prospeccaoId));
            if (!Array.isArray(resposta.hits)) throw new Error("Resposta de dataset inválida");
            for (const item of perfisDoDataset(resposta.hits)) {
              const chave = new URL(item.url).pathname.replace(/\/$/, "").toLowerCase();
              if (!vistos.has(chave)) { vistos.add(chave); itens.push(item); }
            }
            cursor = Array.isArray(resposta.search_after) ? resposta.search_after : undefined;
            if (!resposta.hits.length || !cursor?.length || cursores.has(JSON.stringify(cursor))) break;
            cursores.add(JSON.stringify(cursor));
          }
          if (itens.length) return { itens, origem: "Bright Data · base de perfis públicos", consultadoEm: new Date().toISOString(), demo: false };
        }
      }
    } catch (erro) {
      if (erro instanceof TetoConsultasAtingido) throw erro;
      // executarAcaoPesquisa já registra a falha sem expor credenciais. A web é a alternativa.
    }
  }
  return buscarNaWeb(consulta, 0, prospeccaoId);
}
