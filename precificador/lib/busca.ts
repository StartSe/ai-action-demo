// Busca na internet durante a conversa. Server-only.
//
// Por que existe um módulo à parte em vez de passar por lib/ai.ts: `askText` é infraestrutura da
// suíte, copiada sem alteração, e não aceita ferramenta de servidor. O que se reaproveita dela é o
// que importa — a chave por `getConfig`, a lista de modelos de reserva e a tradução de erro de
// `interpretarFalha`, para uma falha de busca falar a mesma língua de qualquer outra falha de IA.
//
// **Superfície**: `tools: [{ type: "openrouter:web_search" }]`, a ferramenta de servidor. O plugin
// `plugins: [{ id: "web" }]` e o sufixo `:online` estão **deprecados** na documentação consultada
// em 21/09/2026 ("The web search plugin and the `:online` variant are deprecated"), e o preço é o
// mesmo nas três. A ferramenta ainda está marcada como Beta, e é por isso que toda falha aqui é
// tratada como "siga sem a busca" em vez de derrubar a conversa.
//
// Ganho de verdade da ferramenta sobre o plugin: o plugin busca **sempre**, uma vez por requisição;
// a ferramenta deixa o modelo decidir, então uma conversa que não precisa de fato público nenhum
// não paga busca alguma.
//
// **Buscador**: preços por requisição, da mesma documentação:
//
//   | engine                  | preço    | idiomas                     |
//   |-------------------------|----------|-----------------------------|
//   | parallel `turbo`/`fast` | US$ 0,001| inglês e japonês            |
//   | parallel `basic`        | US$ 0,005| suporte amplo               |
//   | perplexity              | US$ 0,005| —                           |
//   | exa `auto`              | US$ 0,007| —                           |
//   | native                  | US$ 0,010 a 0,014, repassado |
//
// O `turbo` é o mais barato e **não serve**: este app pergunta em português sobre regra brasileira.
// O piso com suporte amplo de idioma é US$ 0,005, e a escolha dentro dessa faixa foi medida, não
// suposta. Mesma pergunta ("valor do DAS do MEI hoje e comissão do iFood"), em 21/09/2026:
//
//   | engine           | preço     | tempo | fontes brasileiras | fonte citada   |
//   |------------------|-----------|-------|--------------------|----------------|
//   | perplexity       | US$ 0,005 | 10 s  | 9 de 10            | portal gov.br  |
//   | parallel `basic` | US$ 0,005 | 14 s  | 8 de 10            | blog de banco  |
//   | exa `auto`       | US$ 0,007 | 13 s  | 9 de 10            | portal gov.br  |
//
// Fica o `perplexity`: o mais rápido da faixa mais barata, e o que foi buscar na fonte oficial.
import { FALLBACK_MODELS, interpretarFalha, ErroIA } from "./ai";
import { enderecoPublico } from "./setup-comum";
import { getConfig } from "./store";

const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** Quantos resultados entram no contexto por busca. */
const RESULTADOS = 5;
/** Caracteres por resultado. Segura o quanto de excerto entra no contexto — é aqui que o custo de
 * token mora, e não no preço da busca. */
const CARACTERES = 2000;
/** Teto de buscas numa resposta. O modelo decide se usa; isto impede que ele use demais. */
const MAX_BUSCAS = 2;

/** O buscador. Trocável por variável de ambiente para medir alternativas sem mexer no código. */
function engine(): string {
  return getConfig("OPENROUTER_BUSCA_ENGINE") || "perplexity";
}
function modo(): string | undefined {
  return getConfig("OPENROUTER_BUSCA_MODO") || undefined;
}

export type Fonte = { url: string; titulo: string };
export type RespostaComBusca = { texto: string; fontes: Fonte[]; buscas: number };

/** O buscador só é oferecido quando há chave; sem ela o app inteiro está em demonstração. */
export function buscaDisponivel(): boolean {
  return Boolean(getConfig("OPENROUTER_API_KEY"));
}

type Anotacao = { type?: string; url_citation?: { url?: string; title?: string } };

/** As citações que o OpenRouter devolve junto com a resposta, sem repetir endereço. */
export function lerFontes(anotacoes: unknown): Fonte[] {
  if (!Array.isArray(anotacoes)) return [];
  const vistas = new Set<string>();
  const fontes: Fonte[] = [];
  for (const a of anotacoes as Anotacao[]) {
    const url = a?.url_citation?.url;
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    let dominio = url;
    try {
      dominio = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // endereço estranho: fica o texto cru como rótulo
    }
    fontes.push({ url, titulo: a.url_citation?.title?.trim() || dominio });
  }
  return fontes;
}

