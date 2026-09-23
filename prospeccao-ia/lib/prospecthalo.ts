// Contrato: https://app.prospecthalo.ai/api/agent/v1/openapi.json (21/09/2026).
// Somente descoberta e consulta: não cria agentes, listas, campanhas nem envia mensagens.
import { chamar, conectar, ErroMCP, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./brightdata-http";
import { createHash } from "node:crypto";
import { abrirBanco, getConfig } from "./store";
import { concluirConsulta, limiteDaFonte, registrarConsulta } from "./pesquisa-registro";
import type { Lead } from "./types";

export const PROSPECTHALO_MCP = "https://app.prospecthalo.ai/api/agent/v1/mcp";
const ACOES = new Set(["prospecthalo_get_context", "prospecthalo_get_stats", "prospecthalo_get_icp", "prospecthalo_list_linkedin_accounts", "prospecthalo_find_leads", "prospecthalo_list_searches", "prospecthalo_get_search_results", "prospecthalo_list_leads", "prospecthalo_get_lead"]);
let clienteAtual: { chave: string; conexao: ConexaoMCP; catalogo?: Promise<FerramentaMCP[]>; expira: number } | undefined;

/** Aceita a chave ou o link oficial colado; a chave nunca segue na URL das requisições. */
function chaveDe(valor = getConfig("PROSPECTHALO_API_KEY")): string {
  const chave = valor?.trim() || "";
  if (!/^https?:/i.test(chave)) return chave;
  try { const u = new URL(chave); if (`${u.origin}${u.pathname}` === PROSPECTHALO_MCP) return u.searchParams.get("key")?.trim() || ""; } catch { /* Mensagem neutra abaixo. */ }
  throw new ErroProspectHalo("chave_recusada", "Informe uma chave ou o link de conexão oficial do ProspectHalo.", 400);
}
function cliente(chave?: string) {
  const token = chaveDe(chave);
  if (!token) throw new ErroProspectHalo("chave_recusada", "Conecte o ProspectHalo em Configurações para buscar contatos.", 400);
  if (!clienteAtual || clienteAtual.chave !== token) clienteAtual = { chave: token, conexao: conectar(PROSPECTHALO_MCP, token), expira: 0 };
  return clienteAtual;
}
function traduzirErro(erro: unknown): ErroProspectHalo {
  if (erro instanceof ErroProspectHalo) return erro;
  if (erro instanceof ErroMCP) {
    if ([401, 403].includes(erro.status) || /unauthorized|invalid.*(?:token|key)|authentication/i.test(erro.detalhe)) return new ErroProspectHalo("chave_recusada", "O ProspectHalo recusou a chave. Confira a conexão em Configurações.", 401);
    if ([402, 429].includes(erro.status) || /quota|credit|balance|rate.?limit|payment/i.test(erro.detalhe)) return new ErroProspectHalo("limite_do_plano", "O ProspectHalo atingiu o limite de uso ou saldo da conta.", 429);
  }
  return new ErroProspectHalo("servico_fora", "O ProspectHalo não completou a consulta. Confira a conexão, os critérios e a conta LinkedIn vinculada.");
}
export async function listarAcoesProspectHalo(chave?: string): Promise<FerramentaMCP[]> {
  try {
    const c = cliente(chave);
    if (!c.catalogo || Date.now() > c.expira) {
      c.expira = Date.now() + 15 * 60_000;
      c.catalogo = listarFerramentas(c.conexao).then(acoes => acoes.filter(a => ACOES.has(a.nome)));
      void c.catalogo.catch(() => { c.catalogo = undefined; });
    }
    return await c.catalogo;
  } catch (erro) { throw traduzirErro(erro); }
}
export const prospectHaloAtivo = () => Boolean(getConfig("PROSPECTHALO_API_KEY")?.trim());
export class ErroProspectHalo extends Error {
  acao = { rotulo: "Conferir ProspectHalo", url: "/setup#prospecthalo" };
  constructor(public codigo: string, mensagem: string, public status = 502) { super(mensagem); }
}
const objeto = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const texto = (...valores: unknown[]): string => valores.find(v => typeof v === "string" && v.trim())?.toString().trim() || "";

function desembrulhar(valor: unknown): Record<string, unknown> {
  const d = objeto(valor);
  if (!Object.keys(d).length || d.error || d.isError || d.success === false || /^(failed|error|cancelled)$/.test(texto(d.status))) throw new ErroProspectHalo("resposta_invalida", "O ProspectHalo não conseguiu concluir a consulta. Confira a conexão e o saldo da conta.");
  if (d.structuredContent) return desembrulhar(d.structuredContent);
  if (Array.isArray(d.content)) {
    const bloco = d.content.find(c => c?.type === "text" && typeof c.text === "string");
    try { return desembrulhar(JSON.parse(bloco?.text)); } catch { throw new ErroProspectHalo("resposta_invalida", "O ProspectHalo devolveu uma resposta que não foi possível ler."); }
  }
  if (d.data && !Array.isArray(d.data)) return { ...d, ...desembrulhar(d.data) };
  if (d.result && !Array.isArray(d.result)) return { ...d, ...desembrulhar(d.result) };
  return d;
}

export async function consultarProspectHalo(acao: string, argumentos: Record<string, unknown>, prospeccaoId?: string, chave = getConfig("PROSPECTHALO_API_KEY")) {
  if (!ACOES.has(acao)) throw new ErroProspectHalo("acao_nao_permitida", "Esta ação não faz parte da coleta e qualificação de contatos.", 400);
  const limite = limiteDaFonte(prospeccaoId, "prospecthalo");
  const registro = registrarConsulta(prospeccaoId, "prospecthalo", acao, String(argumentos.keywords ?? argumentos.searchId ?? "Conexão"));
  if (limite) {
    concluirConsulta(registro, "limite", 0, "Limite de consultas do ProspectHalo nesta prospecção atingido.");
    throw new ErroProspectHalo("limite_do_plano", "Limite de consultas do ProspectHalo nesta prospecção atingido.", 429);
  }
  try {
    const c = cliente(chave);
    const catalogo = await listarAcoesProspectHalo(chave);
    if (!catalogo.some(f => f.nome === acao)) throw new ErroProspectHalo("acao_indisponivel", "Esta consulta não está disponível na conexão do ProspectHalo.");
    const dados = desembrulhar(await chamar(c.conexao, acao, argumentos));
    const quantidade = listaResultados(dados)?.length ?? 0;
    concluirConsulta(registro, pendente(dados) ? "pendente" : quantidade || acao === "prospecthalo_get_context" ? "concluida" : "vazia", quantidade,
      pendente(dados) ? "O ProspectHalo ainda está qualificando os candidatos. Uma nova consulta com os mesmos critérios recupera esta busca, sem iniciá-la novamente." : undefined);
    return dados;
  } catch (erro) {
    const falha = traduzirErro(erro);
    concluirConsulta(registro, "falhou", 0, falha.message);
    throw falha;
  }
}
function listaResultados(d: Record<string, unknown>): unknown[] | undefined {
  for (const chave of ["results", "leads", "profiles", "people", "items", "data"]) if (Array.isArray(d[chave])) return d[chave] as unknown[];
}
function pendente(d: Record<string, unknown>): boolean {
  return [d.status, d.progressStatus, objeto(d.search).status].some(v => /^(qualifying|pending|running|processing|waiting|queued)(?:$|_)/.test(texto(v)));
}
function urlPublica(valor: unknown, linkedin = false): string {
  try {
    const u = new URL(texto(valor));
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) return "";
    if (linkedin && (!(u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")) || !/^\/in\/[^/]+/.test(u.pathname))) return "";
    u.hash = "";
    if (linkedin) { u.hostname = "www.linkedin.com"; u.search = ""; u.pathname = u.pathname.replace(/\/$/, ""); }
    return u.href;
  } catch { return ""; }
}

/** Nenhum campo é completado com os filtros pedidos. Só dados devolvidos pelo fornecedor. */
export function normalizarLeadsProspectHalo(dados: Record<string, unknown>): Lead[] {
  const lista = listaResultados(dados);
  if (!lista) {
    if (pendente(dados)) return [];
    throw new ErroProspectHalo("resposta_invalida", "O ProspectHalo devolveu resultados em formato inesperado.");
  }
  const vistos = new Set<string>();
  const leads = lista.flatMap(valor => {
    const r = objeto(valor), p = Object.keys(objeto(r.profile)).length ? objeto(r.profile) : r;
    if (/rejected|deferred|unqualified|pending/i.test(texto(r.qualificationStatus, r.status)) || r.qualified === false) return [];
    const empresa = objeto(p.company ?? p.currentCompany ?? p.organization);
    const nome = texto(p.name, p.fullName, p.full_name) || [texto(p.firstName, p.first_name), texto(p.lastName, p.last_name)].filter(Boolean).join(" ");
    const linkedin = urlPublica(p.linkedinUrl ?? p.linkedin_url ?? p.profileUrl ?? p.profile_url ?? p.url, true);
    if (!nome || !linkedin || vistos.has(linkedin)) return [];
    vistos.add(linkedin);
    return [{ id: texto(r.id, p.id) || createHash("sha256").update(linkedin).digest("hex").slice(0, 20), nome,
      cargo: texto(p.jobTitle, p.job_title, p.title, p.position, p.occupation, p.headline), empresa: texto(empresa.name, p.companyName, p.company_name, p.company),
      setor: texto(empresa.industry, p.industry), porte: texto(empresa.employeeCount, empresa.headcount, p.companySize), cidade: texto(p.location, p.city), linkedin,
      site: urlPublica(empresa.website ?? empresa.websiteUrl ?? p.companyWebsite), sinal: texto(p.summary, p.about, empresa.description) }];
  });
  // Uma lista de candidatos adiados pode estar legitimamente sem aprovados.
  if (lista.length && !leads.length && !lista.every(v => /rejected|deferred|unqualified|pending/i.test(texto(objeto(v).qualificationStatus, objeto(v).status)) || objeto(v).qualified === false)) {
    throw new ErroProspectHalo("resposta_invalida", "O ProspectHalo não trouxe perfis identificáveis nos resultados.");
  }
  return leads;
}
export type CriteriosProspectHalo = { cargo?: string; segmento?: string; localizacao?: string; porte?: string; empresa?: string; outros?: string; proposta?: string; quantidade?: number };
export function argumentosProspectHalo(c: CriteriosProspectHalo): Record<string, unknown> {
  const regras = [c.cargo && `Cargo: ${c.cargo}`, c.empresa && `Empresa atual: ${c.empresa}`, c.segmento && `Setor da empresa: ${c.segmento}`, c.localizacao && `Localização: ${c.localizacao}`, c.porte && `Porte obrigatório: ${c.porte}`, c.outros].filter(Boolean);
  if (!regras.length) throw new ErroProspectHalo("criterios_invalidos", "Informe quem deseja encontrar antes de buscar no ProspectHalo.", 400);
  return { keywords: [c.cargo, c.empresa, c.segmento, c.localizacao].filter(Boolean).join(" ") || c.outros,
    idealCustomer: regras.join(". "), maxResults: Math.max(1, Math.min(100, Math.floor(c.quantidade || 10))),
    ...(c.cargo ? { targetTitles: [c.cargo] } : {}), ...(c.segmento ? { targetCompanyCategories: [c.segmento] } : {}),
    ...(c.localizacao ? { targetLocations: [c.localizacao] } : {}), ...(c.proposta ? { offerContext: c.proposta } : {}),
    // Porte fica como regra explícita; não presume Sales Navigator nem altera o intervalo pedido.
    ...([c.empresa && `Empresa atual: ${c.empresa}`, c.porte && `Porte: ${c.porte}`, c.outros].some(Boolean) ? { requiredCriteria: [c.empresa && `Empresa atual: ${c.empresa}`, c.porte && `Porte: ${c.porte}`, c.outros].filter(Boolean).join(". ") } : {}),
  };
}
const ativas = new Map<string, Promise<Record<string, unknown>>>();
export async function buscarProspectHalo(criterios: CriteriosProspectHalo, prospeccaoId?: string): Promise<Lead[]> {
  return normalizarLeadsProspectHalo(await buscarComArgumentos(argumentosProspectHalo(criterios), prospeccaoId));
}
export async function executarAcaoProspectHalo(acao: string, args: Record<string, unknown>, prospeccaoId?: string) {
  if (acao === "prospecthalo_find_leads") return buscarComArgumentos(args, prospeccaoId);
  return consultarProspectHalo(acao, args, prospeccaoId);
}
async function buscarComArgumentos(args: Record<string, unknown>, prospeccaoId?: string): Promise<Record<string, unknown>> {
  if (!texto(args.idealCustomer) || (!texto(args.keywords) && !texto(args.url))) throw new ErroProspectHalo("criterios_invalidos", "Informe o perfil ideal e uma consulta ou busca LinkedIn.", 400);
  if (!Number.isInteger(args.maxResults) || Number(args.maxResults) < 1 || Number(args.maxResults) > 100) throw new ErroProspectHalo("criterios_invalidos", "Informe a quantidade de candidatos para pesquisar (1 a 100).", 400);
  const chave = createHash("sha256").update(JSON.stringify([chaveDe(), Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b)))])).digest("hex");
  const ativa = ativas.get(chave);
  if (ativa) return ativa;
  const promessa = executarBusca(chave, args, prospeccaoId);
  ativas.set(chave, promessa);
  try { return await promessa; } finally { ativas.delete(chave); }
}
async function executarBusca(chave: string, args: Record<string, unknown>, prospeccaoId?: string): Promise<Record<string, unknown>> {
  const db = abrirBanco();
  db.exec("CREATE TABLE IF NOT EXISTS prospecthalo_buscas (chave TEXT PRIMARY KEY, search_id TEXT NOT NULL, pendente INTEGER NOT NULL, proxima_consulta TEXT)");
  const anterior = db.prepare("SELECT search_id, proxima_consulta FROM prospecthalo_buscas WHERE chave = ? AND pendente = 1").get(chave) as { search_id: string; proxima_consulta: string | null } | undefined;
  if (anterior?.proxima_consulta && Date.parse(anterior.proxima_consulta) > Date.now()) {
    const registro = registrarConsulta(prospeccaoId, "prospecthalo", "prospecthalo_get_search_results", anterior.search_id);
    concluirConsulta(registro, "pendente", 0, "O ProspectHalo pediu mais tempo para qualificar esta busca. Tente consultar novamente mais tarde.");
    return { searchId: anterior.search_id, status: "qualifying", nextRetryAt: anterior.proxima_consulta, results: [] };
  }
  let dados = anterior
    ? await consultarProspectHalo("prospecthalo_get_search_results", { searchId: anterior.search_id, limit: args.maxResults }, prospeccaoId)
    : await consultarProspectHalo("prospecthalo_find_leads", args, prospeccaoId);
  const searchId = texto(dados.searchId, objeto(dados.search).id, anterior?.search_id);
  if (pendente(dados) && !searchId) throw new ErroProspectHalo("resposta_invalida", "O ProspectHalo iniciou a qualificação, mas não devolveu o identificador da busca.");
  if (searchId) db.prepare("INSERT INTO prospecthalo_buscas VALUES (?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET search_id = excluded.search_id, pendente = excluded.pendente, proxima_consulta = excluded.proxima_consulta").run(chave, searchId, Number(pendente(dados) || !listaResultados(dados)), texto(dados.nextRetryAt) || null);
  if (searchId && !anterior && !listaResultados(dados) && (!dados.nextRetryAt || Date.parse(texto(dados.nextRetryAt)) <= Date.now())) {
    dados = await consultarProspectHalo("prospecthalo_get_search_results", { searchId, limit: args.maxResults }, prospeccaoId);
    db.prepare("UPDATE prospecthalo_buscas SET pendente = ?, proxima_consulta = ? WHERE chave = ?").run(Number(pendente(dados)), texto(dados.nextRetryAt) || null, chave);
  }
  if (!pendente(dados) && prospeccaoId) {
    db.prepare("UPDATE pesquisa_consultas SET estado = ?, quantidade = ?, mensagem = NULL WHERE prospeccao_id = ? AND fonte = 'prospecthalo' AND estado = 'pendente' AND consulta IN (?, ?)")
      .run(listaResultados(dados)?.length ? "concluida" : "vazia", listaResultados(dados)?.length ?? 0, prospeccaoId, String(args.keywords ?? args.url ?? "").slice(0, 500), searchId);
  }
  return dados;
}

export async function testarProspectHalo(config: Record<string, string | undefined>) {
  try { const acoes = await listarAcoesProspectHalo(config.PROSPECTHALO_API_KEY); if (!["prospecthalo_find_leads", "prospecthalo_get_search_results"].every(nome => acoes.some(a => a.nome === nome))) throw new ErroProspectHalo("acao_indisponivel", "A conexão não disponibilizou as ferramentas de busca e acompanhamento de leads."); await consultarProspectHalo("prospecthalo_get_context", {}, undefined, config.PROSPECTHALO_API_KEY); return { ok: true, mensagem: "ProspectHalo conectado via MCP. A busca usa a conta LinkedIn vinculada e a cota do seu plano." }; }
  catch (erro) { return { ok: false, mensagem: erro instanceof ErroProspectHalo ? erro.message : "Não foi possível testar o ProspectHalo." }; }
}
