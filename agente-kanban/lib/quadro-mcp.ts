// Provedor de quadro que opera um servidor MCP externo (Jira, Notion, monday, outra instância
// deste app, ou qualquer servidor compatível) conectado no cartão "Quadro de tarefas (MCP)" do
// /setup. Implementa a mesma interface de lib/trello.ts/lib/quadro-demo.ts (ProvedorQuadro), mas
// sem conhecer de antemão os nomes das ferramentas do lado de lá: mapeia as cinco operações do
// agente (criar, mover, comentar, arquivar, listar) para uma ferramenta remota por aproximação de
// nome/descrição, com o resultado ajustável em Opções avançadas (ver components/MapeamentoMCP.tsx).
import type { Cartao, DadosNovoCartao, Lista, ProvedorQuadro, Quadro } from "./quadro";
import { chamar, conectar, listarFerramentas, type ConexaoMCP, type FerramentaMCP } from "./mcp-cliente";
import { getConfig, setConfig } from "./store";

export type OperacaoQuadro = "criar" | "mover" | "comentar" | "arquivar" | "listar";
export const OPERACOES: OperacaoQuadro[] = ["criar", "mover", "comentar", "arquivar", "listar"];

export const ROTULOS_OPERACAO: Record<OperacaoQuadro, string> = {
  criar: "Criar cartão",
  mover: "Mover cartão",
  comentar: "Comentar em um cartão",
  arquivar: "Arquivar cartão",
  listar: "Listar cartões do quadro",
};

// Palavras (radicais, não tokens inteiros) procuradas no nome+descrição de cada ferramenta remota
// para sugerir automaticamente qual delas corresponde a cada operação do agente.
const PALAVRAS_CHAVE: Record<OperacaoQuadro, string[]> = {
  criar: ["cria", "add", "new", "insert"],
  mover: ["mov", "status", "transi", "column", "coluna"],
  comentar: ["coment", "comment", "note"],
  arquivar: ["arquiv", "archiv", "delet", "exclu", "remov", "fech", "clos", "cancel"],
  listar: ["list", "board", "quadro", "obter", "get", "consult"],
};

function chaveMapa(op: OperacaoQuadro): string {
  return `MCP_TAREFAS_MAPA_${op.toUpperCase()}`;
}

export function conexaoAtual(): ConexaoMCP | null {
  const url = getConfig("MCP_TAREFAS_URL");
  if (!url) return null;
  return conectar(url, getConfig("MCP_TAREFAS_CODIGO"));
}

/** true quando um quadro de tarefas foi conectado via MCP; usado para decidir a precedência do provedor (MCP > Trello > quadro de exemplo). */
export function mcpTarefasConfigurado(): boolean {
  return Boolean(getConfig("MCP_TAREFAS_URL"));
}

export async function ferramentasDisponiveis(): Promise<FerramentaMCP[]> {
  const conexao = conexaoAtual();
  if (!conexao) return [];
  return listarFerramentas(conexao);
}

function pontuar(f: FerramentaMCP, op: OperacaoQuadro): number {
  const alvo = `${f.nome} ${f.descricao || ""}`.toLowerCase();
  return PALAVRAS_CHAVE[op].filter((p) => alvo.includes(p)).length;
}

/** Sugestão automática por nome/descrição das ferramentas do quadro conectado; usada quando ainda não há mapeamento salvo. */
export async function sugerirMapeamento(ferramentasCache?: FerramentaMCP[]): Promise<Record<OperacaoQuadro, string | null>> {
  const ferramentas = ferramentasCache ?? (await ferramentasDisponiveis());
  const mapa = {} as Record<OperacaoQuadro, string | null>;
  for (const op of OPERACOES) {
    let melhorNome: string | null = null;
    let melhorPontos = 0;
    for (const f of ferramentas) {
      const pontos = pontuar(f, op);
      if (pontos > melhorPontos) {
        melhorPontos = pontos;
        melhorNome = f.nome;
      }
    }
    mapa[op] = melhorNome ?? ferramentas[0]?.nome ?? null;
  }
  return mapa;
}

/** Mapeamento efetivo: o que foi salvo em Opções avançadas, completado pela sugestão automática nas operações ainda sem escolha salva. */
export async function mapeamentoAtual(ferramentasCache?: FerramentaMCP[]): Promise<Record<OperacaoQuadro, string | null>> {
  const salvo: Partial<Record<OperacaoQuadro, string>> = {};
  let faltaAlguma = false;
  for (const op of OPERACOES) {
    const valor = getConfig(chaveMapa(op));
    if (valor) salvo[op] = valor;
    else faltaAlguma = true;
  }
  const sugestao = faltaAlguma ? await sugerirMapeamento(ferramentasCache) : ({} as Record<OperacaoQuadro, string | null>);
  const mapa = {} as Record<OperacaoQuadro, string | null>;
  for (const op of OPERACOES) mapa[op] = salvo[op] ?? sugestao[op] ?? null;
  return mapa;
}

