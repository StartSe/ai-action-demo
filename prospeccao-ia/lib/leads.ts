// Busca de leads (Apollo.io real ou fallback de demonstração), reaproveitada por app/api/leads/route.ts e lib/ferramentas.ts (MCP).
import { meta } from "./ai";
import { esperar, leadsDemo } from "./demo";
import { getConfig } from "./store";
import type { DadosBusca, Lead, ResultadoBusca } from "./types";

export const QUANTIDADES_VALIDAS = [5, 10, 15];

export function apolloEnabled(): boolean {
  return Boolean(getConfig("APOLLO_API_KEY"));
}

/** Lançado quando a Apollo responde com erro, para a rota HTTP devolver 502 em vez de 500. */
export class ErroApollo extends Error {}

function capitalizar(s: string) {
  const t = String(s || "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

interface ApolloOrg {
  founded_year?: number;
  industry?: string;
  estimated_num_employees?: number;
  name?: string;
  website_url?: string;
}

interface ApolloPessoa {
  id?: string;
  name?: string;
  title?: string;
  city?: string;
  linkedin_url?: string;
  organization?: ApolloOrg;
}

// Monta um fato verossímil sobre a empresa a partir dos campos que a Apollo devolve.
function sinalApollo(org: ApolloOrg) {
  const partes: string[] = [];
  if (org.founded_year) partes.push(`fundada em ${org.founded_year}`);
  if (org.industry) partes.push(`atua em ${org.industry}`);
  if (org.estimated_num_employees) partes.push(`cerca de ${org.estimated_num_employees} funcionários`);
  return partes.length ? `${capitalizar(partes.join(", "))}.` : "Empresa identificada via Apollo.io.";
}

function mapApolloPessoa(p: ApolloPessoa, i: number, segmento: string): Lead {
  const org = p.organization || {};
  return {
    id: p.id || `apollo-${i + 1}`,
    nome: p.name || "",
    cargo: p.title || "",
    empresa: org.name || "",
    setor: org.industry || segmento || "",
    porte: org.estimated_num_employees ? `${org.estimated_num_employees} funcionários` : "",
    cidade: p.city || "",
    linkedin: p.linkedin_url || "",
    site: org.website_url || "",
    sinal: sinalApollo(org),
  };
}

/** Busca leads via Apollo.io quando configurado, senão devolve leads de demonstração; lança ErroApollo em falha da Apollo. */
export async function buscarLeads(dados: DadosBusca): Promise<ResultadoBusca & { meta: ReturnType<typeof meta> }> {
  const { segmento, cargo, localizacao } = dados;
  const porte = dados.porte || "51-200";
  // Aceita qualquer quantidade positiva (não só QUANTIDADES_VALIDAS): a busca manual e a ferramenta MCP já
  // validam contra QUANTIDADES_VALIDAS antes de chamar esta função, mas a rotina semanal de leads novos
  // (lib/rotinas-do-app.ts) pede quantidades maiores (10, 20 ou 30) que não fazem sentido numa busca única.
  const quantidadeBruta = Number(dados.quantidade);
  const quantidade = Number.isFinite(quantidadeBruta) && quantidadeBruta > 0 ? Math.min(30, Math.floor(quantidadeBruta)) : 10;
  const intervalo = porte.replace("-", ",");
  const insumo = "segmento, cargo-alvo e localização informados";

  if (!apolloEnabled()) {
    await esperar(1200);
    const leads = leadsDemo({ segmento, cargo, porte: intervalo, localizacao, quantidade });
    return { fonte: "demo", leads, meta: meta({ demo: true, insumo }) };
  }

  const r = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": getConfig("APOLLO_API_KEY") || "" },
    body: JSON.stringify({
      person_titles: [cargo],
      person_locations: [localizacao],
      organization_num_employees_ranges: [intervalo],
      q_organization_keyword_tags: [segmento],
      per_page: quantidade,
    }),
  });
  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    console.error("Apollo", r.status, detalhe);
    throw new ErroApollo("A Apollo não respondeu. Verifique a APOLLO_API_KEY e tente novamente.");
  }
  const data = await r.json();
  const pessoas: ApolloPessoa[] = Array.isArray(data?.people) ? data.people : [];
  const leads = pessoas.slice(0, quantidade).map((p, i) => mapApolloPessoa(p, i, segmento));
  return { fonte: "apollo", leads, meta: meta({ demo: false, insumo }) };
}
