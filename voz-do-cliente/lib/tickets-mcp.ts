// Importa tickets de atendimento (HubSpot, Zendesk, Intercom...) do CRM/helpdesk conectado no
// cartão "CRM (MCP)" do /setup, convertendo cada ticket num comentário para a mesma análise de
// voz do cliente usada pelo fluxo manual. Mesmo método de identificar a ferramenta certa por
// nome/descrição já usado em prospeccao-ia/lib/crm-mcp.ts, mas para a direção de leitura
// (listar) em vez de escrita.
import { ErroFonte } from "./erro-fonte";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { integracaoConfigurada, lerConfig, MCP_CRM } from "./setup-comum";
import type { Comentario } from "./types";

/** Ação oferecida em todo erro desta fonte: abrir o cartão do CRM em Configurações. */
export const ACAO_CRM = { rotulo: "Abrir Configurações", url: "/setup#mcp-crm" };

const PALAVRAS_LISTAGEM = ["list", "listar", "search", "buscar"];
const PALAVRAS_TICKET = ["ticket", "chamado", "conversa", "conversation", "case", "atendimento"];

export function importacaoTicketsConfigurada(): boolean {
  return integracaoConfigurada(MCP_CRM);
}

function conexaoAtual(): ConexaoMCP {
  if (!importacaoTicketsConfigurada()) {
    throw new ErroFonte(400, "Conecte um CRM em Configurações antes de importar tickets.", ACAO_CRM);
  }
  const config = lerConfig(MCP_CRM);
  return conectar(config.MCP_CRM_URL!, config.MCP_CRM_CODIGO);
}

function pontuar(f: FerramentaMCP): number {
  const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
  const pontosTicket = PALAVRAS_TICKET.filter((p) => alvo.includes(p)).length;
  if (!pontosTicket) return 0;
  const temListagem = PALAVRAS_LISTAGEM.some((p) => alvo.includes(p));
  return pontosTicket + (temListagem ? 2 : 0);
}

function ferramentaDeListagem(ferramentas: FerramentaMCP[]): FerramentaMCP | null {
  let melhor: FerramentaMCP | null = null;
  let melhorPontos = 0;
  for (const f of ferramentas) {
    const pontos = pontuar(f);
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = f;
    }
  }
  return melhor;
}

type SchemaObjeto = { properties?: Record<string, { type?: string }> };

/** Preenche os argumentos de período da ferramenta remota quando o schema tiver uma propriedade reconhecível. */
function montarArgumentosPeriodo(schema: unknown, dias: number): Record<string, unknown> {
  const propriedades = (schema && typeof schema === "object" ? (schema as SchemaObjeto).properties : undefined) || {};
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const args: Record<string, unknown> = {};
  for (const chave of Object.keys(propriedades)) {
    if (/dias|days/i.test(chave)) args[chave] = dias;
    else if (/desde|since|start|inicio|início|after/i.test(chave)) args[chave] = desde;
  }
  return args;
}

function textoDoTicket(t: Record<string, unknown>): string {
  const chaves = ["texto", "descricao", "description", "mensagem", "message", "body", "text", "comentario", "assunto", "subject", "titulo", "title"];
  for (const chave of chaves) {
    const v = t[chave];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function notaDoTicket(t: Record<string, unknown>): number | undefined {
  const chaves = ["nota", "score", "csat", "rating", "satisfaction"];
  for (const chave of chaves) {
    const v = t[chave];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }
  return undefined;
}

function ticketsDoResultado(resultado: unknown): Record<string, unknown>[] {
  const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object";
  if (Array.isArray(resultado)) return resultado.filter(ehObjeto);
  if (ehObjeto(resultado)) {
    for (const chave of ["tickets", "items", "data", "resultados", "conversas"]) {
      const v = resultado[chave];
      if (Array.isArray(v)) return v.filter(ehObjeto);
    }
  }
  return [];
}

/** Lista os tickets dos últimos `dias` no CRM/helpdesk conectado e converte cada um num comentário (origem "ticket") para a
 * mesma análise de voz do cliente. Lança ErroFonte (400 sem CRM/sem listagem, 502 quando o CRM não responde) — nunca HTTP cru. */
export async function importarTickets(dias: number): Promise<Comentario[]> {
  const conexao = conexaoAtual();
  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    throw ErroFonte.deServico(err, ACAO_CRM);
  }
  const ferramenta = ferramentaDeListagem(ferramentas);
  if (!ferramenta) {
    throw new ErroFonte(400, "O CRM conectado não oferece listar tickets; confira ou conecte outro em Configurações.", ACAO_CRM);
  }
  let resultado: unknown;
  try {
    resultado = await chamar(conexao, ferramenta.nome, montarArgumentosPeriodo(ferramenta.schema, dias));
  } catch (err) {
    throw ErroFonte.deServico(err, ACAO_CRM);
  }
  return ticketsDoResultado(resultado)
    .map((t) => ({ texto: textoDoTicket(t), nota: notaDoTicket(t), origem: "ticket" as const }))
    .filter((c) => c.texto);
}
