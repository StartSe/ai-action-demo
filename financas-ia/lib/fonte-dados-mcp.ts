// Leitura da fonte de dados externa (planilha viva, ERP...) via MCP (US-077): reaproveita o cliente
// genérico de lib/mcp-cliente.ts e a integração compartilhada MCP_DADOS de lib/setup-comum.ts.
// Próprio deste app (não copiado para os outros 9): nenhum outro app lê planilha/CSV.
import { getConfig } from "./store";
import { conectar, listarFerramentas, chamar, type FerramentaMCP } from "./mcp-cliente";

const PALAVRAS_FERRAMENTA_LEITURA = ["planilha", "csv", "sheet", "export", "dados", "ler", "listar", "consultar", "buscar", "read", "list", "query"];

/** Sem uma ferramenta escolhida em "Opções avançadas", tenta adivinhar pela aproximação do nome/descrição com palavras comuns de leitura. */
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
  if (!url) throw new Error("Nenhuma fonte de dados conectada. Conecte em Configuração inicial.");

  const conexao = conectar(url, getConfig("MCP_DADOS_CODIGO"));
  const ferramentas = await listarFerramentas(conexao);
  if (ferramentas.length === 0) throw new Error("A fonte conectada não expõe nenhuma ferramenta de leitura.");

  const nomeConfigurado = getConfig("MCP_DADOS_FERRAMENTA");
  const nomeFerramenta = nomeConfigurado && ferramentas.some((f) => f.nome === nomeConfigurado) ? nomeConfigurado : sugerirFerramentaLeitura(ferramentas);
  if (!nomeFerramenta) throw new Error("Não foi possível identificar qual ferramenta usar para ler os dados. Informe o nome em Opções avançadas.");

  let argumentos: Record<string, unknown> = {};
  const argumentosConfigurados = getConfig("MCP_DADOS_ARGUMENTOS");
  if (argumentosConfigurados) {
    try {
      argumentos = JSON.parse(argumentosConfigurados);
    } catch {
      throw new Error("Os argumentos avançados da fonte de dados não são um JSON válido.");
    }
  }

  const resultado = await chamar(conexao, nomeFerramenta, argumentos);
  if (typeof resultado !== "string" || !resultado.trim()) {
    throw new Error("A ferramenta conectada não devolveu texto em formato CSV.");
  }
  return resultado;
}
