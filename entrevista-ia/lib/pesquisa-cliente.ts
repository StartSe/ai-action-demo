// Conexão com a pesquisa de candidatos na web (Bright Data, pelo protocolo MCP). Aqui mora só o
// "como falar com o serviço": montar a conexão, listar o que a conta tem, chamar uma ferramenta e
// traduzir a falha. Quem decide o que pesquisar é lib/pesquisa.ts.
//
// Documentação conferida em 18/09/2026 (docs.brightdata.com/products/mcp-server):
//   - servidor remoto, Streamable HTTP: https://mcp.brightdata.com/mcp
//   - o código de acesso viaja NO ENDEREÇO (`?token=...`), nunca em cabeçalho: o servidor remoto
//     autentica só por esse parâmetro. Por isso `conectar()` recebe o endereço já com ele e nenhum
//     cabeçalho Authorization — e todo log passa por `semToken()`.
//   - `search_engine` e `scrape_as_markdown` vêm ligadas em qualquer conta; `web_data_linkedin_person_profile`
//     exige `&pro=1` e `search_dataset` exige `&groups=social`. É isso que o "modo avançado" liga.
//
// Nenhuma falha daqui chega crua à tela: `interpretarFalhaPesquisa` devolve uma frase de negócio com
// código e ação (mesmo formato de ErroVoz em lib/voz.ts). Falha de pesquisa nunca interrompe um
// cadastro: a ficha segue com o que veio do currículo.
import { ACAO_PESQUISA } from "./acoes";
import { chamar, conectar, listarFerramentas, type ConexaoMCP } from "./mcp-cliente";
import { getConfig } from "./store";

export const URL_MCP_PADRAO = "https://mcp.brightdata.com/mcp";

/** Nomes das ferramentas usadas pela pesquisa, como aparecem em `tools/list`. */
export const FERRAMENTAS = {
  busca: "search_engine",
  markdown: "scrape_as_markdown",
  linkedin: "web_data_linkedin_person_profile",
  conjuntoDeDados: "search_dataset",
} as const;

/** As quatro ferramentas de que a pesquisa precisa, com o nome que a pessoa entende. */
export const FERRAMENTAS_NECESSARIAS: { nome: string; rotulo: string; exigeModoAvancado: boolean }[] = [
  { nome: FERRAMENTAS.busca, rotulo: "a busca na web", exigeModoAvancado: false },
  { nome: FERRAMENTAS.markdown, rotulo: "a leitura de páginas", exigeModoAvancado: false },
  { nome: FERRAMENTAS.linkedin, rotulo: "a leitura do perfil profissional", exigeModoAvancado: true },
  { nome: FERRAMENTAS.conjuntoDeDados, rotulo: "a busca em conjunto de dados", exigeModoAvancado: true },
];

export type ConexaoPesquisa = { url: string; token: string; modoAvancado: boolean };

export type CodigoErroPesquisa = "nao_conectada" | "token_invalido" | "sem_cota" | "servico_fora" | "ferramenta_ausente" | "demorou" | "rede" | "pedido_recusado";

/** Falha da pesquisa na web já em linguagem de negócio, com o suficiente para a tela explicar e agir. */
export class ErroPesquisa extends Error {
  codigo: CodigoErroPesquisa;
  status: number;
  acao?: { rotulo: string; url: string };

  constructor(codigo: CodigoErroPesquisa, mensagem: string, status: number, opcoes: { acao?: { rotulo: string; url: string } } = {}) {
    super(mensagem);
    this.name = "ErroPesquisa";
    this.codigo = codigo;
    this.status = status;
    this.acao = opcoes.acao;
  }
}

/** Esconde o código de acesso de qualquer texto antes de ele ir para o log. O corte de 8 caracteres
 * evita que um valor curto (só em teste; os de verdade são longos) recorte palavras do meio da frase. */
