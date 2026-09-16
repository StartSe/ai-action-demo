// Cliente do Prospect Halo (servidor MCP remoto, autorizado no cartão "Prospect Halo" do /setup):
// busca leads no LinkedIn do usuário, cria a campanha de envio e consulta o andamento. Os nomes
// reais das ferramentas do lado de lá não são conhecidos de antemão: são listados em tempo de
// execução e escolhidos por palavras-chave no nome/descrição (mesmo método de
// prospeccao-ia/lib/crm-mcp.ts); as três listas em "Opções avançadas" do cartão (uma por operação,
// lib/integracoes.ts) permitem corrigir uma escolha errada sem editar JSON.
import { separar } from "./demo";
import { mapeamentoManual, PREFIXO_PROSPECTHALO, PROSPECTHALO, type OperacaoProspectHalo } from "./integracoes";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, lerConfig } from "./setup-comum";
import { SINAIS_INTENCAO, type Campanha, type Lead, type Perfil, type Sequencia } from "./types";

export type { OperacaoProspectHalo };

/** Ação padrão das falhas que a pessoa resolve no cartão do Prospect Halo em /setup. */
export const ACAO_PROSPECTHALO = { rotulo: "Abrir o Prospect Halo em Configurações", url: "/setup#prospecthalo" };

/**
 * Falha ao falar com o Prospect Halo. `status` diz de quem é a vez: 400 (falta conectar ou escolher a
 * ferramenta), 401 (autorização vencida ou revogada), 404 (nenhum lead), 502/503/504 (serviço remoto).
 * As rotas respondem com esse status e { error, acao }, nunca com o corpo cru do serviço.
 */
export class ErroProspectHalo extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, opcoes: { status?: number; acao?: { rotulo: string; url: string } } = {}) {
    super(mensagem);
    this.name = "ErroProspectHalo";
    this.status = opcoes.status ?? 502;
    this.acao = opcoes.acao;
  }
}

/** Palavras procuradas no nome + descrição de cada ferramenta remota para identificar o papel dela. */
export const PALAVRAS_CHAVE: Record<OperacaoProspectHalo, string[]> = {
  buscar: ["lead", "prospect", "search", "find"],
  campanha: ["campaign", "agent", "outreach", "create"],
  estado: ["status", "performance"],
};

const ROTULO_OPERACAO: Record<OperacaoProspectHalo, string> = {
  buscar: "buscar leads",
  campanha: "criar a campanha",
  estado: "consultar o andamento",
};

/** Quanto esperar por uma resposta do Prospect Halo antes de avisar que ele demorou demais (o cliente MCP compartilhado não tem limite próprio). */
export const TEMPO_LIMITE_MS = 45_000;

