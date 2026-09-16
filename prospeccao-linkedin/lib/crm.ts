// Envia os leads escolhidos na lista para o CRM conectado no cartão "CRM (MCP)" do /setup, como
// contatos. Sem conhecer de antemão as ferramentas do lado de lá, escolhe a que cria contato por
// aproximação de nome/descrição — mesmo método de lib/prospecthalo.ts e de prospeccao-ia/lib/crm-mcp.ts.
import { CRM } from "./integracoes";
import { CampanhaNaoEncontrada, ErroDePedido, obterCampanha } from "./leads";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada } from "./setup-comum";
import type { FalhaSequencia, Lead, Perfil } from "./types";

export { CampanhaNaoEncontrada, ErroDePedido };

export const ACAO_CRM = { rotulo: "Conectar o CRM em Configurações", url: "/setup#mcp-crm" };

/** Falha ao falar com o CRM. `status` 400 quando falta conexão (pré-condição da pessoa), 502 quando o serviço remoto recusa. */
export class ErroCRM extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status = 502, acao?: { rotulo: string; url: string }) {
    super(mensagem);
    this.name = "ErroCRM";
    this.status = status;
    this.acao = acao;
  }
}

const PREFIXO_CRM = "MCP_CRM";
const PALAVRAS_CONTATO = ["contact", "contato", "pessoa", "person", "lead"];

export function crmConfigurado(): boolean {
  return integracaoConfigurada(CRM);
}

async function conexaoAtual(): Promise<ConexaoMCP> {
  const autorizada = await conexaoAutorizada(PREFIXO_CRM);
  if (!autorizada) throw new ErroCRM("Conecte o CRM em Configurações antes de enviar os leads.", 400, ACAO_CRM);
  return conectar(autorizada.url, autorizada.token);
}

function ferramentaContato(ferramentas: FerramentaMCP[]): FerramentaMCP | null {
  let melhor: FerramentaMCP | null = null;
  let melhorPontos = 0;
  for (const f of ferramentas) {
    const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
    const pontos = PALAVRAS_CONTATO.filter((p) => alvo.includes(p)).length + (/creat|add|cri|novo|new|upsert/.test(alvo) ? 1 : 0);
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = f;
    }
  }
  return melhor;
}

type SchemaObjeto = { properties?: Record<string, { type?: string }> };

/** Preenche as propriedades do schema da ferramenta remota com o primeiro candidato cujo padrão bate com o nome da propriedade. */
function montarArgumentos(schema: unknown, candidatos: Record<string, string | undefined>): Record<string, unknown> {
  const propriedades = (schema && typeof schema === "object" ? (schema as SchemaObjeto).properties : undefined) || {};
  const args: Record<string, unknown> = {};
  for (const chave of Object.keys(propriedades)) {
    for (const [padrao, valor] of Object.entries(candidatos)) {
      if (!valor) continue;
      if (new RegExp(padrao, "i").test(chave)) {
        args[chave] = valor;
        break;
      }
    }
  }
  return args;
}

function argumentosDoLead(lead: Lead, perfil: Perfil): Record<string, string | undefined> {
  return {
    "^(nome|name|full_?name|contact_?name)$": lead.nome,
    "first_?name|primeiro": lead.nome.split(" ")[0],
    "last_?name|sobrenome": lead.nome.split(" ").slice(1).join(" ") || undefined,
    "empresa|company|organiza|account": lead.empresa,
    "cargo|title|job|posi|role|headline": lead.cargo,
    "linkedin|url|website|site": lead.linkedinUrl || undefined,
    "setor|industr|sector": lead.setor || undefined,
    "descri|note|obs|comment|context|source|origem": `${lead.sinal ? `${lead.sinal} ` : ""}Proposta: ${perfil.proposta}`,
  };
}

export type ResultadoEnvioCRM = { enviados: string[]; falhas: FalhaSequencia[]; mensagem: string };

/**
 * Cria um contato no CRM para cada lead escolhido. Uma falha isolada não derruba as outras: os que entraram
 * voltam em `enviados` e os que falharam em `falhas`. Lança ErroDePedido (lista de exemplo, seleção vazia),
 * CampanhaNaoEncontrada e ErroCRM (sem conexão, ferramenta não reconhecida, todos recusados).
 */
export async function enviarLeadsParaCRM(campanhaId: string, leadIds: string[]): Promise<ResultadoEnvioCRM> {
  const { campanha, perfil } = obterCampanha(campanhaId);
  const ids = Array.from(new Set(leadIds.map((x) => String(x))));
  if (ids.length === 0) throw new ErroDePedido("Marque os leads que devem ir para o CRM.");
  const leads = ids.map((id) => campanha.leads.find((l) => l.id === id));
  if (leads.some((l) => !l)) throw new ErroDePedido("Um dos leads escolhidos não está nesta campanha.");
  if ((leads as Lead[]).some((l) => l.origem === "demo")) {
    throw new ErroDePedido("Esta lista é de exemplo (leads fictícios). Conecte o Prospect Halo e busque de novo para mandar leads reais ao CRM.");
  }

  const conexao = await conexaoAtual();
  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    console.error("CRM: não foi possível listar as ferramentas", err);
    throw new ErroCRM("Não foi possível falar com o CRM agora. Confira a conexão em Configurações e tente de novo.", 502, ACAO_CRM);
  }
  const ferramenta = ferramentaContato(ferramentas);
  if (!ferramenta) throw new ErroCRM("O CRM conectado não oferece uma ação reconhecível para criar contato. Confira a conexão em Configurações.", 400, ACAO_CRM);

  const resultados = await Promise.allSettled((leads as Lead[]).map((lead) => chamar(conexao, ferramenta.nome, montarArgumentos(ferramenta.schema, argumentosDoLead(lead, perfil)))));
  const enviados: string[] = [];
  const falhas: FalhaSequencia[] = [];
  resultados.forEach((r, i) => {
    const lead = (leads as Lead[])[i];
    if (r.status === "fulfilled") enviados.push(lead.id);
    else {
      console.error("CRM: contato recusado", lead.nome, r.reason);
      falhas.push({ leadId: lead.id, nome: lead.nome, mensagem: "O CRM não aceitou este contato." });
    }
  });
  if (enviados.length === 0) {
    throw new ErroCRM(`O CRM não aceitou ${leads.length === 1 ? "o contato" : `nenhum dos ${leads.length} contatos`}. Tente de novo; se continuar, confira a conexão em Configurações.`, 502, ACAO_CRM);
  }
  const mensagem =
    falhas.length > 0
      ? `Enviamos ${enviados.length} de ${leads.length} leads ao CRM; ${falhas.map((f) => f.nome).join(", ")} não ${falhas.length === 1 ? "entrou" : "entraram"}.`
      : `${enviados.length} ${enviados.length === 1 ? "lead enviado ao CRM como contato" : "leads enviados ao CRM como contatos"}.`;
  return { enviados, falhas, mensagem };
}
