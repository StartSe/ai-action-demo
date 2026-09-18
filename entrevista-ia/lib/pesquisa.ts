// A pesquisa do candidato na web, primeira metade: a COLETA (US-011).
//
// Aqui o app decide **o que procurar** e **o que vale a pena ler**; quem sabe falar com a Bright Data
// é lib/pesquisa-cliente.ts e quem transforma o que foi lido numa ficha é a consolidação (US-012).
// A divisão é de propósito: a regra de "esta página é da pessoa certa" precisa ser lida, discutida e
// testada sem servidor nenhum no meio.
//
// Três princípios que valem para todo este arquivo:
//
//  1. **Orçamento primeiro (P9).** No máximo 6 chamadas e 60 segundos por rodada, cada página cortada
//     em 20 mil caracteres. Estourou o que for, a coleta devolve o que já tem com `parcial: true` — a
//     pessoa de RH nunca fica olhando uma tela girando por causa de um site lento.
//  2. **Ruído não entra.** Uma vaga aberta com o nome do candidato, um agregador de contatos e o
//     perfil de um homônimo custam três chamadas e envenenam a ficha. Separar antes de ler é o que
//     torna o orçamento suficiente.
//  3. **Nada aqui decide identidade.** A coleta traz material e diz de onde ele veio; se é a pessoa
//     certa é pergunta da consolidação (US-012) e, em último caso, do gestor (D6).
import { ACAO_PESQUISA } from "./acoes";
import { adicionarFonte, obter as obterCandidato, removerFontes, type Candidato, type TipoFonteCandidato } from "./candidatos";
import {
  chamarFerramenta,
  conexaoBrightData,
  ErroPesquisa,
  escolherFerramentas,
  ferramentasDisponiveis,
  semToken,
  type CodigoErroPesquisa,
  type ConexaoPesquisa,
} from "./pesquisa-cliente";
import type { CampoFicha, Ficha } from "./types";

// ---------------------------------------------------------------------------------------------
// O orçamento (P9)
// ---------------------------------------------------------------------------------------------

/** Chamadas de ferramenta por rodada. `tools/list` não conta: é a lista do que a conta tem (guardada
 * por 10 minutos em lib/pesquisa-cliente.ts), não uma página trazida. */
export const MAX_CHAMADAS = 6;
/** Tempo total da rodada. Uma pesquisa em segundo plano pode demorar; uma que nunca termina, não. */
export const LIMITE_TOTAL_MS = 60_000;
/** Além do perfil profissional. Três páginas cobrem portfólio, repositório e uma notícia; a quarta
 * quase sempre é repetição da terceira. */
export const MAX_PAGINAS = 3;
/** Uma chamada precisa de pelo menos isto de prazo para valer a pena começar. */
const MARGEM_MS = 800;
export const LIMITE_CONSULTA = 200;

/** Falhas que param a pesquisa inteira: insistir nas próximas chamadas daria o mesmo erro e gastaria
 * o orçamento à toa. O resto (uma página que não abriu, um tempo estourado) deixa a coleta parcial. */
const FATAIS: CodigoErroPesquisa[] = ["nao_conectada", "token_invalido", "sem_cota", "ferramenta_ausente"];

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

/** Uma linha de resultado da busca, já normalizada — venha ela como JSON ou como texto de SERP. */
export type ResultadoBusca = { url: string; titulo: string; descricao: string; posicao: number };

/** Uma página efetivamente trazida e já gravada como `fonte_candidato`. */
export type PaginaColetada = {
  tipo: TipoFonteCandidato;
  url: string;
  titulo: string;
  conteudo: string;
  fonteId: string;
};

/**
 * O resultado de uma rodada de coleta.
 *
 * `status` é o que a pesquisa deve virar se parar aqui (a consolidação da US-012 pode transformar
 * `coletada` em `concluida` ou `sem_resultado`), e `motivo` é **texto de log**: ele explica o que
 * faltou para quem for depurar, nunca para a tela. Para a pessoa de RH existem quatro frases, e
 * "o `scrape_as_markdown` devolveu 502 na terceira página" não é nenhuma delas.
 */
