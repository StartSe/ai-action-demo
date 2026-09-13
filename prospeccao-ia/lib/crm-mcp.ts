// Envia um lead para o CRM conectado no cartão "CRM (MCP)" do /setup. Sem conhecer de antemão os
// nomes das ferramentas do lado de lá, mapeia as duas ações deste app (criar contato, criar
// negócio) para uma ferramenta remota por aproximação de nome/descrição — mesmo método usado por
// agente-kanban/lib/quadro-mcp.ts para operar um quadro externo qualquer via MCP.
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { integracaoConfigurada, lerConfig, MCP_CRM } from "./setup-comum";
import type { DadosBusca, Lead } from "./types";

type OperacaoCRM = "contato" | "negocio";

// Palavras (radicais) procuradas no nome+descrição de cada ferramenta remota para identificar qual
// delas cria um contato e qual cria um negócio/oportunidade.
const PALAVRAS_CHAVE: Record<OperacaoCRM, string[]> = {
  contato: ["contact", "contato", "pessoa", "lead"],
  negocio: ["deal", "negocio", "negóc", "opportunit", "oportunidade"],
};

export function crmConfigurado(): boolean {
  return integracaoConfigurada(MCP_CRM);
}

function conexaoAtual(): ConexaoMCP {
  const config = lerConfig(MCP_CRM);
  return conectar(config.MCP_CRM_URL!, config.MCP_CRM_CODIGO);
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
  const conexao = conexaoAtual();
  const ferramentas = await listarFerramentas(conexao);

  const ferramentaContato = ferramentaPara("contato", ferramentas);
  if (!ferramentaContato) {
    throw new Error("O CRM conectado não expõe uma ferramenta reconhecível para criar contato.");
  }
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

  const ferramentaNegocio = ferramentaPara("negocio", ferramentas);
  if (!ferramentaNegocio) {
    return { mensagem: "Contato criado no CRM. Nenhuma ferramenta de negócio foi identificada." };
  }
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
  return { mensagem: "Contato e negócio criados no CRM." };
}
