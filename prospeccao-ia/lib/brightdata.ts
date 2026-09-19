import { chamar, conectar, ErroMCP, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./brightdata-http";
import { getConfig } from "./store";

let atual: { chave: string; conexao: ConexaoMCP; catalogo?: Promise<FerramentaMCP[]>; expira: number } | undefined;

/** Mantém a chave já salva no setup. O MCP gerencia as zonas da conta. */
export function brightDataAtiva(): boolean {
  return Boolean(getConfig("BRIGHTDATA_API_KEY")?.trim());
}

function cliente(chave = getConfig("BRIGHTDATA_API_KEY")) {
  chave = chave?.trim();
  if (!chave) throw new Error("Conecte a pesquisa de mercado em Configurações.");
  if (!atual || atual.chave !== chave) {
    const url = new URL("https://mcp.brightdata.com/mcp");
    url.searchParams.set("token", chave);
    url.searchParams.set("pro", "1");
    atual = { chave, conexao: conectar(url.toString()), expira: 0 };
  }
  return atual;
}

/** Só ferramentas de consulta; o catálogo completo de dados públicos permanece acessível. */
function acaoDePesquisa(nome: string): boolean {
  return ["search_engine", "search_engine_batch", "scrape_as_markdown", "scrape_batch", "search_dataset", "list_dataset_fields", "discover"].includes(nome)
    || nome.startsWith("web_data_");
}

export async function listarAcoesBrightData(chave?: string): Promise<FerramentaMCP[]> {
  const c = cliente(chave);
  if (!c.catalogo || Date.now() >= c.expira) {
    c.expira = Date.now() + 15 * 60_000;
    c.catalogo = listarFerramentas(c.conexao).then(lista => lista.filter(f => acaoDePesquisa(f.nome)));
    void c.catalogo.catch(() => { c.catalogo = undefined; });
  }
  return c.catalogo;
}

export async function chamarBrightData(nome: string, argumentos: Record<string, unknown>, chave?: string): Promise<unknown> {
  if (!acaoDePesquisa(nome)) throw new Error("Esta ação não é uma consulta de dados públicos.");
  const c = cliente(chave);
  const catalogo = await listarAcoesBrightData(chave);
  if (!catalogo.some(f => f.nome === nome)) throw new Error(`A ação ${nome} não está disponível na conexão de pesquisa de mercado.`);
  // O servidor valida os argumentos usando o schema retornado em tools/list.
  return chamar(c.conexao, nome, argumentos);
}

export function mensagemFalhaBrightData(erro: unknown): string {
  if (erro instanceof ErroMCP) {
    if ([401, 403].includes(erro.status) || /unauthorized|invalid.*(?:token|key)|authentication/i.test(erro.detalhe)) {
      return "A Bright Data recusou a chave. Confira a chave e as permissões no painel da conta.";
    }
    if ([402, 429].includes(erro.status) || /quota|credit|balance|rate.?limit|payment/i.test(erro.detalhe)) {
      return "A Bright Data atingiu o limite de uso ou saldo da conta.";
    }
  }
  return "A Bright Data não completou a consulta. Confira a conexão e as permissões no painel e tente novamente.";
}

export function resultadosOrganicos(resultado: unknown): { titulo: string; url: string; resumo: string }[] {
  if (!resultado || typeof resultado !== "object" || !("organic" in resultado) || !Array.isArray(resultado.organic)) {
    throw new Error("A pesquisa retornou um formato inesperado.");
  }
  return resultado.organic.flatMap((r: unknown) => {
    if (!r || typeof r !== "object") return [];
    const item = r as Record<string, unknown>;
    const link = item.link ?? item.url;
    if (typeof link !== "string" || !/^https?:\/\//i.test(link)) return [];
    return [{ titulo: typeof item.title === "string" ? item.title : link, url: link,
      resumo: typeof item.description === "string" ? item.description : typeof item.snippet === "string" ? item.snippet : "" }];
  });
}

/** Escolhe pelo domínio e caminho, nunca por texto solto em uma URL. */
export function acaoParaUrl(url: string): string {
  const u = new URL(url);
  const dominio = u.hostname.toLowerCase().replace(/^www\./, "");
  const caminho = u.pathname;
  if (dominio === "linkedin.com" || dominio.endsWith(".linkedin.com")) {
    if (/^\/in\/[^/]+/.test(caminho)) return "web_data_linkedin_person_profile";
    if (/^\/company\/[^/]+/.test(caminho)) return "web_data_linkedin_company_profile";
    if (/^\/jobs\//.test(caminho)) return "web_data_linkedin_job_listings";
    if (/^\/(posts|pulse)\//.test(caminho)) return "web_data_linkedin_posts";
    // People Search exige nome e sobrenome: disponível no catálogo para chamada explícita.
  }
  if (dominio === "instagram.com") {
    if (/^\/p\/[^/]+/.test(caminho)) return "web_data_instagram_posts";
    if (/^\/reels?\/[^/]+/.test(caminho)) return "web_data_instagram_reels";
    if (/^\/[^/]+\/?$/.test(caminho) && !/^\/(explore|accounts|direct|stories)\/?$/.test(caminho)) return "web_data_instagram_profiles";
  }
  return "scrape_as_markdown";
}

export async function testarBrightData(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const chave = config.BRIGHTDATA_API_KEY;
  if (!chave?.trim()) return { ok: false, mensagem: "Nenhuma chave salva ainda." };
  try {
    const acoes = await listarAcoesBrightData(chave);
    const faltantes = ["search_engine", "scrape_as_markdown"].filter(nome => !acoes.some(f => f.nome === nome));
    if (faltantes.length) return { ok: false, mensagem: `A conexão não disponibilizou: ${faltantes.join(", ")}. Confira as permissões da Bright Data.` };
    const [busca, leitura] = await Promise.allSettled([
      chamarBrightData("search_engine", { query: "Bright Data", engine: "google" }, chave).then(r => {
        if (!resultadosOrganicos(r).length) throw new Error("Busca vazia.");
      }),
      chamarBrightData("scrape_as_markdown", { url: "https://example.com" }, chave).then(r => {
        if (typeof r !== "string" || !r.trim()) throw new Error("Leitura vazia.");
      }),
    ]);
    if (busca.status === "rejected" || leitura.status === "rejected") {
      return { ok: false, mensagem: `Busca: ${busca.status === "fulfilled" ? "conectada" : mensagemFalhaBrightData(busca.reason)}. Leitura: ${leitura.status === "fulfilled" ? "conectada" : mensagemFalhaBrightData(leitura.reason)}.` };
    }
    const capacidades = [
      `Datasets: ${acoes.some(f => f.nome === "search_dataset") ? "disponível" : "não disponível"}`,
      `LinkedIn: ${acoes.filter(f => f.nome.startsWith("web_data_linkedin_")).length} ações`,
      `Instagram: ${acoes.filter(f => f.nome.startsWith("web_data_instagram_")).length} ações`,
    ];
    return { ok: true, mensagem: `Conectado. Busca e leitura testadas via MCP HTTP com pro=1. ${capacidades.join("; ")}.` };
  } catch (erro) {
    return { ok: false, mensagem: mensagemFalhaBrightData(erro) };
  }
}
