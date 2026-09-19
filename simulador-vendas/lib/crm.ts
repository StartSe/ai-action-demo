// Leva a nota e os pontos a melhorar de uma conversa analisada para o CRM conectado no cartão
// "CRM (MCP)" do /setup, como uma anotação no registro do cliente. Sem conhecer de antemão as
// ferramentas do lado de lá, escolhe a que registra anotação/atividade por aproximação de nome e
// descrição — mesmo método de prospeccao-linkedin/lib/crm.ts e prospeccao-ia/lib/crm-mcp.ts.
import { CRM } from "./integracoes";
import { obter as obterResultado } from "./historico";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { obter as obterCenario } from "./cenarios";
import { obter as obterParticipante } from "./participantes";
import { integracaoConfigurada } from "./setup-comum";
import { numero } from "./formato";
import type { Meta } from "./ai";
import type { Analise, Conversa } from "./types";

export const ACAO_CRM = { rotulo: "Conectar o CRM em Configurações", url: "/setup#mcp-crm" };

/** Falha ao falar com o CRM. `status` 400 quando falta conexão ou dado (pré-condição da pessoa), 502 quando o serviço remoto recusa. */
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
const PALAVRAS_ANOTACAO = ["note", "anota", "activity", "atividade", "engagement", "comment", "coment", "task", "tarefa"];

export function crmConfigurado(): boolean {
  return integracaoConfigurada(CRM);
}

async function conexaoAtual(): Promise<ConexaoMCP> {
  const autorizada = await conexaoAutorizada(PREFIXO_CRM);
  if (!autorizada) throw new ErroCRM("Conecte o CRM em Configurações antes de enviar as notas.", 400, ACAO_CRM);
  return conectar(autorizada.url, autorizada.token);
}

function ferramentaAnotacao(ferramentas: FerramentaMCP[]): FerramentaMCP | null {
  let melhor: FerramentaMCP | null = null;
  let melhorPontos = 0;
  for (const f of ferramentas) {
    const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
    const pontos = PALAVRAS_ANOTACAO.filter((p) => alvo.includes(p)).length + (/creat|add|cri|novo|new|registr/.test(alvo) ? 1 : 0);
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

/** Texto da anotação: nota, resumo e os três critérios mais fracos, em uma leitura só. */
export function anotacaoDaConversa(titulo: string, analise: Analise): string {
  const fracos = [...analise.criterios].sort((a, b) => a.nota - b.nota).slice(0, 3);
  const linhas = [
    `${titulo} — nota ${numero(analise.nota, 1)} de 10.`,
    analise.resumo,
    "",
    "Pontos a melhorar:",
    ...fracos.map((c) => `- ${c.nome} (${numero(c.nota, 1)}): ${c.comoMelhorar || c.evidencia}`),
  ];
  return linhas.filter((l) => l !== undefined).join("\n");
}

/**
 * Cria uma anotação no CRM com a nota e os pontos a melhorar da conversa salva em `resultadoId`.
 * Lança ErroCRM (sem conexão, resultado inexistente, exemplo, ferramenta não reconhecida, recusa remota).
 */
export async function enviarConversaParaCRM(resultadoId: string): Promise<{ mensagem: string }> {
  const resultado = obterResultado<Conversa, Analise, Meta>(resultadoId);
  if (!resultado || resultado.tipo !== "conversa") {
    throw new ErroCRM("Não encontrei esta conversa. Analise de novo e tente outra vez.", 400);
  }
  if (resultado.meta?.demo) {
    throw new ErroCRM("Esta análise é um exemplo. Conecte a IA e analise uma conversa real antes de mandar ao CRM.", 400, { rotulo: "Conectar a IA", url: "/setup#openrouter" });
  }

  const cenario = resultado.entrada.cenarioId ? obterCenario(resultado.entrada.cenarioId) : null;
  const vendedor = resultado.entrada.vendedorId ? obterParticipante(resultado.entrada.vendedorId) : null;
  const conexao = await conexaoAtual();

  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    console.error("CRM: não foi possível listar as ferramentas", err);
    throw new ErroCRM("Não foi possível falar com o CRM agora. Confira a conexão em Configurações e tente de novo.", 502, ACAO_CRM);
  }
  const ferramenta = ferramentaAnotacao(ferramentas);
  if (!ferramenta) throw new ErroCRM("O CRM conectado não oferece uma ação reconhecível para registrar anotação. Confira a conexão em Configurações.", 400, ACAO_CRM);

  const texto = anotacaoDaConversa(resultado.titulo, resultado.saida);
  const candidatos: Record<string, string | undefined> = {
    "^(body|texto|content|conteudo|note|anota|descri|message|comment)": texto,
    "titulo|title|subject|assunto|name|nome": resultado.titulo,
    "empresa|company|organiza|account": cenario?.cliente.empresa,
    "contato|contact|pessoa|person|cliente": cenario?.cliente.nome,
    "owner|responsavel|user|vendedor": vendedor?.nome,
  };

  try {
    await chamar(conexao, ferramenta.nome, montarArgumentos(ferramenta.schema, candidatos));
  } catch (err) {
    console.error("CRM: anotação recusada", err);
    throw new ErroCRM("O CRM recusou a anotação. Confira a conexão em Configurações e tente de novo.", 502, ACAO_CRM);
  }
  return { mensagem: "Anotação criada no CRM com a nota e os pontos a melhorar." };
}