export function semToken(texto: string, token?: string): string {
  const limpo = texto.replace(/token=[^&\s"']+/gi, "token=oculto");
  if (!token || token.length < 8) return limpo;
  return limpo.split(token).join("oculto");
}

function ler(config: Record<string, string | undefined> | undefined, chave: string): string {
  const valor = config ? config[chave] : getConfig(chave);
  return (valor ?? "").trim();
}

/** Endereço (já com o código de acesso e o modo avançado) e código de acesso da conta da Bright Data.
 * `null` quando a pesquisa ainda não foi conectada. */
export function conexaoBrightData(config?: Record<string, string | undefined>): ConexaoPesquisa | null {
  const token = ler(config, "BRIGHTDATA_API_TOKEN");
  if (!token) return null;
  const modoAvancado = ler(config, "BRIGHTDATA_MODO_PRO") === "1";
  let endereco: URL;
  try {
    endereco = new URL(ler(config, "BRIGHTDATA_MCP_URL") || URL_MCP_PADRAO);
  } catch {
    endereco = new URL(URL_MCP_PADRAO);
  }
  endereco.searchParams.set("token", token);
  if (modoAvancado) {
    endereco.searchParams.set("pro", "1");
    endereco.searchParams.set("groups", "social");
  }
  return { url: endereco.toString(), token, modoAvancado };
}

/** A pesquisa na web está conectada? */
export function pesquisaEnabled(): boolean {
  return Boolean(getConfig("BRIGHTDATA_API_TOKEN"));
}

function mcp(conexao: ConexaoPesquisa): ConexaoMCP {
  return conectar(conexao.url);
}

const CACHE_MS = 10 * 60 * 1000;
let cache: { chave: string; em: number; ferramentas: string[] } | null = null;

/** Ferramentas que a conta oferece, guardadas por 10 minutos. O endereço é a chave do cache: trocar o
 * código de acesso ou ligar o modo avançado já joga o anterior fora. */
export async function ferramentasDisponiveis(opcoes: { conexao?: ConexaoPesquisa | null; forcar?: boolean } = {}): Promise<string[]> {
  const conexao = opcoes.conexao === undefined ? conexaoBrightData() : opcoes.conexao;
  if (!conexao) return [];
  if (!opcoes.forcar && cache && cache.chave === conexao.url && Date.now() - cache.em < CACHE_MS) return cache.ferramentas;
  const ferramentas = (await listarFerramentas(mcp(conexao))).map((f) => f.nome);
  cache = { chave: conexao.url, em: Date.now(), ferramentas };
  return ferramentas;
}

/** Esquece o cache de ferramentas (usado depois de salvar a configuração e nos testes). */
export function esquecerFerramentas(): void {
  cache = null;
}

/** Chama uma ferramenta da Bright Data, com prazo opcional. Toda falha sai como `ErroPesquisa`. */
export async function chamarFerramenta(
  nome: string,
  argumentos: Record<string, unknown>,
  opcoes: { conexao?: ConexaoPesquisa | null; limiteMs?: number } = {}
): Promise<unknown> {
  const conexao = opcoes.conexao === undefined ? conexaoBrightData() : opcoes.conexao;
  if (!conexao) {
    throw new ErroPesquisa("nao_conectada", "A pesquisa na web ainda não foi conectada.", 400, { acao: ACAO_PESQUISA });
  }
  const chamada = chamar(mcp(conexao), nome, argumentos).catch((err) => {
    console.error("Falha na pesquisa na web:", nome, semToken(err instanceof Error ? err.message : String(err), conexao.token));
    throw new ErroPesquisa("pedido_recusado", "A pesquisa na web não respondeu como esperado. Tente de novo em um minuto.", 502, { acao: ACAO_PESQUISA });
  });
  if (!opcoes.limiteMs) return chamada;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new ErroPesquisa("demorou", "A pesquisa na web demorou demais e foi interrompida.", 504)), opcoes.limiteMs);
  });
  try {
    return await Promise.race([chamada, prazo]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/** Traduz a falha da Bright Data para uma frase de negócio. O código de acesso nunca vai para o log. */
export function interpretarFalhaPesquisa(status: number, detalheBruto: string, token?: string): ErroPesquisa {
  console.error("Falha na pesquisa na web (Bright Data):", status, semToken(detalheBruto, token).slice(0, 200));
  if (status === 401 || status === 403) {
    return new ErroPesquisa("token_invalido", "O token foi recusado. Confira se copiou o token inteiro.", 401, { acao: ACAO_PESQUISA });
  }
  if (status === 402 || status === 429 || /quota|credit|insufficient|exceeded|limit/i.test(detalheBruto)) {
    return new ErroPesquisa("sem_cota", "Sua conta na Bright Data está sem créditos de pesquisa. Adicione créditos e tente de novo.", 402, { acao: ACAO_PESQUISA });
  }
  if (status >= 500) {
    return new ErroPesquisa("servico_fora", "A Bright Data está indisponível agora. Tente de novo em um minuto.", 502);
  }
  if (status === 0) {
    return new ErroPesquisa("rede", "Não foi possível falar com a Bright Data. Confira o endereço em Opções avançadas.", 502, { acao: ACAO_PESQUISA });
  }
  return new ErroPesquisa("pedido_recusado", "A Bright Data recusou a chamada. Confira o token e o endereço em Configurações.", 400, { acao: ACAO_PESQUISA });
}

/** Só o código de resposta do serviço, para traduzir a falha (o cliente MCP compartilhado não o
 * carrega na exceção). Devolve 0 quando nem deu para chegar lá. */
async function sondar(conexao: ConexaoPesquisa): Promise<{ status: number; detalhe: string }> {
  try {
    const r = await fetch(conexao.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(15000),
    });
    return { status: r.status, detalhe: (await r.text().catch(() => "")).slice(0, 500) };
  } catch {
    return { status: 0, detalhe: "" };
  }
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Teste de conexão do cartão de Configurações: lista as ferramentas e confere as quatro que a
 * pesquisa usa. */
export async function testarPesquisa(config: Record<string, string | undefined>): Promise<{ ok: boolean; mensagem: string }> {
  const conexao = conexaoBrightData(config);
  if (!conexao) return { ok: false, mensagem: "Nenhum token salvo ainda." };
  let ferramentas: string[];
  try {
    ferramentas = await ferramentasDisponiveis({ conexao, forcar: true });
  } catch (err) {
    const { status, detalhe } = await sondar(conexao);
    const bruto = detalhe || (err instanceof Error ? err.message : "");
    return { ok: false, mensagem: interpretarFalhaPesquisa(status, bruto, conexao.token).message };
  }
  const faltando = FERRAMENTAS_NECESSARIAS.filter((f) => !ferramentas.includes(f.nome));
  if (faltando.length) {
    const lista = juntar(faltando.map((f) => f.rotulo));
    const verbo = faltando.length > 1 ? "estão disponíveis" : "está disponível";
    const saida = faltando.some((f) => f.exigeModoAvancado) && !conexao.modoAvancado
      ? " Ligue o modo avançado em Opções avançadas e teste de novo."
      : " Confira o plano da sua conta na Bright Data.";
    return { ok: false, mensagem: `Conectado, mas ${lista} não ${verbo} nesta conta.${saida}` };
  }
  const n = ferramentas.length;
  return { ok: true, mensagem: `Conectado. ${n} ${n === 1 ? "ferramenta disponível" : "ferramentas disponíveis"}.` };
}
