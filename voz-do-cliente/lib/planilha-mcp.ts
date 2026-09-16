// Lê as respostas de NPS de uma planilha viva (ou ERP) conectada no cartão "Fonte de dados (MCP)" do /setup
// (MCP_DADOS, molde compartilhado de lib/setup-comum.ts) e converte cada linha num Comentario com nota, para
// a mesma análise do fluxo manual. Mesmo desenho de financas-ia/lib/fonte-dados-mcp.ts (identificar a
// ferramenta de leitura por nome/descrição, argumentos opcionais em JSON) e o parser de CSV de lib/parse.ts,
// que já roda no navegador para o upload de arquivo.
import { ErroFonte } from "./erro-fonte";
import { chamar, conectar, listarFerramentas, type FerramentaMCP } from "./mcp-cliente";
import { adivinharColunaNota, adivinharColunaTexto, comentariosDoArquivo, parseCSV } from "./parse";
import { integracaoConfigurada, lerConfig, MCP_DADOS } from "./setup-comum";
import type { Comentario } from "./types";

export const ACAO_PLANILHA = { rotulo: "Abrir Configurações", url: "/setup#mcp-dados" };

const PALAVRAS_LEITURA = ["nps", "resposta", "response", "planilha", "sheet", "csv", "ler", "read", "listar", "list", "consultar", "query", "export", "dados"];

export type LeituraPlanilha = { comentarios: Comentario[]; colunaTexto?: string; colunaNota?: string };

export function planilhaConfigurada(): boolean {
  return integracaoConfigurada(MCP_DADOS);
}

/** Sem uma ferramenta escolhida em "Opções avançadas", adivinha pela aproximação do nome/descrição com palavras de leitura. */
function sugerirFerramenta(ferramentas: FerramentaMCP[]): FerramentaMCP | undefined {
  let melhor: FerramentaMCP | undefined;
  let melhorPontos = 0;
  for (const f of ferramentas) {
    const texto = `${f.nome} ${f.descricao || ""}`.toLowerCase();
    const pontos = PALAVRAS_LEITURA.filter((p) => texto.includes(p)).length;
    if (pontos > melhorPontos) {
      melhorPontos = pontos;
      melhor = f;
    }
  }
  return melhor;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Linhas de um resultado em JSON: uma lista de objetos, ou um objeto com a lista dentro (rows, linhas, dados, data, items, values). */
function linhasDoResultado(resultado: unknown): Record<string, unknown>[] {
  if (Array.isArray(resultado)) return resultado.filter(ehObjeto);
  if (ehObjeto(resultado)) {
    for (const chave of ["rows", "linhas", "respostas", "dados", "data", "items", "values"]) {
      const v = resultado[chave];
      if (Array.isArray(v)) return v.filter(ehObjeto);
    }
  }
  return [];
}

/** Converte o que a ferramenta devolveu (texto CSV, o mais comum numa planilha; ou lista de objetos) em comentários com nota. */
export function comentariosDaLeitura(resultado: unknown): LeituraPlanilha {
  let headers: string[];
  let rows: string[][];
  if (typeof resultado === "string") {
    ({ headers, rows } = parseCSV(resultado));
  } else {
    const linhas = linhasDoResultado(resultado);
    headers = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
    rows = linhas.map((l) => headers.map((h) => (l[h] === null || l[h] === undefined ? "" : String(l[h]))));
  }
  if (!headers.length) return { comentarios: [] };
  const idxTexto = adivinharColunaTexto(headers);
  const idxNota = adivinharColunaNota(headers);
  const comentarios = comentariosDoArquivo({ tipo: "csv", headers, rows }, idxTexto, idxNota).map((c) => ({ ...c, origem: "planilha" as const }));
  return { comentarios, colunaTexto: headers[idxTexto], colunaNota: idxNota >= 0 ? headers[idxNota] : undefined };
}

/** Lê a planilha conectada. Lança ErroFonte (400 sem planilha/ferramenta reconhecível, 502 quando o serviço não responde). */
export async function lerPlanilhaNps(): Promise<LeituraPlanilha> {
  if (!planilhaConfigurada()) {
    throw new ErroFonte(400, "Conecte a planilha em Configurações antes de ler as notas.", ACAO_PLANILHA);
  }
  const config = lerConfig(MCP_DADOS);
  const conexao = conectar(config.MCP_DADOS_URL!, config.MCP_DADOS_CODIGO);

  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    throw ErroFonte.deServico(err, ACAO_PLANILHA);
  }

  const nomeConfigurado = config.MCP_DADOS_FERRAMENTA?.trim();
  const ferramenta = nomeConfigurado ? ferramentas.find((f) => f.nome === nomeConfigurado) : sugerirFerramenta(ferramentas);
  if (!ferramenta) {
    throw new ErroFonte(
      400,
      nomeConfigurado
        ? `A ferramenta "${nomeConfigurado}" não existe nessa fonte; confira o nome em Configurações.`
        : "A fonte conectada não oferece uma leitura reconhecível; informe o nome da ferramenta em Configurações.",
      ACAO_PLANILHA
    );
  }

  let argumentos: Record<string, unknown> = {};
  if (config.MCP_DADOS_ARGUMENTOS?.trim()) {
    try {
      const lido: unknown = JSON.parse(config.MCP_DADOS_ARGUMENTOS);
      if (ehObjeto(lido)) argumentos = lido;
    } catch {
      throw new ErroFonte(400, "Os argumentos da fonte de dados não estão em um formato válido; corrija em Configurações.", ACAO_PLANILHA);
    }
  }

  let resultado: unknown;
  try {
    resultado = await chamar(conexao, ferramenta.nome, argumentos);
  } catch (err) {
    throw ErroFonte.deServico(err, ACAO_PLANILHA);
  }
  return comentariosDaLeitura(resultado);
}
