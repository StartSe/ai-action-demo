// Cliente do Higgsfield (servidor MCP remoto, autorizado no cartão "Higgsfield" do /setup): lista os
// efeitos, envia a imagem do produto, pede o vídeo, acompanha o trabalho e consulta o saldo. As
// ferramentas são escolhidas pelo nome conhecido (presets_show, media_upload, media_import_url,
// generate_video, job_status, jobs_wait, show_generation_by_ids, balance) e, quando o servidor renomear
// alguma, por palavra-chave no nome (mesmo método de prospeccao-linkedin/lib/prospecthalo.ts). As respostas
// do lado de lá não são padronizadas: cada função procura os campos nas variantes mais comuns.
import { HIGGSFIELD, PREFIXO_HIGGSFIELD } from "./integracoes";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { conexaoAutorizada } from "./mcp-oauth";
import { integracaoConfigurada, lerConfig } from "./setup-comum";
import { EFEITOS, type Duracao, type EfeitoRemoto, type Formato, type Saldo } from "./types";

/** Falha ao falar com o Higgsfield (conexão, ferramenta não reconhecida, resposta em formato desconhecido). As rotas respondem 502. */
export class ErroHiggsfield extends Error {}

/** Higgsfield ainda não conectado em /setup: é configuração faltando, não falha do provedor. As rotas respondem 400. */
export class HiggsfieldNaoConectado extends ErroHiggsfield {}

export type OperacaoHiggsfield = "efeitos" | "enviarArquivo" | "confirmarArquivo" | "importarUrl" | "gerar" | "estado" | "esperar" | "resultado" | "saldo";

/** Nome conhecido de cada operação no Higgsfield e, quando ele não existir, as palavras que precisam aparecer no nome da ferramenta equivalente. */
export const FERRAMENTAS_HIGGSFIELD: Record<OperacaoHiggsfield, { nomes: string[]; palavras: string[] }> = {
  efeitos: { nomes: ["presets_show"], palavras: ["preset"] },
  enviarArquivo: { nomes: ["media_upload"], palavras: ["upload"] },
  confirmarArquivo: { nomes: ["media_confirm"], palavras: ["media", "confirm"] },
  importarUrl: { nomes: ["media_import_url"], palavras: ["import"] },
  gerar: { nomes: ["generate_video"], palavras: ["generate", "video"] },
  estado: { nomes: ["job_status"], palavras: ["job", "status"] },
  esperar: { nomes: ["jobs_wait"], palavras: ["wait"] },
  resultado: { nomes: ["show_generation_by_ids"], palavras: ["generation", "show"] },
  saldo: { nomes: ["balance"], palavras: ["balance"] },
};

const ROTULO_OPERACAO: Record<OperacaoHiggsfield, string> = {
  efeitos: "listar os efeitos",
  enviarArquivo: "receber a imagem",
  confirmarArquivo: "confirmar a imagem",
  importarUrl: "importar a imagem",
  gerar: "gerar o vídeo",
  estado: "informar o andamento",
  esperar: "informar o andamento",
  resultado: "entregar o vídeo",
  saldo: "informar o saldo",
};

/** Modelo do Higgsfield que anima uma imagem com um efeito da lista (preset_id). */
export const MODELO_EFEITOS = "higgsfield_preset";

/** Conexão aberta mais a lista de ferramentas remotas, para não listar de novo a cada chamada do mesmo fluxo. */
export type SessaoHiggsfield = { conexao: ConexaoMCP; ferramentas: FerramentaMCP[] };

export function higgsfieldConfigurado(): boolean {
  return integracaoConfigurada(HIGGSFIELD);
}

/** Conexão pronta: token do fluxo OAuth (renovado quando preciso) ou código colado à mão, com o endereço padrão quando nenhum foi salvo. */
async function conexaoAtual(): Promise<ConexaoMCP> {
  const autorizada = await conexaoAutorizada(PREFIXO_HIGGSFIELD);
  if (autorizada) return conectar(autorizada.url.replace(/^https:\/\/mcp\.higgsfield\.ai\/?$/, "https://mcp.higgsfield.ai/mcp"), autorizada.token);
  const config = lerConfig(HIGGSFIELD);
  const url = config[`${PREFIXO_HIGGSFIELD}_URL`];
  const codigo = config[`${PREFIXO_HIGGSFIELD}_CODIGO`];
  if (!url || !codigo) throw new HiggsfieldNaoConectado("Conecte o Higgsfield em Configurações antes de gerar o vídeo.");
  return conectar(url, codigo);
}