export type Coleta = {
  status: "coletada" | "nao_pedida" | "sem_resultado" | "falhou";
  consulta: string;
  paginas: PaginaColetada[];
  /** Tudo que a busca devolveu, inclusive o que não foi lido. A consolidação (US-012) precisa disto
   * para montar as identidades possíveis: o segundo perfil que apareceu é o homônimo da D6. */
  resultados: ResultadoBusca[];
  parcial: boolean;
  chamadas: number;
  motivo?: string;
};

export type OpcoesColeta = {
  /** Injetada nos testes; `undefined` usa a conexão salva em Configurações. */
  conexao?: ConexaoPesquisa | null;
  /** Orçamento de tempo da rodada, para os testes não esperarem um minuto. */
  limiteMs?: number;
  maxPaginas?: number;
};

// ---------------------------------------------------------------------------------------------
// Texto: comparação tolerante de nomes
// ---------------------------------------------------------------------------------------------

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Preposições e partículas não identificam ninguém: "Ana de Souza" e "Ana Souza" são a mesma pessoa. */
const PARTICULAS = new Set(["de", "da", "do", "dos", "das", "e", "del", "di", "van", "von", "la", "le"]);

function tokensDoNome(nome: string): string[] {
  return normalizar(nome)
    .split(" ")
    .filter((t) => t.length > 1 && !PARTICULAS.has(t));
}

/**
 * O texto fala desta pessoa?
 *
 * A regra é o primeiro **e** o último nome presentes. Só o primeiro nome acha meio mundo ("Bruno" no
 * blog da empresa), e o nome completo exato deixa de fora o perfil que escreve "Bruno A. Alves" ou
 * a URL `linkedin.com/in/bruno-alves-cs`. Um nome de uma palavra só cai no que der.
 */
export function nomeBate(texto: string, nome: string): boolean {
  const tokens = tokensDoNome(nome);
  if (!tokens.length) return false;
  const alvo = ` ${normalizar(texto)} `;
  const tem = (t: string) => alvo.includes(` ${t} `);
  const primeiro = tokens[0];
  const ultimo = tokens[tokens.length - 1];
  return tem(primeiro) && tem(ultimo);
}

// ---------------------------------------------------------------------------------------------
// A consulta (AC1)
// ---------------------------------------------------------------------------------------------

/** Campo da ficha que NÃO veio da web. O que a pesquisa anterior afirmou não pode guiar a busca
 * seguinte: seria o app confirmando a si mesmo, inclusive quando errou de pessoa. */
function doCurriculo(ficha: Ficha | undefined, nome: "empresaAtual" | "cargoAtual" | "cidade"): string {
  const campo = ficha?.[nome] as CampoFicha<string> | undefined;
  if (!campo || campo.origem === "web") return "";
  return typeof campo.valor === "string" ? campo.valor : "";
}

/**
 * A consulta da busca, na ordem de prioridade da PRD: nome completo, termo de busca do gestor,
 * empresa atual, cargo atual, cidade.
 *
 * Cada pedaço só entra se ainda não estiver dito: quem escreveu "Órbita Software" no termo de busca
 * não precisa da empresa do currículo repetida na mesma frase, e consulta comprida devolve menos
 * resultado, não mais.
 */
export function montarConsulta(candidato: Candidato): string {
  const partes: string[] = [];
  const somar = (valor?: string) => {
    const limpo = (valor ?? "").replace(/\s+/g, " ").trim();
    if (!limpo) return;
    if (normalizar(partes.join(" ")).includes(normalizar(limpo))) return;
    partes.push(limpo);
  };
  somar(candidato.nome);
  somar(candidato.termoBusca);
  somar(doCurriculo(candidato.ficha, "empresaAtual"));
  somar(doCurriculo(candidato.ficha, "cargoAtual"));
  somar(doCurriculo(candidato.ficha, "cidade") || candidato.cidade);
  return partes.join(" ").slice(0, LIMITE_CONSULTA).trim();
}

// ---------------------------------------------------------------------------------------------
// Separar o que é da pessoa do que é ruído (AC2)
// ---------------------------------------------------------------------------------------------