async function comTempoLimite<T>(promessa: Promise<T>, op: OperacaoProspectHalo): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new ErroProspectHalo(`O Prospect Halo demorou demais para ${ROTULO_OPERACAO[op]}. Tente de novo em um minuto.`, { status: 504 })), TEMPO_LIMITE_MS);
  });
  try {
    return await Promise.race([promessa, limite]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Traduz a falha genérica do cliente MCP compartilhado (lib/mcp-cliente.ts, que fala de "serviço" e
 * "código de acesso") para a situação do Prospect Halo, com o status e a ação certos. O cliente não
 * expõe o status HTTP: uma resposta 401/403 chega como "não respondeu corretamente"/"formato esperado"
 * (corpo fora do JSON-RPC), e um erro JSON-RPC (ferramenta recusou os argumentos) como "recusou a chamada".
 */
export function traduzirFalha(err: unknown, op: OperacaoProspectHalo): ErroProspectHalo {
  if (err instanceof ErroProspectHalo) return err;
  const mensagem = err instanceof Error ? err.message : "";
  const rotulo = ROTULO_OPERACAO[op];
  if (/Não foi possível falar com o serviço/.test(mensagem)) {
    return new ErroProspectHalo("Não foi possível falar com o Prospect Halo agora. Confira a conexão do servidor e tente de novo em um minuto.", { status: 503 });
  }
  if (/não respondeu corretamente|formato esperado/.test(mensagem)) {
    return new ErroProspectHalo("O Prospect Halo não aceitou a autorização deste app: ela pode ter expirado ou sido revogada. Autorize de novo em Configurações.", { status: 401, acao: ACAO_PROSPECTHALO });
  }
  if (/recusou a chamada/.test(mensagem)) {
    return new ErroProspectHalo(`O Prospect Halo recusou o pedido para ${rotulo}. Tente de novo; se continuar, escolha a ferramenta certa em Opções avançadas do cartão Prospect Halo.`, { status: 502, acao: ACAO_PROSPECTHALO });
  }
  console.error(`Prospect Halo (${op}):`, err);
  return new ErroProspectHalo(`O Prospect Halo não conseguiu ${rotulo} agora. Tente de novo em um minuto.`, { status: 502 });
}

/** Quantos leads pedir ao Prospect Halo por busca. */
export const LIMITE_LEADS = 20;

export function prospectHaloConfigurado(): boolean {
  return integracaoConfigurada(PROSPECTHALO);
}

/** Conexão pronta: token do fluxo OAuth (renovado quando preciso) ou código colado à mão, com o endereço padrão quando nenhum foi salvo. */
async function conexaoAtual(): Promise<ConexaoMCP> {
  const autorizada = await conexaoAutorizada(PREFIXO_PROSPECTHALO);
  if (autorizada) return conectar(autorizada.url, autorizada.token);
  const config = lerConfig(PROSPECTHALO);
  const url = config[`${PREFIXO_PROSPECTHALO}_URL`];
  const codigo = config[`${PREFIXO_PROSPECTHALO}_CODIGO`];
  if (!url || !codigo) throw new ErroProspectHalo("Conecte o Prospect Halo em Configurações para buscar no seu LinkedIn e enviar as mensagens aprovadas.", { status: 400, acao: ACAO_PROSPECTHALO });
  return conectar(url, codigo);
}

function pontuar(f: FerramentaMCP, op: OperacaoProspectHalo): number {
  const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
  return PALAVRAS_CHAVE[op].filter((p) => alvo.includes(p)).length;
}

/**
 * Escolhe, entre as ferramentas remotas, a que cumpre a operação: primeiro a escolha manual (lista em
 * "Opções avançadas"), depois a que junta mais palavras-chave no nome/descrição. Exportada para testes
 * e para o teste de conexão.
 */
export function escolherFerramenta(op: OperacaoProspectHalo, ferramentas: FerramentaMCP[], manual: Partial<Record<OperacaoProspectHalo, string>> = mapeamentoManual()): FerramentaMCP | null {
  const nomeManual = manual[op];
  if (nomeManual) {
    const f = ferramentas.find((x) => x.nome === nomeManual);
    if (f) return f;
    throw new ErroProspectHalo(`A ferramenta escolhida para ${ROTULO_OPERACAO[op]} não existe mais no Prospect Halo. Volte para "Identificar sozinho" ou escolha outra em Opções avançadas do cartão Prospect Halo.`, { status: 400, acao: ACAO_PROSPECTHALO });
  }
  let melhor: FerramentaMCP | null = null;
  let melhorPontos = 0;
  for (const f of ferramentas) {
    const pontos = pontuar(f, op);
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = f;
    }
  }
  return melhor;
}

async function ferramentaPara(op: OperacaoProspectHalo, conexao: ConexaoMCP): Promise<FerramentaMCP> {
  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await comTempoLimite(listarFerramentas(conexao), op);
  } catch (err) {
    throw traduzirFalha(err, op);
  }
  const f = escolherFerramenta(op, ferramentas);
  if (!f) {
    throw new ErroProspectHalo(`O Prospect Halo não oferece uma ferramenta reconhecível para ${ROTULO_OPERACAO[op]}. Escolha a ferramenta certa em Opções avançadas do cartão Prospect Halo.`, { status: 400, acao: ACAO_PROSPECTHALO });
  }
  return f;
}