/** Salva a escolha manual do mapeamento (Opções avançadas); um valor vazio/nulo limpa a escolha salva (volta a usar a sugestão automática). */
export function salvarMapeamento(mapa: Partial<Record<OperacaoQuadro, string | null>>): void {
  for (const op of OPERACOES) {
    if (op in mapa) setConfig(chaveMapa(op), mapa[op] || null);
  }
}

// --- chamada da ferramenta remota mapeada ---

type SchemaObjeto = { properties?: Record<string, { type?: string }> };

// A maioria dos servidores MCP desta suíte (e vários assistentes de terceiros) expõe uma única
// ferramenta que aceita um comando em linguagem natural (ex.: "operar_quadro" deste próprio app).
// Quando o schema da ferramenta mapeada tiver uma propriedade com um desses nomes, o comando é
// enviado ali; senão, cai em "comando" como palpite razoável (a chamada then falha com uma
// mensagem clara do lado do servidor, em vez de silenciosamente não fazer nada).
const CHAVE_COMANDO = /coman|instru|mensa|message|texto|text|query|prompt/i;
const CHAVE_CONFIRMAR = /confirm/i;

function montarArgumentos(schema: unknown, comando: string): Record<string, unknown> {
  const propriedades = (schema && typeof schema === "object" ? (schema as SchemaObjeto).properties : undefined) || {};
  const chaves = Object.keys(propriedades);
  const chaveComando = chaves.find((k) => CHAVE_COMANDO.test(k)) || "comando";
  const args: Record<string, unknown> = { [chaveComando]: comando };
  const chaveConfirmar = chaves.find((k) => CHAVE_CONFIRMAR.test(k));
  if (chaveConfirmar) args[chaveConfirmar] = true;
  return args;
}

async function chamarOperacao(op: OperacaoQuadro, comando: string): Promise<unknown> {
  const conexao = conexaoAtual();
  if (!conexao) throw new Error("O quadro de tarefas (MCP) não está configurado. Conecte-o em /setup.");
  const ferramentas = await ferramentasDisponiveis();
  const mapa = await mapeamentoAtual(ferramentas);
  const nome = mapa[op];
  if (!nome) {
    throw new Error(
      `Nenhuma ferramenta do quadro conectado foi identificada para "${ROTULOS_OPERACAO[op]}". Ajuste o mapeamento em Opções avançadas, no cartão "Quadro de tarefas (MCP)".`
    );
  }
  const schema = ferramentas.find((f) => f.nome === nome)?.schema;
  return chamar(conexao, nome, montarArgumentos(schema, comando));
}

// --- leitura e extração do resultado bruto devolvido pela ferramenta remota ---

interface RespostaGenerica {
  quadro?: Quadro;
  alterados?: string[];
}

function comoRespostaGenerica(resultado: unknown): RespostaGenerica {
  return (resultado && typeof resultado === "object" ? resultado : {}) as RespostaGenerica;
}

function pareceQuadro(valor: unknown): valor is Quadro {
  return Boolean(valor && typeof valor === "object" && Array.isArray((valor as Quadro).listas));
}

function extrairQuadro(resultado: unknown): Quadro {
  const r = comoRespostaGenerica(resultado);
  if (pareceQuadro(r.quadro)) return r.quadro;
  if (pareceQuadro(resultado)) return resultado;
  throw new Error("O quadro conectado não devolveu uma lista de cartões reconhecível para esta ação.");
}

function extrairCartao(resultado: unknown, cartaoIdConhecido?: string): Cartao {
  const r = comoRespostaGenerica(resultado);
  if (pareceQuadro(r.quadro) && Array.isArray(r.alterados) && r.alterados.length > 0) {
    const id = r.alterados[r.alterados.length - 1];
    for (const lista of r.quadro.listas) {
      const achado = lista.cartoes.find((c) => c.id === id);
      if (achado) return achado;
    }
  }
  const direto = resultado as Partial<Cartao> | null | undefined;
  if (direto && typeof direto === "object" && typeof direto.id === "string" && typeof direto.nome === "string") {
    return {
      id: direto.id,
      nome: direto.nome,
      descricao: direto.descricao || "",
      responsavel: direto.responsavel || "",
      vencimento: direto.vencimento ?? null,
      atualizadoEm: direto.atualizadoEm || new Date().toISOString(),
      etiqueta: direto.etiqueta ?? null,
    };
  }
  if (cartaoIdConhecido) {
    return { id: cartaoIdConhecido, nome: cartaoIdConhecido, descricao: "", responsavel: "", vencimento: null, atualizadoEm: new Date().toISOString(), etiqueta: null };
  }
  throw new Error("O quadro conectado não devolveu o cartão esperado por esta ação.");
}

// Cache curto (memória do processo) do último "listar" bem-sucedido: uma única ação do agente
// (ex.: "mover") já precisa resolver o nome do cartão e o nome da lista antes de agir, e sem
// cache isso seriam duas idas e voltas ao quadro remoto só para montar o texto do comando —
// some com uma delas sem arriscar dados velhos, porque toda operação que muda algo (criar,
// mover, comentar, arquivar) invalida o cache antes de devolver (ver invalidarCache abaixo).
const CACHE_MS = 3000;
let cache: { url: string; valor: Quadro; expiraEm: number } | null = null;