/**
 * Domínios que nunca dizem nada sobre a pessoa, mesmo quando o nome dela aparece na página.
 *
 * Três famílias: quadro de vagas (a vaga em que ela se candidatou não é perfil dela), agregador de
 * contatos (mistura homônimos e vende o e-mail) e rede social pessoal (D3 do PRD: vida pessoal não
 * entra numa avaliação de trabalho, e o app não vai buscá-la de propósito).
 */
const RUIDO = [
  "vagas.com.br",
  "indeed.com",
  "br.indeed.com",
  "glassdoor.com",
  "glassdoor.com.br",
  "catho.com.br",
  "infojobs.com.br",
  "gupy.io",
  "trabalhabrasil.com.br",
  "empregos.com.br",
  "solides.com.br",
  "zoominfo.com",
  "rocketreach.co",
  "signalhire.com",
  "apollo.io",
  "lusha.com",
  "contactout.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "twitter.com",
  "x.com",
  "escavador.com",
  "jusbrasil.com.br",
  "consultasocio.com",
  "quatrorodas.com.br",
];

/** Onde um perfil profissional público costuma estar, e que por isso vem antes na fila das 3 páginas. */
const PREFERIDOS = [
  "github.com",
  "gitlab.com",
  "medium.com",
  "dev.to",
  "behance.net",
  "dribbble.com",
  "lattes.cnpq.br",
  "researchgate.net",
  "orcid.org",
  "scholar.google.com",
  "substack.com",
  "speakerdeck.com",
  "slideshare.net",
];

/** Páginas do próprio buscador, que aparecem no meio do resultado e não são conteúdo de ninguém. */
const DO_BUSCADOR = ["google.com", "google.com.br", "bing.com", "duckduckgo.com", "gstatic.com", "googleusercontent.com", "w3.org", "schema.org"];

function hostDe(url: string): { host: string; caminho: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), caminho: u.pathname.toLowerCase() };
  } catch {
    return null;
  }
}

function daLista(host: string, lista: string[]): boolean {
  return lista.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Onde este resultado se encaixa: o perfil profissional da pessoa, outra página dela, ou ruído.
 *
 * O casamento do nome vale inclusive para o LinkedIn: um perfil `/in/` de homônimo é exatamente o
 * erro que a D6 existe para evitar, e trazê-lo custaria uma chamada para depois ser descartado.
 */
export function classificar(resultado: ResultadoBusca, nome: string): "linkedin" | "pagina" | "ruido" {
  const alvo = hostDe(resultado.url);
  if (!alvo) return "ruido";
  const texto = `${resultado.titulo} ${resultado.descricao} ${resultado.url}`;
  if (daLista(alvo.host, ["linkedin.com"])) {
    // Só o perfil da pessoa: `/jobs/`, `/company/` e `/posts/` são a empresa ou o feed, não ela.
    return /^\/(in|pub)\//.test(alvo.caminho) && nomeBate(texto, nome) ? "linkedin" : "ruido";
  }
  if (daLista(alvo.host, RUIDO) || daLista(alvo.host, DO_BUSCADOR)) return "ruido";
  return nomeBate(texto, nome) ? "pagina" : "ruido";
}

/** Os resultados separados nos três baldes, com as páginas já na ordem em que serão lidas. */
export function separar(resultados: ResultadoBusca[], nome: string): { perfil: ResultadoBusca | null; paginas: ResultadoBusca[]; ruido: ResultadoBusca[] } {
  const perfis: ResultadoBusca[] = [];
  const paginas: ResultadoBusca[] = [];
  const ruido: ResultadoBusca[] = [];
  const vistos = new Set<string>();

  for (const r of resultados) {
    const alvo = hostDe(r.url);
    const chave = alvo ? `${alvo.host}${alvo.caminho.replace(/\/$/, "")}` : r.url;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const onde = classificar(r, nome);
    if (onde === "linkedin") perfis.push(r);
    else if (onde === "pagina") paginas.push(r);
    else ruido.push(r);
  }

  // Domínio de portfólio/repositório antes do resto; dentro do mesmo grupo, a ordem do buscador.
  paginas.sort((a, b) => {
    const pa = daLista(hostDe(a.url)?.host ?? "", PREFERIDOS) ? 0 : 1;
    const pb = daLista(hostDe(b.url)?.host ?? "", PREFERIDOS) ? 0 : 1;
    return pa - pb || a.posicao - b.posicao;
  });

  // Mais de um perfil `/in/` é justamente o caso de homônimo (D6): a coleta traz o primeiro e a
  // consolidação (US-012) recebe o resto como identidade possível.
  return { perfil: perfis[0] ?? null, paginas, ruido: [...ruido, ...perfis.slice(1)] };
}

// ---------------------------------------------------------------------------------------------
// Ler o que a busca devolveu
// ---------------------------------------------------------------------------------------------

function texto(valor: unknown, limite = 300): string {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== "string") return "";
  return valor.replace(/\s+/g, " ").trim().slice(0, limite);
}

function primeiraLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  if (!valor || typeof valor !== "object") return [];
  const dados = valor as Record<string, unknown>;
  for (const chave of ["organic", "organic_results", "results", "resultados", "items", "data", "content"]) {
    const dentro = dados[chave];
    if (Array.isArray(dentro)) return dentro;
    if (dentro && typeof dentro === "object") {
      const maisFundo = primeiraLista(dentro);
      if (maisFundo.length) return maisFundo;
    }
  }
  return [];
}

/** Links de uma página de resultados em Markdown, com o pedaço de texto que vem logo depois deles. */
function deTexto(bruto: string): ResultadoBusca[] {
  const achados: ResultadoBusca[] = [];
  const vistos = new Set<string>();
  const empurrar = (url: string, titulo: string, descricao: string) => {
    const limpo = url.replace(/[).,;'"]+$/, "");
    if (vistos.has(limpo)) return;
    vistos.add(limpo);
    achados.push({ url: limpo, titulo: texto(titulo), descricao: texto(descricao), posicao: achados.length });
  };

  for (const m of bruto.matchAll(/\[([^\]]{0,200})\]\((https?:\/\/[^\s)]+)\)/g)) {
    const depois = bruto.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 240);
    empurrar(m[2], m[1], depois);
  }
  for (const m of bruto.matchAll(/(?<![[(])https?:\/\/[^\s<>"')\]]+/g)) {
    empurrar(m[0], "", bruto.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 240));
  }
  return achados;
}

/**
 * Os resultados da busca, venha o que vier.
 *
 * A mesma ferramenta devolve JSON numa conta e a página de resultados em Markdown noutra, e o nome
 * dos campos muda entre buscadores (`link`/`url`, `snippet`/`description`). Um leitor tolerante custa
 * trinta linhas; descobrir em produção que a pesquisa devolve zero porque o campo virou `href` custa
 * uma história inteira.
 */
export function lerResultados(bruto: unknown): ResultadoBusca[] {
  if (typeof bruto === "string") return deTexto(bruto);
  const lista = primeiraLista(bruto);
  const achados: ResultadoBusca[] = [];
  for (const item of lista) {
    if (typeof item === "string") {
      achados.push(...deTexto(item));
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const dados = item as Record<string, unknown>;
    const url = texto(dados.url ?? dados.link ?? dados.href ?? dados.endereco, 2000);
    if (!url || !hostDe(url)) continue;
    achados.push({
      url,
      titulo: texto(dados.title ?? dados.titulo ?? dados.name ?? dados.nome),
      descricao: texto(dados.description ?? dados.snippet ?? dados.descricao ?? dados.resumo ?? dados.summary),
      posicao: achados.length,
    });
  }
  return achados;
}

/** O que a ferramenta devolveu, como texto para a consolidação ler. JSON de perfil vira JSON legível:
 * cortar campos aqui seria escolher, antes da IA, o que ela pode considerar. */
function comoTexto(bruto: unknown): string {
  if (typeof bruto === "string") return bruto;
  if (bruto === null || bruto === undefined) return "";
  try {
    return JSON.stringify(bruto, null, 2);
  } catch {
    return String(bruto);
  }
}

function tituloDoPerfil(bruto: unknown, nome: string): string {
  const dados = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | null;
  const pessoa = texto(dados?.name ?? dados?.full_name ?? dados?.nome, 120) || nome;
  const cargo = texto(dados?.position ?? dados?.headline ?? dados?.title, 120);
  return cargo ? `${pessoa} — ${cargo} (LinkedIn)` : `${pessoa} (LinkedIn)`;
}

// ---------------------------------------------------------------------------------------------
// A coleta
// ---------------------------------------------------------------------------------------------

function vazia(status: Coleta["status"], consulta: string, motivo?: string): Coleta {
  return { status, consulta, paginas: [], resultados: [], parcial: false, chamadas: 0, motivo };
}

/**
 * Procura o candidato na web e guarda as páginas encontradas como fontes dele.
 *
 * O que ela **não** faz: não escreve em `candidatos.pesquisaStatus` (quem conduz a rodada é
 * `pesquisarCandidato()`, US-012), não lê o que trouxe e não decide quem é a pessoa. Ela responde a
 * uma pergunta só: "o que dá para trazer sobre esta pessoa, dentro do orçamento?".
 *
 * Só levanta erro no que impede qualquer pesquisa (código de acesso recusado, conta sem crédito,
 * busca indisponível). Tudo mais — uma página que não abriu, o tempo que acabou — volta como
 * `parcial: true` com o motivo no log: metade do material é melhor que nenhum.
 */
export async function coletar(candidatoId: string, opcoes: OpcoesColeta = {}): Promise<Coleta> {
  const candidato = obterCandidato(candidatoId);
  if (!candidato) return vazia("nao_pedida", "", "candidato não encontrado");

  const conexao = opcoes.conexao === undefined ? conexaoBrightData() : opcoes.conexao;
  if (!conexao) return vazia("nao_pedida", "", "a pesquisa na web ainda não foi conectada");

  // Sem currículo, sem termo de busca e sem perfil, o que existe é um nome — e um nome sozinho traz
  // homônimos, não a pessoa. A pesquisa não roda; a tela pede um dos três (D6).
  if (!candidato.temCvTexto && !candidato.termoBusca && !candidato.linkedinUrl) {
    return vazia("nao_pedida", "", "sem currículo, sem termo de busca e sem perfil não há como separar homônimos");
  }

  return coletarDe(candidato, conexao, opcoes);
}

async function coletarDe(candidato: Candidato, conexao: ConexaoPesquisa, opcoes: OpcoesColeta): Promise<Coleta> {
  const consulta = montarConsulta(candidato);
  const ferramentas = escolherFerramentas(await ferramentasDisponiveis({ conexao }));

  // Sem busca e sem perfil direto não sobra caminho nenhum: isto é configuração da conta, e a pessoa
  // precisa saber (ao contrário de uma página que não abriu).
  if (!ferramentas.busca && !(ferramentas.linkedin && candidato.linkedinUrl)) {
    throw new ErroPesquisa(
      "ferramenta_ausente",
      "A busca na web não está disponível nesta conta da Bright Data. Confira o plano e o modo avançado em Configurações.",
      400,
      { acao: ACAO_PESQUISA },
    );
  }

  const limiteTotal = opcoes.limiteMs ?? LIMITE_TOTAL_MS;
  const maxPaginas = opcoes.maxPaginas ?? MAX_PAGINAS;
  // O relógio da rodada inteira. Cada chamada recebe o que sobrou dele, e nunca mais que isso.
  const relogio = AbortSignal.timeout(limiteTotal);
  const fim = Date.now() + limiteTotal;
  const restante = () => fim - Date.now();

  const paginas: PaginaColetada[] = [];
  let chamadas = 0;
  let parcial = false;
  let motivo: string | undefined;

  const anotar = (frase: string) => {
    parcial = true;
    if (!motivo) motivo = frase;
  };

  /** Uma chamada de ferramenta dentro do orçamento. `null` = não deu (e a coleta já ficou parcial). */
  const chamar = async (nome: string, argumentos: Record<string, unknown>, oQue: string): Promise<unknown | null> => {
    if (chamadas >= MAX_CHAMADAS) {
      anotar(`o limite de ${MAX_CHAMADAS} chamadas acabou antes de ${oQue}`);
      return null;
    }
    if (relogio.aborted || restante() <= MARGEM_MS) {
      anotar(`o tempo da pesquisa acabou antes de ${oQue}`);
      return null;
    }
    chamadas++;
    try {
      return await chamarFerramenta(nome, argumentos, { conexao, limiteMs: restante() });
    } catch (err) {
      if (err instanceof ErroPesquisa && FATAIS.includes(err.codigo)) throw err;
      anotar(err instanceof ErroPesquisa && err.codigo === "demorou" ? `${oQue} estourou o tempo da pesquisa` : `${oQue} não deu certo`);
      console.error("Pesquisa na web:", oQue, semToken(err instanceof Error ? err.message : String(err), conexao.token));
      return null;
    }
  };

  // As fontes da rodada anterior só saem quando a nova tem o que pôr no lugar: uma pesquisa que não
  // trouxe nada não pode apagar a que tinha trazido.
  let limpou = false;
  const guardar = (tipo: TipoFonteCandidato, url: string, titulo: string, conteudo: string) => {
    if (!limpou) {
      for (const antigo of ["linkedin", "busca", "pagina"] as const) removerFontes(candidato.id, antigo);
      limpou = true;
    }
    // `resumo` fica vazio de propósito: são duas frases que a consolidação escreve (US-012).
    const fonte = adicionarFonte({ candidatoId: candidato.id, tipo, url, titulo, conteudo });
    paginas.push({ tipo, url, titulo, conteudo: fonte.conteudo, fonteId: fonte.id });
  };

  const trazerPerfil = async (url: string) => {
    if (!ferramentas.linkedin) {
      anotar("a leitura do perfil profissional não está disponível nesta conta");
      return;
    }
    const bruto = await chamar(ferramentas.linkedin, { url }, "a leitura do perfil profissional");
    const conteudo = comoTexto(bruto);
    if (!conteudo.trim()) return;
    guardar("linkedin", url, tituloDoPerfil(bruto, candidato.nome), conteudo);
  };

  // (1) Perfil informado pelo gestor: vai direto pela ferramenta de perfil, sem gastar a busca para
  // descobrir o endereço que já está cadastrado.
  const perfilInformado = candidato.linkedinUrl ?? "";
  if (perfilInformado) await trazerPerfil(perfilInformado);

  // (2) A busca, que descobre o perfil (quando não informado) e as outras páginas da pessoa.
  let resultados: ResultadoBusca[] = [];
  if (ferramentas.busca && consulta) {
    const bruto = await chamar(ferramentas.busca, { query: consulta, engine: "google" }, "a busca na web");
    if (bruto !== null) resultados = lerResultados(bruto);
  }
  const { perfil, paginas: candidatas } = separar(resultados, candidato.nome);

  // (3) O perfil achado na busca, quando o gestor não informou nenhum.
  if (!perfilInformado && perfil) await trazerPerfil(perfil.url);

  // (4) Até três outras páginas, como Markdown.
  const outras = candidatas.filter((r) => r.url !== perfilInformado && r.url !== perfil?.url).slice(0, maxPaginas);
  const markdown = ferramentas.markdown;
  if (!markdown) {
    if (outras.length) anotar("a leitura de páginas não está disponível nesta conta");
  } else {
    for (const pagina of outras) {
      const bruto = await chamar(markdown, { url: pagina.url }, `a leitura de ${pagina.url}`);
      const conteudo = comoTexto(bruto);
      if (!conteudo.trim()) continue;
      guardar("pagina", pagina.url, pagina.titulo || pagina.url, conteudo);
    }
  }

  if (parcial) console.error("Pesquisa na web parcial para o candidato", candidato.id, "—", motivo);

  const status: Coleta["status"] = paginas.length ? "coletada" : parcial ? "falhou" : "sem_resultado";
  return { status, consulta, paginas, resultados, parcial, chamadas, motivo };
}