type Propriedade = { type?: string | string[]; items?: { type?: string } };
type SchemaObjeto = { properties?: Record<string, Propriedade> };
export type Candidato = string | number | boolean | string[] | Record<string, unknown>[] | undefined;

function tipoDe(p: Propriedade): string {
  return Array.isArray(p.type) ? p.type.find((t) => t !== "null") || "" : p.type || "";
}

/** Ajusta o valor ao tipo declarado na propriedade remota (texto com vírgulas vira lista, lista vira texto, texto vira número). */
function ajustarTipo(valor: Exclude<Candidato, undefined>, p: Propriedade): unknown {
  const tipo = tipoDe(p);
  if (tipo === "array") {
    if (Array.isArray(valor)) return valor;
    return separar(String(valor));
  }
  if (tipo === "string") {
    if (Array.isArray(valor)) return valor.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
    return String(valor);
  }
  if (tipo === "number" || tipo === "integer") {
    const n = Number(Array.isArray(valor) ? valor.length : valor);
    return Number.isFinite(n) ? n : undefined;
  }
  if (tipo === "boolean") return Boolean(valor);
  return valor;
}

/**
 * Casa as propriedades do schema da ferramenta remota com os candidatos: para cada propriedade,
 * o primeiro padrão (regex, sem diferenciar maiúsculas) que bate com o nome dela fornece o valor,
 * ajustado ao tipo declarado. Propriedades sem candidato ficam de fora.
 */
export function montarArgumentos(schema: unknown, candidatos: Record<string, Candidato>): Record<string, unknown> {
  const propriedades = (schema && typeof schema === "object" ? (schema as SchemaObjeto).properties : undefined) || {};
  const args: Record<string, unknown> = {};
  for (const [chave, propriedade] of Object.entries(propriedades)) {
    for (const [padrao, valor] of Object.entries(candidatos)) {
      if (valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) continue;
      if (new RegExp(padrao, "i").test(chave)) {
        const ajustado = ajustarTipo(valor, propriedade || {});
        if (ajustado !== undefined) args[chave] = ajustado;
        break;
      }
    }
  }
  return args;
}

type Bruto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Bruto {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Primeiro valor de texto encontrado entre as chaves candidatas (aceita objeto com name/nome e lista de textos). */
function texto(item: Bruto, chaves: string[]): string {
  for (const chave of chaves) {
    const v = item[chave];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) return (v as string[]).join("; ");
    if (ehObjeto(v)) {
      const interno = texto(v, ["name", "nome", "title", "titulo", "text", "label"]);
      if (interno) return interno;
    }
  }
  return "";
}