function invalidarCache(): void {
  cache = null;
}

async function obterQuadro(): Promise<Quadro> {
  const conexao = conexaoAtual();
  if (conexao && cache && cache.url === conexao.url && cache.expiraEm > Date.now()) return cache.valor;
  const resultado = await chamarOperacao("listar", "Liste os cartões do quadro.");
  const quadro = extrairQuadro(resultado);
  if (conexao) cache = { url: conexao.url, valor: quadro, expiraEm: Date.now() + CACHE_MS };
  return quadro;
}

async function nomeDaLista(listaId: string): Promise<string> {
  const quadro = await obterQuadro();
  return quadro.listas.find((l) => l.id === listaId)?.nome || listaId;
}

async function nomeDoCartao(cartaoId: string): Promise<string> {
  const quadro = await obterQuadro();
  for (const lista of quadro.listas) {
    const achado = lista.cartoes.find((c) => c.id === cartaoId);
    if (achado) return achado.nome;
  }
  return cartaoId;
}

async function listarListas(): Promise<Lista[]> {
  const quadro = await obterQuadro();
  return quadro.listas.map(({ id, nome }) => ({ id, nome }));
}

async function listarCartoes(): Promise<Cartao[]> {
  const quadro = await obterQuadro();
  return quadro.listas.flatMap((l) => l.cartoes);
}

// Sem ponto final depois do nome do cartão/lista: o interpretador sem IA do próprio agente-kanban
// (ver lib/agente.ts, bloco "criar") só remove o texto do gatilho e da lista do comando, não a
// pontuação ao redor — um "." logo depois do nome vira parte do nome do cartão criado do lado de
// lá quando o quadro conectado é outra instância deste app sem uma chave de IA configurada.
async function criarCartao(dados: DadosNovoCartao): Promise<Cartao> {
  const lista = await nomeDaLista(dados.listaId);
  const partes = [`Crie um cartão para ${dados.nome} em ${lista}`];
  if (dados.vencimento) partes.push(`Prazo: ${dados.vencimento}`);
  const resultado = await chamarOperacao("criar", partes.join(", "));
  invalidarCache();
  return extrairCartao(resultado);
}

async function moverCartao({ cartaoId, listaId }: { cartaoId: string; listaId: string }): Promise<Cartao> {
  const [nome, lista] = await Promise.all([nomeDoCartao(cartaoId), nomeDaLista(listaId)]);
  const resultado = await chamarOperacao("mover", `Mova o cartão ${nome} para ${lista}`);
  invalidarCache();
  return extrairCartao(resultado, cartaoId);
}

async function atribuir(): Promise<Cartao> {
  throw new Error("Atribuir responsável ainda não está disponível para um quadro conectado por MCP.");
}

async function comentar({ cartaoId, texto }: { cartaoId: string; texto: string }): Promise<{ ok: true; comentarioId: string }> {
  const nome = await nomeDoCartao(cartaoId);
  await chamarOperacao("comentar", `Comente no cartão ${nome}: ${texto}`);
  invalidarCache();
  // O quadro conectado não devolve um id de comentário distinto (só o texto é enviado como comando);
  // este id é só um marcador interno, nunca reutilizável para reverter (ver suportaDesfazer abaixo).
  return { ok: true, comentarioId: `mcp:${cartaoId}:${Date.now()}` };
}

async function removerComentario(): Promise<{ ok: true }> {
  throw new Error("Este quadro conectado por MCP não oferece uma forma de remover comentário.");
}

async function arquivarCartao({ cartaoId }: { cartaoId: string }): Promise<{ ok: true }> {
  const nome = await nomeDoCartao(cartaoId);
  await chamarOperacao("arquivar", `Arquive o cartão ${nome}`);
  invalidarCache();
  return { ok: true };
}

/**
 * Criar e mover só são reversíveis se as ferramentas de arquivar/mover, respectivamente, estiverem
 * mapeadas (o Desfazer chama arquivarCartao/moverCartao de novo); comentar nunca é reversível aqui
 * porque não há uma sexta operação mapeada de "remover comentário" (só as cinco da US-072).
 */
async function suportaDesfazer(tipo: "criar_cartao" | "mover_cartao" | "comentar_cartao"): Promise<boolean> {
  if (tipo === "comentar_cartao") return false;
  const mapa = await mapeamentoAtual();
  if (tipo === "criar_cartao") return Boolean(mapa.arquivar);
  return Boolean(mapa.mover);
}

export const quadroMcp: ProvedorQuadro = {
  listarListas,
  listarCartoes,
  obterQuadro,
  criarCartao,
  moverCartao,
  atribuir,
  comentar,
  removerComentario,
  arquivarCartao,
  suportaDesfazer,
};
