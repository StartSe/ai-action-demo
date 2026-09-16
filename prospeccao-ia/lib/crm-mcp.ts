// Envia um lead para o CRM conectado no cartão "CRM (MCP)" do /setup. Sem conhecer de antemão os
// nomes das ferramentas do lado de lá, mapeia as duas ações deste app (criar contato, criar
// negócio) para uma ferramenta remota por aproximação de nome/descrição — mesmo método usado por
// agente-kanban/lib/quadro-mcp.ts para operar um quadro externo qualquer via MCP.
import { ACAO_CRM } from "./acoes";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, MCP_CRM } from "./setup-comum";
import type { DadosBusca, Lead } from "./types";

export { ACAO_CRM };

type OperacaoCRM = "contato" | "negocio";



/**
 * Falha ao falar com o CRM, já em linguagem de negócio. `status` 400 quando falta conexão (pré-condição
 * de quem está na tela), 502 quando o serviço remoto recusa ou não responde. As frases genéricas de
 * lib/mcp-cliente.ts ("o serviço...") nunca chegam à tela: são registradas no console e traduzidas aqui.
 */
export class ErroCRM extends Error {
  status: number;
  acao?: { rotulo: string; url: string };
  constructor(mensagem: string, status = 502, acao: { rotulo: string; url: string } | undefined = ACAO_CRM) {
    super(mensagem);
    this.name = "ErroCRM";
    this.status = status;
    this.acao = acao;
  }
}

// Palavras (radicais) procuradas no nome+descrição de cada ferramenta remota para identificar qual
// delas cria um contato e qual cria um negócio/oportunidade.
const PALAVRAS_CHAVE: Record<OperacaoCRM, string[]> = {
  contato: ["contact", "contato", "pessoa", "lead"],
  negocio: ["deal", "negocio", "negóc", "opportunit", "oportunidade"],
};

export function crmConfigurado(): boolean {
  return integracaoConfigurada(MCP_CRM);
}

async function conexaoAtual(): Promise<ConexaoMCP> {
  const autorizada = await conexaoAutorizada("MCP_CRM");
  if (!autorizada) throw new ErroCRM("Conecte o CRM em Configurações antes de enviar os leads.", 400);
  return conectar(autorizada.url, autorizada.token);
}

function pontuar(f: FerramentaMCP, op: OperacaoCRM): number {
  const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
  return PALAVRAS_CHAVE[op].filter((p) => alvo.includes(p)).length;
}

function ferramentaPara(op: OperacaoCRM, ferramentas: FerramentaMCP[]): FerramentaMCP | null {
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

/** Cria o contato do lead no CRM conectado e, quando uma ferramenta de negócio for identificada, também um negócio associado. */
export async function enviarLeadParaCRM(lead: Lead, dados: Pick<DadosBusca, "proposta">): Promise<{ mensagem: string }> {
  const conexao = await conexaoAtual();
  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    console.error("CRM: não foi possível listar as ferramentas", err);
    throw new ErroCRM("Não foi possível falar com o CRM agora. Confira a conexão em Configurações e tente de novo.");
  }

  const ferramentaContato = ferramentaPara("contato", ferramentas);
  if (!ferramentaContato) {
    throw new ErroCRM("O CRM conectado não oferece uma ação reconhecível para criar contato. Confira a conexão em Configurações.", 400);
  }
  try {
    await chamar(
      conexao,
      ferramentaContato.nome,
      montarArgumentos(ferramentaContato.schema, {
      "nome|name": lead.nome,
      "empresa|company|organiza": lead.empresa,
      "cargo|title|jobtitle|posi": lead.cargo,
        "cidade|city": lead.cidade,
        "site|website|url": lead.site,
        linkedin: lead.linkedin,
      })
    );
  } catch (err) {
    console.error("CRM: contato recusado", lead.nome, err);
    throw new ErroCRM("O CRM não aceitou este contato. Tente de novo; se continuar, confira a conexão em Configurações.");
  }

  const ferramentaNegocio = ferramentaPara("negocio", ferramentas);
  if (!ferramentaNegocio) {
    return { mensagem: "Contato criado no CRM. O CRM conectado não oferece uma ação de negócio reconhecível." };
  }
  try {
    await chamar(
      conexao,
      ferramentaNegocio.nome,
      montarArgumentos(ferramentaNegocio.schema, {
        "nome|name|title|assunto": `${lead.nome} — ${lead.empresa}`,
        "contato|contact": lead.nome,
        "empresa|company": lead.empresa,
        "descri|note|obs": dados.proposta,
      })
    );
  } catch (err) {
    console.error("CRM: negócio recusado", lead.nome, err);
    return { mensagem: "Contato criado no CRM. O negócio não entrou; crie a oportunidade direto no CRM." };
  }
  return { mensagem: "Contato e negócio criados no CRM." };
}