/** A ferramenta de busca, pronta para entrar na lista de ferramentas de qualquer chamada. */
export function ferramentaDeBusca(): Record<string, unknown> {
  const parametros: Record<string, unknown> = { engine: engine(), max_results: RESULTADOS, max_characters: CARACTERES };
  const m = modo();
  if (m) parametros.mode = m;
  return { type: "openrouter:web_search", parameters: parametros };
}

export type MensagemChat =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaDeFerramenta[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChamadaDeFerramenta = { id: string; type: "function"; function: { name: string; arguments: string } };

export type RespostaBruta = {
  conteudo: string;
  chamadas: ChamadaDeFerramenta[];
  fontes: Fonte[];
  buscas: number;
  motivoDeParar: string;
};

/**
 * Uma chamada ao OpenRouter com ferramentas. A porta única deste app para o que `lib/ai.ts`
 * (infraestrutura congelada) não faz: ferramenta de servidor e laço de ferramentas do próprio app.
 *
 * Erro de rede ou do provedor sobe como `ErroIA`, igual ao resto do app.
 */
export async function completar({
  mensagens,
  ferramentas,
  model,
  maxTokens = 1600,
  temperature = 0.4,
  maxBuscas = MAX_BUSCAS,
}: {
  mensagens: MensagemChat[];
  ferramentas: Record<string, unknown>[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  maxBuscas?: number;
}): Promise<RespostaBruta> {
  const chave = getConfig("OPENROUTER_API_KEY");
  if (!chave) throw new ErroIA("chave_ausente", "Nenhuma chave da IA foi configurada. Conecte em Configurações.", 401, { rotulo: "Conectar a IA", url: "/setup#openrouter" });

  const reserva = (getConfig("OPENROUTER_FALLBACK_MODELS") || FALLBACK_MODELS.join(",")).split(",").map((m) => m.trim()).filter(Boolean);

  let res: Response;
  try {
    res = await fetch(URL_OPENROUTER, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        // O endereço vai no cabeçalho para o OpenRouter saber de onde vem a chamada; a montagem
        // do endereço público é a de lib/setup-comum.ts, nunca um literal solto.
        "HTTP-Referer": enderecoPublico() ?? "",
        "X-Title": getConfig("APP_NAME") || "IA para Executivos",
      },
      body: JSON.stringify({
        model,
        models: [model, ...reserva],
        messages: mensagens,
        max_tokens: maxTokens,
        temperature,
        ...(ferramentas.length ? { tools: ferramentas, max_tool_calls: maxBuscas } : {}),
      }),
    });
  } catch (err) {
    console.error("Falha de rede ao falar com a IA:", err);
    throw new ErroIA("rede", "Não foi possível falar com o serviço de IA. Confira a conexão do servidor e tente de novo.", 503);
  }

  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    throw interpretarFalha(res, detalhe);
  }

  const data = await res.json();
  const escolha = data?.choices?.[0];
  const mensagem = escolha?.message;
  if (!mensagem) throw new ErroIA("resposta_vazia", "A IA devolveu uma resposta vazia. Tente novamente.", 502);

  return {
    conteudo: String(mensagem.content || ""),
    chamadas: Array.isArray(mensagem.tool_calls) ? (mensagem.tool_calls as ChamadaDeFerramenta[]) : [],
    fontes: lerFontes(mensagem.annotations),
    buscas: Number(data?.usage?.server_tool_use?.web_search_requests) || 0,
    motivoDeParar: String(escolha.finish_reason || ""),
  };
}

/**
 * Uma resposta do modelo com a busca na internet à disposição dele, e nada mais.
 *
 * O modelo decide se busca. `buscas` volta com quantas ele fez — zero é comum e é o barato.
 */
export async function perguntarComBusca({
  system,
  prompt,
  model,
  maxTokens = 1600,
  temperature = 0.4,
}: {
  system: string;
  prompt: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<RespostaComBusca> {
  const r = await completar({
    mensagens: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    ferramentas: [ferramentaDeBusca()],
    model,
    maxTokens,
    temperature,
  });
  if (!r.conteudo) throw new ErroIA("resposta_vazia", "A IA devolveu uma resposta vazia. Tente novamente.", 502);
  return { texto: r.conteudo, fontes: r.fontes, buscas: r.buscas };
}