function numero(item: Bruto, chaves: string[]): number | undefined {
  for (const chave of chaves) {
    const v = item[chave];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Encontra a lista de leads na resposta remota: a própria resposta, ou as chaves leads/prospects/results/data/items (um nível de profundidade). */
function encontrarLista(resposta: unknown): unknown[] | null {
  if (Array.isArray(resposta)) return resposta;
  if (!ehObjeto(resposta)) return null;
  for (const chave of ["leads", "prospects", "results", "data", "items", "profiles"]) {
    const v = resposta[chave];
    if (Array.isArray(v)) return v;
  }
  for (const chave of ["data", "result", "results"]) {
    const v = resposta[chave];
    if (ehObjeto(v)) {
      const interna = encontrarLista(v);
      if (interna) return interna;
    }
  }
  return null;
}

/** Converte a resposta do Prospect Halo (formato do servidor remoto, não padronizado) em Lead[] deste app. */
export function normalizarLeads(resposta: unknown): Lead[] {
  const lista = encontrarLista(resposta);
  if (!lista) throw new ErroProspectHalo("O Prospect Halo respondeu num formato que este app não reconhece. Escolha a ferramenta certa para buscar leads em Opções avançadas do cartão Prospect Halo.", { status: 502, acao: ACAO_PROSPECTHALO });
  const leads: Lead[] = [];
  lista.forEach((bruto, i) => {
    if (!ehObjeto(bruto)) return;
    const nome = texto(bruto, ["nome", "name", "full_name", "fullName"]) || [texto(bruto, ["first_name", "firstName"]), texto(bruto, ["last_name", "lastName"])].filter(Boolean).join(" ");
    if (!nome) return;
    const pontos = numero(bruto, ["pontuacao", "score", "match_score", "matchScore", "fit_score", "relevance", "confidence"]);
    const pontuacao = pontos === undefined ? 60 : Math.round(Math.max(0, Math.min(100, pontos <= 1 ? pontos * 100 : pontos)));
    leads.push({
      id: texto(bruto, ["id", "lead_id", "leadId", "prospect_id", "prospectId", "linkedin_id", "urn"]) || `ph-${i + 1}`,
      nome,
      cargo: texto(bruto, ["cargo", "title", "job_title", "jobTitle", "position", "role", "headline"]),
      empresa: texto(bruto, ["empresa", "company", "company_name", "companyName", "organization", "org"]),
      setor: texto(bruto, ["setor", "industry", "sector", "segment"]),
      linkedinUrl: texto(bruto, ["linkedinUrl", "linkedin_url", "linkedin", "profile_url", "profileUrl", "url", "link"]),
      sinal: texto(bruto, ["sinal", "signal", "intent", "intent_signal", "intentSignal", "trigger", "reason", "insight", "why", "summary", "note"]),
      pontuacao,
      origem: "prospecthalo",
    });
  });
  return leads;
}

/** Busca no Prospect Halo os leads que combinam com o perfil. Lança ErroProspectHalo. */
export async function buscarLeadsProspectHalo(perfil: Perfil): Promise<Lead[]> {
  const conexao = await conexaoAtual();
  const ferramenta = await ferramentaPara("buscar", conexao);
  const sinais = perfil.sinais.map((s) => SINAIS_INTENCAO.find((x) => x.valor === s)?.rotulo ?? s);
  // Ordem importa: o primeiro padrão que casa vence, então os mais específicos vêm antes
  // ("value_proposition" precisa cair em proposta, não em cargo por causa de "position").
  const args = montarArgumentos(ferramenta.schema, {
    "proposta|pitch|offer|proposition|value_prop|valueProp|product|descri": perfil.proposta,
    "cargo|title|role|job|^positions?$": perfil.cargos,
    "setor|industr|sector|segment": perfil.setores,
    "sinal|signal|intent|trigger": sinais,
    "keyword|query|search|^q$|term": `${perfil.cargos}, ${perfil.setores}`,
    "limit|max|count|quant|size|top": LIMITE_LEADS,
  });
  let resposta: unknown;
  try {
    resposta = await comTempoLimite(chamar(conexao, ferramenta.nome, args), "buscar");
  } catch (err) {
    throw traduzirFalha(err, "buscar");
  }
  const leads = normalizarLeads(resposta);
  if (leads.length === 0) throw new ErroProspectHalo("O Prospect Halo não encontrou leads para esse perfil. Amplie os cargos ou os setores e tente de novo.", { status: 404 });
  return leads;
}

/** Identificador da campanha criada, procurado nas chaves mais comuns (um nível de profundidade). */
function encontrarId(resposta: unknown): string | undefined {
  if (typeof resposta === "string" && resposta.trim() && !/\s/.test(resposta.trim()) && resposta.length <= 80) return resposta.trim();
  if (!ehObjeto(resposta)) return undefined;
  const direto = texto(resposta, ["campaign_id", "campaignId", "agent_id", "agentId", "id", "externoId"]);
  if (direto) return direto;
  for (const chave of ["campaign", "agent", "data", "result"]) {
    const v = resposta[chave];
    if (ehObjeto(v)) {
      const interno = texto(v, ["campaign_id", "campaignId", "agent_id", "agentId", "id"]);
      if (interno) return interno;
    }
  }
  return undefined;
}

/** Lead com a sequência dele, no formato enviado ao Prospect Halo quando a ferramenta aceita uma lista de objetos. */
function leadParaEnvio(lead: Lead, s: Sequencia): Record<string, unknown> {
  return {
    id: lead.id,
    name: lead.nome,
    title: lead.cargo,
    company: lead.empresa,
    linkedin_url: lead.linkedinUrl,
    connection_message: s.conexao,
    follow_up_1: s.acompanhamento1,
    follow_up_2: s.acompanhamento2,
    ...(s.email ? { email_subject: s.email.assunto, email_body: s.email.corpo } : {}),
  };
}

/**
 * Cria a campanha no Prospect Halo com os leads que já têm sequência escrita. Devolve o id remoto
 * (ou undefined quando o servidor não devolve um identificador reconhecível). Lança ErroProspectHalo.
 */
export async function criarCampanhaProspectHalo(campanha: Campanha, perfil: Perfil, modelo: Sequencia): Promise<{ externoId?: string; ferramenta: string }> {
  const conexao = await conexaoAtual();
  const ferramenta = await ferramentaPara("campanha", conexao);
  const sequenciaPor = new Map(campanha.sequencias.map((s) => [s.leadId, s]));
  const leads = campanha.leads.filter((l) => sequenciaPor.has(l.id));
  const args = montarArgumentos(ferramenta.schema, {
    "lead_?ids|prospect_?ids|^ids$": leads.map((l) => l.id),
    "linkedin_?urls|profile_?urls|^urls$": leads.map((l) => l.linkedinUrl).filter(Boolean),
    "leads|prospects|profiles|contacts|recipients|targets": leads.map((l) => leadParaEnvio(l, sequenciaPor.get(l.id)!)),
    "^(nome|name|title|campaign_?name)$": campanha.nome,
    "connection|invit|conex|first_?message|message_?1$|opener": modelo.conexao,
    "follow_?up_?1|second|message_?2$": modelo.acompanhamento1,
    "follow_?up_?2|third|message_?3$": modelo.acompanhamento2,
    "^messages$|sequence|steps|templates": [modelo.conexao, modelo.acompanhamento1, modelo.acompanhamento2],
    "email_?subject|subject": modelo.email?.assunto,
    "email_?body|^email$": modelo.email?.corpo,
    "descri|note|goal|objective|pitch|proposta|context": perfil.proposta,
    "tone|tom": perfil.tom,
  });
  let resposta: unknown;
  try {
    resposta = await comTempoLimite(chamar(conexao, ferramenta.nome, args), "campanha");
  } catch (err) {
    throw traduzirFalha(err, "campanha");
  }
  return { externoId: encontrarId(resposta), ferramenta: ferramenta.nome };
}

function humanizar(chave: string) {
  const s = chave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resume a resposta de estado (formato do servidor remoto) num texto legível: os campos simples, um por linha. */
export function resumirEstado(resposta: unknown): string {
  if (typeof resposta === "string") return resposta.trim() || "Sem informações.";
  if (!ehObjeto(resposta)) return "Sem informações.";
  const alvo = ehObjeto(resposta.campaign) ? resposta.campaign : ehObjeto(resposta.data) ? resposta.data : resposta;
  const linhas = Object.entries(alvo)
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .slice(0, 12)
    .map(([k, v]) => `${humanizar(k)}: ${typeof v === "boolean" ? (v ? "sim" : "não") : String(v)}`);
  return linhas.length > 0 ? linhas.join("\n") : "Sem informações.";
}

/** Consulta o andamento da campanha no Prospect Halo. Lança ErroProspectHalo. */
export async function consultarEstadoProspectHalo(externoId: string): Promise<{ texto: string; bruto: unknown }> {
  const conexao = await conexaoAtual();
  const ferramenta = await ferramentaPara("estado", conexao);
  const args = montarArgumentos(ferramenta.schema, { "campaign_?id|agent_?id|^id$|campaign|agent": externoId });
  try {
    const bruto = await comTempoLimite(chamar(conexao, ferramenta.nome, args), "estado");
    return { texto: resumirEstado(bruto), bruto };
  } catch (err) {
    throw traduzirFalha(err, "estado");
  }
}
