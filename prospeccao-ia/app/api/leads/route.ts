import { esperar, leadsDemo } from "@/lib/demo";
import { getConfig } from "@/lib/store";
import type { Lead } from "@/lib/types";

const QUANTIDADES_VALIDAS = [5, 10, 15];

function apolloEnabled() {
  return Boolean(getConfig("APOLLO_API_KEY"));
}

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const segmento = String(body?.segmento || "").trim();
  const cargo = String(body?.cargo || "").trim();
  const localizacao = String(body?.localizacao || "").trim();
  const proposta = String(body?.proposta || "").trim();
  const porte = String(body?.porte || "51-200").trim();
  const quantidade = QUANTIDADES_VALIDAS.includes(Number(body?.quantidade)) ? Number(body.quantidade) : 10;
  const intervalo = porte.replace("-", ",");

  if (!segmento || !cargo || !localizacao || !proposta) {
    return Response.json({ error: "Preencha segmento, cargo-alvo, localização e o que sua empresa vende." }, { status: 400 });
  }

  try {
    if (!apolloEnabled()) {
      await esperar(1200);
      const leads = leadsDemo({ segmento, cargo, porte: intervalo, localizacao, quantidade });
      return Response.json({ fonte: "demo", leads });
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
      return Response.json({ error: "A Apollo não respondeu. Verifique a APOLLO_API_KEY e tente novamente." }, { status: 502 });
    }
    const data = await r.json();
    const pessoas: ApolloPessoa[] = Array.isArray(data?.people) ? data.people : [];
    const leads = pessoas.slice(0, quantidade).map((p, i) => mapApolloPessoa(p, i, segmento));
    return Response.json({ fonte: "apollo", leads });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível buscar os leads agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