export async function abrirSessao(): Promise<SessaoHiggsfield> {
  const conexao = await conexaoAtual();
  try {
    return { conexao, ferramentas: await listarFerramentas(conexao) };
  } catch (err) {
    // A frase de lib/mcp-cliente.ts já é genérica ("o serviço", "o endereço"): repeti-la aqui produzia
    // duas frases seguidas dizendo a mesma coisa. O detalhe técnico fica no log.
    console.error("Falha ao abrir a sessão no Higgsfield", err);
    throw new ErroHiggsfield("Não foi possível falar com o Higgsfield. Autorize de novo em Configurações e tente outra vez.");
  }
}

/**
 * Escolhe a ferramenta remota de uma operação: primeiro pelo nome conhecido, depois pela que tem todas
 * as palavras-chave no nome (a mais curta vence: "generate_video" antes de "generate_video_batch").
 * Só o nome conta, porque as descrições do Higgsfield citam várias outras ferramentas.
 */
export function escolherFerramenta(op: OperacaoHiggsfield, ferramentas: FerramentaMCP[]): FerramentaMCP | null {
  const { nomes, palavras } = FERRAMENTAS_HIGGSFIELD[op];
  for (const nome of nomes) {
    const f = ferramentas.find((x) => x.nome === nome);
    if (f) return f;
  }
  const candidatas = ferramentas.filter((f) => palavras.every((p) => f.nome.toLowerCase().includes(p)));
  candidatas.sort((a, b) => a.nome.length - b.nome.length);
  return candidatas[0] ?? null;
}

