// Cliente do Prospect Halo (servidor MCP remoto, autorizado no cartão "Prospect Halo" do /setup):
// busca leads no LinkedIn do usuário, cria a campanha de envio e consulta o andamento. Os nomes
// reais das ferramentas do lado de lá não são conhecidos de antemão: são listados em tempo de
// execução e escolhidos por palavras-chave no nome/descrição (mesmo método de
// prospeccao-ia/lib/crm-mcp.ts), com um mapeamento manual opcional no campo avançado
// PROSPECTHALO_FERRAMENTAS para corrigir uma escolha errada.
import { separar } from "./demo";
import { CAMPO_FERRAMENTAS, mapeamentoManual, PREFIXO_PROSPECTHALO, PROSPECTHALO } from "./integracoes";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, lerConfig } from "./setup-comum";
import { SINAIS_INTENCAO, type Campanha, type Lead, type Perfil, type Sequencia } from "./types";

/** Falha ao falar com o Prospect Halo (conexão, ferramenta não reconhecida, resposta em formato desconhecido). As rotas respondem 502. */
export class ErroProspectHalo extends Error {}

export type OperacaoProspectHalo = "buscar" | "campanha" | "estado";

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
  if (!url || !codigo) throw new ErroProspectHalo("Conecte o Prospect Halo em /setup antes de buscar leads.");
  return conectar(url, codigo);
}

function pontuar(f: FerramentaMCP, op: OperacaoProspectHalo): number {
  const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
  return PALAVRAS_CHAVE[op].filter((p) => alvo.includes(p)).length;
}

/**
 * Escolhe, entre as ferramentas remotas, a que cumpre a operação: primeiro o mapeamento manual
 * (campo avançado), depois a que junta mais palavras-chave no nome/descrição. Exportada para testes
 * e para o teste de conexão.
 */
export function escolherFerramenta(op: OperacaoProspectHalo, ferramentas: FerramentaMCP[], manual: Record<string, string> = mapeamentoManual()): FerramentaMCP | null {
  const nomeManual = manual[op];
  if (nomeManual) {
    const f = ferramentas.find((x) => x.nome === nomeManual);
    if (f) return f;
    throw new ErroProspectHalo(`A ferramenta "${nomeManual}" (${op}) do mapeamento manual não existe no Prospect Halo. Corrija o campo "${CAMPO_FERRAMENTAS}" em /setup. Ferramentas disponíveis: ${ferramentas.map((x) => x.nome).join(", ")}.`);
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
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    throw new ErroProspectHalo(`Não foi possível falar com o Prospect Halo: ${err instanceof Error ? err.message : "erro de conexão"}. Confira a conexão em /setup.`);
  }
  const f = escolherFerramenta(op, ferramentas);
  if (!f) {
    throw new ErroProspectHalo(`O Prospect Halo não expõe uma ferramenta reconhecível para ${ROTULO_OPERACAO[op]}. Informe o nome certo no campo "${CAMPO_FERRAMENTAS}" em /setup. Ferramentas disponíveis: ${ferramentas.map((x) => x.nome).join(", ") || "nenhuma"}.`);
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
  if (!lista) throw new ErroProspectHalo("O Prospect Halo respondeu num formato que este app não reconhece (esperava uma lista em leads, prospects, results ou data).");
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
    resposta = await chamar(conexao, ferramenta.nome, args);
  } catch (err) {
    throw new ErroProspectHalo(`O Prospect Halo não conseguiu buscar os leads: ${err instanceof Error ? err.message : "erro desconhecido"}.`);
  }
  const leads = normalizarLeads(resposta);
  if (leads.length === 0) throw new ErroProspectHalo("O Prospect Halo não encontrou leads para esse perfil. Amplie os cargos ou os setores e tente de novo.");
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
    resposta = await chamar(conexao, ferramenta.nome, args);
  } catch (err) {
    throw new ErroProspectHalo(`O Prospect Halo não conseguiu criar a campanha: ${err instanceof Error ? err.message : "erro desconhecido"}.`);
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
    const bruto = await chamar(conexao, ferramenta.nome, args);
    return { texto: resumirEstado(bruto), bruto };
  } catch (err) {
    throw new ErroProspectHalo(`O Prospect Halo não conseguiu informar o andamento: ${err instanceof Error ? err.message : "erro desconhecido"}.`);
  }
}
