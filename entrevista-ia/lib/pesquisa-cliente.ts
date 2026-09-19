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
//     exige `&pro=1` e `search_dataset` exige `&groups=social`. O conector sempre habilita esses parâmetros.
//
// Nenhuma falha daqui chega crua à tela: `interpretarFalhaPesquisa` devolve uma frase de negócio com
// código e ação (mesmo formato de ErroVoz em lib/voz.ts). Falha de pesquisa nunca interrompe um
// cadastro: a ficha segue com o que veio do currículo.
import { ACAO_PESQUISA } from "./acoes";
import { ErroMCP, chamar, conectar, listarFerramentas, type ConexaoMCP } from "./mcp-cliente";
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
  const modoAvancado = true; // As quatro ações fazem parte do enriquecimento.
  let endereco: URL;
  try {
    endereco = new URL(ler(config, "BRIGHTDATA_MCP_URL") || URL_MCP_PADRAO);
  } catch {
    endereco = new URL(URL_MCP_PADRAO);
  }
  endereco.searchParams.set("token", token);
  endereco.searchParams.set("pro", "1");
  const grupos = new Set((endereco.searchParams.get("groups") || "").split(",").filter(Boolean));
  grupos.add("social");
  endereco.searchParams.set("groups", [...grupos].join(","));
  if (endereco.searchParams.has("tools")) {
    const ferramentas = new Set((endereco.searchParams.get("tools") || "").split(",").filter(Boolean));
    for (const nome of [...Object.values(FERRAMENTAS), "list_dataset_fields"]) ferramentas.add(nome);
    endereco.searchParams.set("tools", [...ferramentas].join(","));
  }
  return { url: endereco.toString(), token, modoAvancado };
}

/** A pesquisa na web está conectada? */
export function pesquisaEnabled(): boolean {
  return Boolean(getConfig("BRIGHTDATA_API_TOKEN"));
}

let clienteAtual: ConexaoMCP | undefined;
function mcp(conexao: ConexaoPesquisa): ConexaoMCP {
  if (clienteAtual?.url !== conexao.url) clienteAtual = conectar(conexao.url);
  return clienteAtual;
}

const CACHE_MS = 10 * 60 * 1000;
let cache: { chave: string; em: number; ferramentas: string[] } | null = null;

/** Ferramentas que a conta oferece, guardadas por 10 minutos. O endereço é a chave do cache: trocar o
 * código de acesso ou ligar o modo avançado já joga o anterior fora. */
export async function ferramentasDisponiveis(opcoes: { conexao?: ConexaoPesquisa | null; forcar?: boolean } = {}): Promise<string[]> {
  const conexao = opcoes.conexao === undefined ? conexaoBrightData() : opcoes.conexao;
  if (!conexao) return [];
  if (!opcoes.forcar && cache && cache.chave === conexao.url && Date.now() - cache.em < CACHE_MS) return cache.ferramentas;
  let ferramentas: string[];
  try {
    ferramentas = (await listarFerramentas(mcp(conexao))).map((f) => f.nome);
  } catch (err) {
    throw await traduzir(conexao, err);
  }
  cache = { chave: conexao.url, em: Date.now(), ferramentas };
  return ferramentas;
}

/**
 * O nome de cada ferramenta que a coleta usa, **como esta conta a chama**.
 *
 * A Bright Data pode renomear uma ferramenta ou oferecer uma variante (`search_engine_batch`), e uma
 * coleta que só conhece o nome literal morre calada no dia em que isso acontecer. Por isso o nome
 * preferido vem primeiro e um padrão tolerante vem depois: quem manda é o que `tools/list` devolveu.
 * `null` é "esta conta não tem isso" — quem chama decide se é o fim da pesquisa ou só uma parte dela.
 */
export function escolherFerramentas(disponiveis: string[]): { busca: string | null; markdown: string | null; linkedin: string | null; conjuntoDeDados: string | null; camposDataset: string | null } {
  const achar = (preferida: string, combina: (nome: string) => boolean) =>
    disponiveis.includes(preferida) ? preferida : (disponiveis.find(combina) ?? null);
  return {
    conjuntoDeDados: disponiveis.includes(FERRAMENTAS.conjuntoDeDados) ? FERRAMENTAS.conjuntoDeDados : null,
    camposDataset: disponiveis.includes("list_dataset_fields") ? "list_dataset_fields" : null,
    // `search_dataset` também casa com /search/, e ela é outra coisa: busca em conjunto de dados.
    busca: achar(FERRAMENTAS.busca, (n) => /search|busca/i.test(n) && !/dataset|batch/i.test(n)),
    markdown: achar(FERRAMENTAS.markdown, (n) => /markdown|scrape/i.test(n) && !/batch/i.test(n)),
    linkedin: achar(FERRAMENTAS.linkedin, (n) => /linkedin/i.test(n) && /person|profile|perfil/i.test(n)),
  };
}

/** Traduz o erro original; uma sondagem sem sessão mascararia a causa real. */
async function traduzir(conexao: ConexaoPesquisa, err: unknown): Promise<ErroPesquisa> {
  if (err instanceof ErroPesquisa) return err;
  return interpretarFalhaPesquisa(err instanceof ErroMCP ? err.status : 0, err instanceof ErroMCP ? err.detalhe : "Falha de conexão", conexao.token);
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
  const chamada = chamar(mcp(conexao), nome, argumentos).catch(async (err) => {
    console.error("Falha na pesquisa na web:", nome, semToken(err instanceof Error ? err.message : String(err), conexao.token));
    // O motivo importa: token recusado e cota esgotada param a pesquisa inteira, uma página que não
    // abriu só a deixa parcial. `traduzir` preserva o código da resposta original.
    throw await traduzir(conexao, err);
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
    // A chamada que PERDEU a corrida continua correndo e pode falhar sozinha daqui a meio minuto.
    // Sem este `catch` de cortesia, essa falha vira uma rejeição sem dono e derruba o processo.
    chamada.catch(() => {});
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
    return { ok: false, mensagem: (await traduzir(conexao, err)).message };
  }
  const faltando = FERRAMENTAS_NECESSARIAS.filter((f) => !ferramentas.includes(f.nome));
  if (faltando.length) {
    const lista = juntar(faltando.map((f) => f.rotulo));
    const verbo = faltando.length > 1 ? "estão disponíveis" : "está disponível";
    const saida = " O conector já usa pro=1. Confira as permissões e o plano da sua conta na Bright Data.";
    return { ok: false, mensagem: `Conectado, mas ${lista} não ${verbo} nesta conta.${saida}` };
  }
  const n = ferramentas.length;
  return { ok: true, mensagem: `Conectado. ${n} ${n === 1 ? "ferramenta disponível" : "ferramentas disponíveis"}.` };
}