type Bruto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Bruto {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Erro devolvido no conteúdo da resposta (o servidor MCP responde 200 com isError e um texto/JSON de erro). */
function erroNaResposta(resposta: unknown): string | undefined {
  if (!ehObjeto(resposta)) return undefined;
  const e = resposta.error ?? (resposta.ok === false ? resposta.message : undefined);
  if (typeof e === "string" && e.trim()) return e.trim();
  if (ehObjeto(e)) {
    const m = e.message ?? e.detail ?? e.error;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return undefined;
}

type Propriedade = { type?: string | string[] };
type SchemaObjeto = { properties?: Record<string, Propriedade> };

/**
 * Monta os argumentos casando os padrões (regex) com os nomes das propriedades declaradas no schema da
 * ferramenta; o primeiro padrão que casa vence. Sem schema declarado, usa o primeiro nome de cada padrão
 * (o nome conhecido do Higgsfield, ex.: "jobId").
 */
export function montarArgumentos(schema: unknown, candidatos: { padrao: RegExp; nomePadrao: string; valor: unknown }[]): Record<string, unknown> {
  const propriedades = ehObjeto(schema) ? (schema as SchemaObjeto).properties : undefined;
  const args: Record<string, unknown> = {};
  if (!propriedades || Object.keys(propriedades).length === 0) {
    for (const c of candidatos) if (c.valor !== undefined) args[c.nomePadrao] = c.valor;
    return args;
  }
  for (const [chave] of Object.entries(propriedades)) {
    const c = candidatos.find((x) => x.valor !== undefined && x.padrao.test(chave));
    if (c) args[chave] = c.valor;
  }
  return args;
}

/** Chama a ferramenta de uma operação; `opcional` devolve undefined quando o servidor não a expõe. */
async function chamarOperacao(sessao: SessaoHiggsfield, op: OperacaoHiggsfield, args: (schema: unknown) => Record<string, unknown>, opcional = false): Promise<unknown> {
  const ferramenta = escolherFerramenta(op, sessao.ferramentas);
  if (!ferramenta) {
    if (opcional) return undefined;
    // A lista de ferramentas do servidor remoto é informação da equipe técnica: vai para o log, nunca para a tela.
    console.error(`Higgsfield sem ferramenta para "${op}". Ferramentas expostas: ${sessao.ferramentas.map((f) => f.nome).join(", ") || "nenhuma"}.`);
    throw new ErroHiggsfield(`Esta conta do Higgsfield não oferece ${ROTULO_OPERACAO[op]}. Confira o plano dela e autorize de novo em Configurações.`);
  }
  let resposta: unknown;
  try {
    resposta = await chamar(sessao.conexao, ferramenta.nome, args(ferramenta.schema));
  } catch (err) {
    throw new ErroHiggsfield(`O Higgsfield não conseguiu ${ROTULO_OPERACAO[op]}: ${motivoEmPortugues(err instanceof Error ? err.message : "erro desconhecido")}`);
  }
  // Respostas de andamento trazem "error" como o motivo de um trabalho que falhou, não como falha da chamada:
  // quem interpreta é normalizarEstado.
  const erro = OPERACOES_COM_ERRO_NO_CORPO.has(op) ? undefined : erroNaResposta(resposta);
  if (erro) throw new ErroHiggsfield(`O Higgsfield não conseguiu ${ROTULO_OPERACAO[op]}: ${motivoEmPortugues(erro)}`);
  return resposta;
}

const OPERACOES_COM_ERRO_NO_CORPO = new Set<OperacaoHiggsfield>(["estado", "esperar", "resultado"]);

/** Traduz as mensagens de erro mais comuns do provedor; o resto volta entre aspas, para a pessoa saber o que o serviço disse. */
export function motivoEmPortugues(texto: string): string {
  const t = texto.trim();
  if (!t) return "o serviço não explicou o motivo.";
  if (/insufficient|not enough|no credits|balance/i.test(t)) return "créditos insuficientes na sua conta do Higgsfield.";
  if (/nsfw|safety|moderat|policy|prohibited/i.test(t)) return "o Higgsfield recusou o conteúdo pela política de uso da plataforma.";
  if (/unauthori|forbidden|invalid.*token|expired|401|403/i.test(t)) return "a autorização do Higgsfield expirou. Autorize de novo em Configurações.";
  if (/timeout|timed out/i.test(t)) return "o Higgsfield demorou demais para responder.";
  if (/not found|404/i.test(t)) return "o Higgsfield não encontrou o que foi pedido.";
  if (/rate limit|too many/i.test(t)) return "o Higgsfield recebeu pedidos demais em pouco tempo. Espere um minuto.";
  // O texto cru do provedor (em inglês, às vezes com dados do trabalho) fica só no log.
  console.error("Motivo não reconhecido do Higgsfield:", t.slice(0, 200));
  return "o Higgsfield não explicou o motivo. Tente de novo com outro efeito.";
}

// ---------------------------------------------------------------------------------------------------------
// Leitura das respostas
// ---------------------------------------------------------------------------------------------------------

function texto(item: Bruto, chaves: string[]): string {
  for (const chave of chaves) {
    const v = item[chave];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function numero(item: Bruto, chaves: string[]): number | undefined {
  for (const chave of chaves) {
    const v = item[chave];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** A lista de itens na resposta: a própria resposta ou uma das chaves comuns (um nível). */
function encontrarLista(resposta: unknown, chaves: string[]): unknown[] | null {
  if (Array.isArray(resposta)) return resposta;
  if (!ehObjeto(resposta)) return null;
  for (const chave of chaves) {
    const v = resposta[chave];
    if (Array.isArray(v)) return v;
  }
  return null;
}

/** Objeto onde procurar campos: a resposta, ou o primeiro item de jobs/results/data quando a resposta embrulha uma lista. */
function principal(resposta: unknown): Bruto {
  if (!ehObjeto(resposta)) return {};
  for (const chave of ["job", "data", "result", "generation", "media", "file"]) {
    if (ehObjeto(resposta[chave])) return { ...(resposta[chave] as Bruto), ...resposta };
  }
  for (const chave of ["jobs", "results", "generations", "files", "uploads", "items"]) {
    const lista = resposta[chave];
    if (Array.isArray(lista) && ehObjeto(lista[0])) return { ...(lista[0] as Bruto), ...resposta };
  }
  return resposta;
}

const CHAVES_JOB = ["job_id", "jobId", "generation_id", "generationId", "id"];
const CHAVES_MEDIA = ["media_id", "mediaId", "media", "file_id", "fileId", "id"];

function encontrarId(resposta: unknown, chaves: string[]): string | undefined {
  if (typeof resposta === "string" && resposta.trim() && !/\s/.test(resposta.trim()) && resposta.length <= 80) return resposta.trim();
  const p = principal(resposta);
  const direto = texto(p, chaves);
  if (direto) return direto;
  const ids = p.job_ids ?? p.ids ?? p.media_ids;
  if (Array.isArray(ids) && typeof ids[0] === "string") return ids[0];
  return undefined;
}

const CHAVE_NAO_VIDEO = /thumb|preview|poster|cover|image|photo|upload|input|source|avatar/i;
const CHAVE_VIDEO = /url|video|output|result|download|file|src/i;

/** Primeiro endereço https de vídeo na resposta (qualquer profundidade), pulando miniaturas e entradas. */
export function encontrarUrlVideo(valor: unknown, chave = "", profundidade = 0): string | undefined {
  if (profundidade > 6) return undefined;
  if (typeof valor === "string") {
    if (!/^https?:\/\//.test(valor)) return undefined;
    if (CHAVE_NAO_VIDEO.test(chave)) return undefined;
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(valor)) return valor;
    return CHAVE_VIDEO.test(chave) ? valor : undefined;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const u = encontrarUrlVideo(item, chave, profundidade + 1);
      if (u) return u;
    }
    return undefined;
  }
  if (ehObjeto(valor)) {
    // Primeiro as chaves que costumam trazer o arquivo final, depois o resto.
    const entradas = Object.entries(valor).sort(([a], [b]) => Number(CHAVE_VIDEO.test(b)) - Number(CHAVE_VIDEO.test(a)));
    for (const [k, v] of entradas) {
      if (CHAVE_NAO_VIDEO.test(k) && !CHAVE_VIDEO.test(k)) continue;
      const u = encontrarUrlVideo(v, k, profundidade + 1);
      if (u) return u;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Efeitos
// ---------------------------------------------------------------------------------------------------------

/** Converte a resposta de presets_show em EfeitoRemoto[]. */
export function normalizarEfeitos(resposta: unknown): EfeitoRemoto[] {
  const lista = encontrarLista(resposta, ["items", "presets", "effects", "results", "data"]);
  if (!lista) throw new ErroHiggsfield("O Higgsfield respondeu a lista de efeitos num formato que este app não reconhece.");
  const efeitos: EfeitoRemoto[] = [];
  for (const bruto of lista) {
    if (!ehObjeto(bruto)) continue;
    const id = texto(bruto, ["id", "preset_id", "presetId"]);
    const nome = texto(bruto, ["name", "nome", "title", "label"]) || id;
    if (!id) continue;
    const descricao = texto(bruto, ["description", "descricao", "summary"]) || undefined;
    const previewUrl = texto(bruto, ["preview_url", "previewUrl", "preview", "video_url"]) || undefined;
    efeitos.push({ id, nome: nome.trim(), descricao, previewUrl });
  }
  if (efeitos.length === 0) throw new ErroHiggsfield("O Higgsfield não devolveu nenhum efeito disponível para a sua conta.");
  return efeitos;
}

/** Lista os efeitos disponíveis no Higgsfield (substitui a lista interna quando conectado). */
export async function listarEfeitos(sessao: SessaoHiggsfield): Promise<EfeitoRemoto[]> {
  return normalizarEfeitos(await chamarOperacao(sessao, "efeitos", () => ({})));
}

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Palavras (em inglês, como os nomes do Higgsfield) que aproximam cada efeito interno de um efeito remoto, da mais específica para a mais genérica. */
export const SINONIMOS_EFEITOS: Record<(typeof EFEITOS)[number], string[]> = {
  "Zoom dramático": ["earth zoom in", "zoom in", "zoom", "dive", "push in"],
  "Giro do produto": ["orbit 360", "orbit", "360", "float spin", "spin", "rotate", "turntable", "3d render"],
  "Explosão de partículas": ["particle", "disintegration", "explosion", "burst", "shatter", "assemble", "android assemble"],
  "Câmera lenta": ["slow motion", "slow", "still world", "elevate", "float"],
  "Antes e depois": ["before and after", "before", "reveal", "sketch to fabric", "cgi breakdown", "transform", "morph"],
};

/** Efeito pelo identificador remoto ou pelo nome (sem acento, sem diferenciar maiúsculas). */
export function efeitoPorIdOuNome(idOuNome: string, efeitos: EfeitoRemoto[]): EfeitoRemoto | undefined {
  const alvo = semAcentos(idOuNome);
  return efeitos.find((e) => e.id === idOuNome.trim()) ?? efeitos.find((e) => semAcentos(e.nome) === alvo);
}

/**
 * Casa o efeito sugerido pela IA (um nome da lista interna, em português) com a lista remota: nome igual,
 * um nome contendo o outro, sinônimos em inglês do efeito interno e, por fim, o primeiro da lista.
 */
export function mapearEfeito(sugerido: string, efeitos: EfeitoRemoto[]): EfeitoRemoto {
  const exato = efeitoPorIdOuNome(sugerido, efeitos);
  if (exato) return exato;
  const alvo = semAcentos(sugerido);
  const parcial = efeitos.find((e) => alvo && (semAcentos(e.nome).includes(alvo) || alvo.includes(semAcentos(e.nome))));
  if (parcial) return parcial;
  const interno = (Object.keys(SINONIMOS_EFEITOS) as (keyof typeof SINONIMOS_EFEITOS)[]).find((e) => semAcentos(e) === alvo);
  if (interno) {
    for (const palavra of SINONIMOS_EFEITOS[interno]) {
      const achado = efeitos.find((e) => semAcentos(e.nome).includes(palavra) || semAcentos(e.descricao || "").includes(palavra));
      if (achado) return achado;
    }
  }
  return efeitos[0];
}

// ---------------------------------------------------------------------------------------------------------
// Imagem
// ---------------------------------------------------------------------------------------------------------

/** Separa uma data URL PNG/JPG em tipo e bytes. */
export function decodificarImagem(dataUrl: string): { mime: string; bytes: Buffer; nomeArquivo: string } {
  const m = /^data:(image\/png|image\/jpeg|image\/jpg);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new ErroHiggsfield("A imagem do produto precisa ser PNG ou JPG.");
  const mime = m[1] === "image/jpg" ? "image/jpeg" : m[1];
  return { mime, bytes: Buffer.from(m[2].replace(/\s/g, ""), "base64"), nomeArquivo: mime === "image/png" ? "produto.png" : "produto.jpg" };
}

/**
 * Envia a imagem do produto ao Higgsfield e devolve o identificador de mídia: pelo caminho de upload
 * (media_upload devolve um endereço para PUT dos bytes; media_confirm fecha o envio quando existe) ou, se o
 * servidor só oferecer importação por endereço, pela urlPublica desta imagem (só funciona com o app publicado).
 */
export async function enviarImagem(sessao: SessaoHiggsfield, dataUrl: string, urlPublica?: string): Promise<string> {
  const { mime, bytes, nomeArquivo } = decodificarImagem(dataUrl);
  const temUpload = escolherFerramenta("enviarArquivo", sessao.ferramentas);
  const temImportacao = escolherFerramenta("importarUrl", sessao.ferramentas);

  if (temUpload) {
    const resposta = await chamarOperacao(sessao, "enviarArquivo", (schema) =>
      montarArgumentos(schema, [
        { padrao: /^file_?name$/i, nomePadrao: "filename", valor: nomeArquivo },
        { padrao: /content_?type|mime/i, nomePadrao: "content_type", valor: mime },
        { padrao: /^method$/i, nomePadrao: "method", valor: "upload_url" },
      ]),
    );
    const p = principal(resposta);
    const uploadUrl = texto(p, ["upload_url", "uploadUrl", "presigned_url", "presignedUrl", "put_url", "url"]);
    let mediaId = encontrarId(resposta, CHAVES_MEDIA);
    if (!uploadUrl) throw new ErroHiggsfield("O Higgsfield não devolveu um endereço para receber a imagem.");
    if (!/^https?:\/\//.test(uploadUrl)) throw new ErroHiggsfield("O Higgsfield devolveu um endereço de envio inválido.");
    let envio: Response;
    try {
      envio = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      // "fetch failed" e o status HTTP são detalhe da equipe técnica: log, nunca tela (ver PADRAO.md).
      console.error("Falha de rede ao enviar a imagem ao Higgsfield", err);
      throw new ErroHiggsfield("Não foi possível enviar a imagem ao Higgsfield. Confira a conexão do servidor e tente de novo.");
    }
    if (!envio.ok) {
      console.error("O Higgsfield recusou a imagem:", envio.status, (await envio.text().catch(() => "")).slice(0, 200));
      throw new ErroHiggsfield("O Higgsfield recusou a imagem do produto. Tente com outra imagem, em PNG ou JPG.");
    }
    const confirmacao = await chamarOperacao(sessao, "confirmarArquivo", (schema) =>
      montarArgumentos(schema, [
        { padrao: /media_?ids|^ids$/i, nomePadrao: "media_ids", valor: mediaId ? [mediaId] : undefined },
        { padrao: /media_?id|file_?id|^id$/i, nomePadrao: "media_id", valor: mediaId },
      ]), true);
    if (confirmacao !== undefined) mediaId = encontrarId(confirmacao, CHAVES_MEDIA) ?? mediaId;
    if (!mediaId) throw new ErroHiggsfield("O Higgsfield recebeu a imagem, mas não devolveu o identificador dela.");
    return mediaId;
  }

  if (temImportacao) {
    if (!urlPublica || !/^https:\/\//.test(urlPublica)) {
      throw new ErroHiggsfield("Este servidor do Higgsfield só busca a imagem por um endereço público. Publique este app num endereço https e informe esse endereço em Configurações, na área da equipe técnica.");
    }
    const resposta = await chamarOperacao(sessao, "importarUrl", (schema) =>
      montarArgumentos(schema, [
        { padrao: /url|link|address/i, nomePadrao: "url", valor: urlPublica },
        { padrao: /^type$|media_?type|kind/i, nomePadrao: "type", valor: "image" },
      ]),
    );
    const mediaId = encontrarId(resposta, CHAVES_MEDIA);
    if (!mediaId) throw new ErroHiggsfield("O Higgsfield importou a imagem, mas não devolveu o identificador dela.");
    return mediaId;
  }

  console.error(`Higgsfield sem ferramenta de envio de imagem. Ferramentas expostas: ${sessao.ferramentas.map((f) => f.nome).join(", ") || "nenhuma"}.`);
  throw new ErroHiggsfield("Esta conta do Higgsfield não aceita receber a imagem do produto. Confira o plano dela e autorize de novo em Configurações.");
}

// ---------------------------------------------------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------------------------------------------------

export type PedidoVideo = { imagemId?: string; efeitoId: string; formato: Formato; duracaoSeg: Duracao; prompt: string };

function parametrosGeracao(pedido: PedidoVideo, somenteCusto: boolean): Record<string, unknown> {
  return {
    model: MODELO_EFEITOS,
    preset_id: pedido.efeitoId,
    prompt: pedido.prompt,
    aspect_ratio: pedido.formato,
    duration: pedido.duracaoSeg,
    ...(pedido.imagemId ? { medias: [{ role: "image", value: pedido.imagemId }] } : {}),
    ...(somenteCusto ? { get_cost: true } : { use_unlim: false }),
  };
}

/** Custo em créditos, procurado nas chaves comuns (inclusive dentro de cost/price/pricing). */
export function encontrarCusto(resposta: unknown): number | undefined {
  const p = principal(resposta);
  const direto = numero(p, ["cost", "credits", "price", "estimated_cost", "estimatedCost", "cost_credits", "credits_cost", "total_cost", "amount"]);
  if (direto !== undefined) return direto;
  for (const chave of ["cost", "price", "pricing", "estimate"]) {
    const v = p[chave];
    if (ehObjeto(v)) {
      const interno = numero(v, ["credits", "total", "amount", "value", "cost"]);
      if (interno !== undefined) return interno;
    }
  }
  return undefined;
}

/** Só o custo, sem criar trabalho (get_cost). Devolve undefined quando o provedor não informa. */
/**
 * Custo estimado em créditos, pedido sem criar trabalho (get_cost). Quando o Higgsfield não responde ou não
 * traz o número, devolve o motivo em português: sem ele o diálogo só dizia "não informado" e a pessoa
 * confirmava sem saber se o problema era dela ou do provedor.
 */
export async function custoVideo(sessao: SessaoHiggsfield, pedido: PedidoVideo): Promise<{ creditos?: number; motivo?: string }> {
  try {
    const resposta = await chamarOperacao(sessao, "gerar", () => ({ params: parametrosGeracao(pedido, true) }));
    const creditos = encontrarCusto(resposta);
    if (creditos === undefined) return { motivo: "O Higgsfield não informou o custo deste efeito antes de gerar." };
    return { creditos };
  } catch (err) {
    // A frase de chamarOperacao fala em "gerar o vídeo" (a operação é a mesma, com get_cost): usada aqui
    // ela diria que a geração falhou, o que não aconteceu. O detalhe técnico fica no log.
    console.error("Falha ao consultar o custo no Higgsfield", err);
    return { motivo: "O Higgsfield não respondeu à consulta de custo agora." };
  }
}

/** Cria o trabalho de geração e devolve o identificador dele (e o custo, quando informado). */
export async function gerarVideo(sessao: SessaoHiggsfield, pedido: PedidoVideo): Promise<{ jobId: string; custo?: number }> {
  const resposta = await chamarOperacao(sessao, "gerar", () => ({ params: parametrosGeracao(pedido, false) }));
  const jobId = encontrarId(resposta, CHAVES_JOB);
  if (!jobId) throw new ErroHiggsfield("O Higgsfield aceitou o pedido, mas não devolveu o identificador do vídeo.");
  return { jobId, custo: encontrarCusto(resposta) };
}

export type EstadoRemoto = { estado: "gerando" | "pronto" | "falhou"; url?: string; erro?: string; bruto: unknown };

/** Interpreta a resposta de job_status/jobs_wait: pronto, falhou ou ainda gerando, com o endereço do vídeo quando já houver. */
export function normalizarEstado(resposta: unknown): EstadoRemoto {
  const p = principal(resposta);
  const status = texto(p, ["status", "state", "stage", "phase"]).toLowerCase();
  const url = encontrarUrlVideo(resposta);
  const erro = erroNaResposta(p) || texto(p, ["error_message", "errorMessage", "failure_reason", "failureReason"]);
  const ok = p.all_terminal === true || p.completed === true || p.done === true;
  if (/complet|succe|done|ready|finish|terminal/.test(status) || (!status && (url || ok))) return { estado: "pronto", url, bruto: resposta };
  if (/fail|error|cancel|reject|abort/.test(status)) return { estado: "falhou", erro: erro || texto(p, ["reason", "message"]) || status, bruto: resposta };
  // Sem situação declarada e com um erro no corpo (ex.: trabalho não encontrado): falhou.
  if (!status && erro) return { estado: "falhou", erro, bruto: resposta };
  return { estado: "gerando", url, bruto: resposta };
}

/** Consulta o andamento de um trabalho (job_status; jobs_wait com espera zero quando o primeiro não existe). */
export async function estado(sessao: SessaoHiggsfield, jobId: string): Promise<EstadoRemoto> {
  const temStatus = escolherFerramenta("estado", sessao.ferramentas);
  if (temStatus) {
    const resposta = await chamarOperacao(sessao, "estado", (schema) =>
      montarArgumentos(schema, [{ padrao: /job_?id|generation_?id|^id$/i, nomePadrao: "jobId", valor: jobId }]),
    );
    return normalizarEstado(resposta);
  }
  const resposta = await chamarOperacao(sessao, "esperar", (schema) =>
    montarArgumentos(schema, [
      { padrao: /^jobs$|job_?ids/i, nomePadrao: "jobs", valor: [{ index: 0, job_id: jobId }] },
      { padrao: /timeout/i, nomePadrao: "timeout_seconds", valor: 0 },
    ]),
  );
  return normalizarEstado(resposta);
}

/** Endereço do vídeo pronto, quando o andamento não o trouxe (show_generation_by_ids). */
export async function urlDoResultado(sessao: SessaoHiggsfield, jobId: string): Promise<string | undefined> {
  const resposta = await chamarOperacao(sessao, "resultado", (schema) =>
    montarArgumentos(schema, [
      { padrao: /^jobs$/i, nomePadrao: "jobs", valor: [{ index: 0, job_id: jobId }] },
      { padrao: /job_?ids|^ids$/i, nomePadrao: "job_ids", valor: [jobId] },
      { padrao: /job_?id|^id$/i, nomePadrao: "job_id", valor: jobId },
    ]), true);
  return resposta === undefined ? undefined : encontrarUrlVideo(resposta);
}

/** Créditos e plano da conta (balance). */
export function normalizarSaldo(resposta: unknown): Saldo | null {
  const p = principal(resposta);
  const creditos = numero(p, ["credits", "balance", "credits_available", "available_credits", "remaining"]);
  if (creditos === undefined) return null;
  const plano = texto(p, ["subscription_plan_type", "plan", "plan_type", "subscription", "tier"]) || undefined;
  return { creditos, plano };
}

export async function saldo(sessao: SessaoHiggsfield): Promise<Saldo | null> {
  const resposta = await chamarOperacao(sessao, "saldo", () => ({}), true);
  return resposta === undefined ? null : normalizarSaldo(resposta);
}
