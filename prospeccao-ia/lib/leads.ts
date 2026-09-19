// Busca de leads (Apollo.io real ou fallback de demonstração), reaproveitada por app/api/leads/route.ts e lib/ferramentas.ts (MCP).
import { ACAO_BUSCA_DE_LEADS } from "./acoes";
import { meta } from "./ai";
import { esperar, leadsDemo } from "./demo";
import { getConfig } from "./store";
import type { DadosBusca, Lead, ResultadoBusca } from "./types";

export const QUANTIDADES_VALIDAS = [5, 10, 15];

export function apolloEnabled(): boolean {
  return Boolean(getConfig("APOLLO_API_KEY"));
}



export type CodigoErroBusca = "chave_recusada" | "limite_do_plano" | "servico_fora";

/**
 * Falha da busca de leads (Apollo) já traduzida para a tela: mensagem em linguagem de negócio, sem
 * nome de variável, status HTTP do provedor nem corpo da resposta (esses vão só para o console).
 * Mesmo formato de ErroIA (lib/ai.ts), para `respostaErro` devolver codigo e acao sem caso especial.
 */
export class ErroApollo extends Error {
  codigo: CodigoErroBusca;
  status: number;
  acao?: { rotulo: string; url: string };

  constructor(codigo: CodigoErroBusca, mensagem: string, status: number, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroApollo";
    this.codigo = codigo;
    this.status = status;
    this.acao = acao;
  }
}

/** Único ponto que traduz uma resposta não-ok da Apollo em ErroApollo. O detalhe técnico nunca chega à tela. */
export function interpretarFalhaApollo(status: number, detalheBruto: string): ErroApollo {
  console.error("Falha na busca de leads:", status, detalheBruto.slice(0, 200));
  if (status === 401 || status === 403) {
    return new ErroApollo("chave_recusada", "A busca de leads recusou a chave. Confira em Configurações › Busca de leads.", 401, ACAO_BUSCA_DE_LEADS);
  }
  if (status === 402 || status === 429) {
    return new ErroApollo("limite_do_plano", "A conta da Apollo atingiu o limite de créditos do plano.", 429, ACAO_BUSCA_DE_LEADS);
  }
  return new ErroApollo("servico_fora", "A busca de leads não respondeu; tente de novo em um minuto.", 502);
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
  return partes.length ? `${capitalizar(partes.join(", "))}.` : "Empresa encontrada na busca de leads, sem dados públicos de porte ou setor.";
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

  let r: Response;
  try {
    r = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", "x-api-key": getConfig("APOLLO_API_KEY") || "" },
      body: JSON.stringify({
        person_titles: [cargo],
        person_locations: [localizacao],
        organization_num_employees_ranges: [intervalo],
        q_organization_keyword_tags: [segmento],
        per_page: quantidade,
      }),
    });
  } catch (err) {
    console.error("Falha de rede na busca de leads:", err);
    throw new ErroApollo("servico_fora", "A busca de leads não respondeu; tente de novo em um minuto.", 502);
  }
  if (!r.ok) {
    throw interpretarFalhaApollo(r.status, await r.text().catch(() => ""));
  }
  const data = await r.json();
  const pessoas: ApolloPessoa[] = Array.isArray(data?.people) ? data.people : [];
  const leads = pessoas.slice(0, quantidade).map((p, i) => mapApolloPessoa(p, i, segmento));
  return { fonte: "apollo", leads, meta: meta({ demo: false, insumo }) };
}

export interface PessoaDaEmpresa {
  nome: string;
  cargo: string | null;
  linkedin: string | null;
}

const CARGOS_DECISAO_EMPRESA = ["Diretor", "Gerente", "Head", "Coordenador"];

/**
 * Busca pessoas ligadas a UMA empresa (modo "Explorar uma empresa", prospeccao-ia): usa os campos
 * estruturados de cargo e organização que a Apollo devolve, mais confiáveis do que extrair nome/cargo do
 * título de um resultado de busca pública. `sobreEmpresa` é o mesmo fato construído a partir dos campos
 * da organização (`sinalApollo`) — na ficha do workspace ele aparece como "Sobre a empresa", nunca como
 * sinal (que exige data e fonte, regra do workspace). Lança ErroApollo em falha; o pipeline tenta
 * as fontes de pesquisa conectadas quando a Apollo falha ou não traz contatos.
 */
export async function buscarPessoasDaEmpresa(nomeEmpresa: string, quantidade: number): Promise<{ pessoas: PessoaDaEmpresa[]; sobreEmpresa: string | null }> {
  let r: Response;
  try {
    r = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", "x-api-key": getConfig("APOLLO_API_KEY") || "" },
      body: JSON.stringify({
        q_organization_name: nomeEmpresa,
        person_titles: CARGOS_DECISAO_EMPRESA,
        per_page: quantidade,
      }),
    });
  } catch (err) {
    console.error("Falha de rede ao buscar pessoas da empresa via Apollo:", err);
    throw new ErroApollo("servico_fora", "A busca de leads não respondeu; tente de novo em um minuto.", 502);
  }
  if (!r.ok) {
    throw interpretarFalhaApollo(r.status, await r.text().catch(() => ""));
  }
  const data = await r.json();
  const pessoas: ApolloPessoa[] = Array.isArray(data?.people) ? data.people : [];
  const organizacao = pessoas[0]?.organization;
  return {
    pessoas: pessoas.slice(0, quantidade).map((p) => ({ nome: p.name || "", cargo: p.title || null, linkedin: p.linkedin_url || null })),
    sobreEmpresa: organizacao ? sinalApollo(organizacao) : null,
  };
}
