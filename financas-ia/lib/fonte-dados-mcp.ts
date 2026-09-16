// Leitura da fonte de dados externa (planilha viva, ERP...) via MCP: reaproveita o cliente genérico de
// lib/mcp-cliente.ts e a integração compartilhada MCP_DADOS de lib/setup-comum.ts.
// Próprio deste app: nenhum outro app da suíte lê planilha/CSV.
//
// Toda falha sai daqui como ErroFonte, no mesmo formato de ErroIA (mensagem curada + codigo + status +
// acao): a tela nunca vê o endereço, o status da resposta nem o corpo do serviço remoto, e nunca lê as
// palavras "JSON" ou "ferramenta" — quem está do outro lado é um gestor financeiro, não quem instalou
// o servidor MCP. O detalhe técnico vai só para console.error (dentro do cliente compartilhado).
import { getConfig } from "./store";
import { conectar, listarFerramentas, chamar, type FerramentaMCP } from "./mcp-cliente";
import { ACAO_FONTE_DADOS } from "./acoes";

const PALAVRAS_FERRAMENTA_LEITURA = ["planilha", "csv", "sheet", "export", "dados", "ler", "listar", "consultar", "buscar", "read", "list", "query"];

export type CodigoErroFonte = "sem_fonte" | "sem_leitura" | "parametros" | "sem_planilha" | "fonte_fora";

export class ErroFonte extends Error {
  codigo: CodigoErroFonte;
  status: number;
  acao: { rotulo: string; url: string };

  constructor(codigo: CodigoErroFonte, mensagem: string, status: number) {
    super(mensagem);
    this.name = "ErroFonte";
    this.codigo = codigo;
    this.status = status;
    this.acao = ACAO_FONTE_DADOS;
  }
}

/** Traduz a falha genérica do cliente compartilhado ("o serviço não respondeu...") para a situação
 * concreta da fonte de dados. O cliente não expõe o status da resposta, então o casamento é pelo texto
 * das frases que ele sabe lançar (ver lib/mcp-cliente.ts). */
function traduzirFalha(err: unknown): ErroFonte {
  const texto = err instanceof Error ? err.message : "";
  if (/recusou a chamada|código de acesso/i.test(texto)) {
    return new ErroFonte("fonte_fora", "A fonte de dados recusou a leitura. Confira o endereço e o código de acesso em Configurações.", 401);
  }
  return new ErroFonte("fonte_fora", "Não conseguimos falar com a fonte de dados agora. Confira o endereço em Configurações e tente de novo.", 502);
}

/** Sem uma leitura escolhida em "Opções avançadas", tenta adivinhar pela aproximação do nome/descrição com palavras comuns de leitura. */
function sugerirFerramentaLeitura(ferramentas: FerramentaMCP[]): string | undefined {
  const pontuadas = ferramentas
    .map((f) => {
      const texto = `${f.nome} ${f.descricao || ""}`.toLowerCase();
      const pontos = PALAVRAS_FERRAMENTA_LEITURA.filter((p) => texto.includes(p)).length;
      return { nome: f.nome, pontos };
    })
    .sort((a, b) => b.pontos - a.pontos);
  return pontuadas[0]?.nome;
}

export function fonteDadosConfigurada(): boolean {
  return Boolean(getConfig("MCP_DADOS_URL"));
}

/** Lê a fonte conectada (planilha viva, ERP...) e devolve o conteúdo como texto CSV. */
export async function lerFonteDados(): Promise<string> {
  const url = getConfig("MCP_DADOS_URL");
  if (!url) throw new ErroFonte("sem_fonte", "Nenhuma fonte de dados conectada ainda. Conecte a planilha ou o ERP em Configurações.", 400);

  const conexao = conectar(url, getConfig("MCP_DADOS_CODIGO"));
  let ferramentas: FerramentaMCP[];
  try {
    ferramentas = await listarFerramentas(conexao);
  } catch (err) {
    throw traduzirFalha(err);
  }
  if (ferramentas.length === 0) {
    throw new ErroFonte("sem_leitura", "A fonte conectada não oferece nenhuma leitura. Confira o endereço em Configurações.", 400);
  }

  const nomeConfigurado = getConfig("MCP_DADOS_FERRAMENTA");
  const nomeFerramenta = nomeConfigurado && ferramentas.some((f) => f.nome === nomeConfigurado) ? nomeConfigurado : sugerirFerramentaLeitura(ferramentas);
  if (!nomeFerramenta) {
    throw new ErroFonte("sem_leitura", "Não identificamos qual leitura usar nessa fonte. Escolha uma em Opções avançadas, em Configurações.", 400);
  }

  let argumentos: Record<string, unknown> = {};
  const argumentosConfigurados = getConfig("MCP_DADOS_ARGUMENTOS");
  if (argumentosConfigurados) {
    try {
      argumentos = JSON.parse(argumentosConfigurados);
    } catch (err) {
      console.error("Argumentos avançados da fonte de dados fora do formato esperado:", err);
      throw new ErroFonte("parametros", "Os parâmetros avançados da fonte de dados estão fora do formato esperado. Revise em Configurações.", 400);
    }
  }

  let resultado: unknown;
  try {
    resultado = await chamar(conexao, nomeFerramenta, argumentos);
  } catch (err) {
    throw traduzirFalha(err);
  }
  if (typeof resultado !== "string" || !resultado.trim()) {
    throw new ErroFonte("sem_planilha", "A fonte conectada não devolveu uma planilha. Confira em Configurações qual leitura usar.", 502);
  }
  return resultado;
}
